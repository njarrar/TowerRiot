import Foundation

/// The battle: a headless, deterministic simulation of one stage.
///
/// A line-for-line port of the web engine (`src/game/sim.ts`). It uses the same random source,
/// the same order of operations and the same rounding, so a given seed and set of moves gives
/// exactly the same battle on iOS as on the web. `BotParityTests` checks this on all 20 stages.
/// The renderer reads its state and drains `events` each frame; the UI calls its command methods.
public final class Battle {
    public static let waveGap = 22.0
    /// Any tower sees hidden foes this close.
    public static let towerSight = 130.0
    public static let lighthouseRange = 380.0
    static let elements: [Element] = [.pierce, .fire, .frost, .storm, .nature]

    /// Share of each wave group sent on wave n of total: 55% on the first wave, all of it on the last.
    public static func waveRamp(_ n: Int, _ total: Int) -> Double {
        total <= 1 ? 1 : 0.55 + 0.45 * Double(n - 1) / Double(total - 1)
    }

    public let data: GameData
    public let stage: StageDef
    public let mods: Mods
    public let roads: [RoadRt]
    public let spawns: [(id: String, roads: [RoadRt])]
    public private(set) var plots: [PlotRt]
    public let gate: [Vec]
    public let startLives: Int
    public let scale: Double
    private var rng: Rng

    public private(set) var status: Status = .prep
    public private(set) var gold: Int
    public private(set) var lives: Int
    /// Seconds since the first wave was called.
    public private(set) var clock = 0.0
    /// Waves started so far (1-based number of the current wave).
    public private(set) var wave = 0
    /// Seconds before the next wave starts on its own. Nil while a wave is still spawning.
    public private(set) var nextIn: Double?
    public private(set) var night = false
    public var speed = 1.0
    public var paused = false

    public private(set) var foes: [Foe] = []
    public private(set) var towers: [Tower] = []
    public private(set) var shots: [Shot] = []
    public private(set) var clouds: [Cloud] = []
    public private(set) var vents: [VentRt] = []
    public private(set) var hero: HeroState
    public private(set) var rune: RuneState?
    public private(set) var nextRune: Double
    public private(set) var resist: [Element: Double] = [:]
    private var dmgWindow: [Element: Double] = [:]
    public private(set) var events: [BattleEvent] = []
    public private(set) var kills = 0
    public private(set) var leaks = 0

    private struct Queued { let at: Double; let kind: EnemyKind; let spawn: String? }
    private var queue: [Queued] = []
    private var waveT = 0.0
    private var ids = 1
    private var shiftShift = 0.0
    private var leakedThisWave = false
    private var threatDirty = true
    private var threat: [ObjectIdentifier: Double] = [:]
    private var shiftOn: [Bool]

    public init(stage: StageDef, mods: Mods = Mods(), seed: Int = 1234, data: GameData = .shared) {
        self.data = data
        self.stage = stage
        self.mods = mods
        rng = Rng(seed: seed)
        scale = hpScale(stage.id) * (stage.hpMul ?? 1)
        let scale = self.scale
        roads = stage.roads.map { def in
            let path = Path(id: def.id, pts: smooth(def.ctrl))
            let rt = RoadRt(def: def, path: path)
            for s in stage.shifts ?? [] where s.closes.contains(def.id) { rt.closeAt = path.nearestDistance(to: s.at) }
            for b in stage.barriers ?? [] where b.road == def.id {
                let p = path.point(at: path.tot * b.at)
                rt.barrier = .init(hp: b.hp * scale, max: b.hp * scale, d: path.tot * b.at, x: p.x, y: p.y)
            }
            for b in stage.belts ?? [] where b.road == def.id { rt.belts.append(.init(from: path.tot * b.from, to: path.tot * b.to, mult: b.mult)) }
            return rt
        }
        let roads = self.roads
        for v in stage.vents ?? [] {
            guard let road = roads.first(where: { $0.def.id == v.road }) else { continue }
            let d = road.path.tot * v.at, p = road.path.point(at: d)
            vents.append(VentRt(x: p.x, y: p.y, road: road, d: d, every: v.every, t: v.every, dmg: v.dmg))
        }
        spawns = stage.spawns.map { s in (s.id, s.roads.compactMap { r in roads.first { $0.def.id == r.id } }) }
        plots = stage.plots.map { p in
            PlotRt(x: p.at.x, y: p.at.y, high: stage.high.map { inPolygon(p.at, $0) } ?? false, gear: p.gear)
        }
        var ends: [(key: String, at: Vec)] = []
        for r in roads {
            let e = r.path.pts[r.path.pts.count - 1]
            let key = "\(Int(jsRound(e.x))),\(Int(jsRound(e.y)))"
            if let i = ends.firstIndex(where: { $0.key == key }) { ends[i].at = e } else { ends.append((key, e)) }
        }
        gate = ends.map(\.at)
        startLives = stage.lives + mods.lives
        lives = startLives
        gold = stage.startGold + mods.gold
        nextRune = data.runeFirst
        shiftOn = (stage.shifts ?? []).map { _ in false }
        let lvl = 1 + mods.heroLevel
        let s = Battle.heroStartPoint(stage: stage, roads: roads, gate: gate)
        hero = HeroState(x: s.x, y: s.y, tx: s.x, ty: s.y, anchorX: s.x, anchorY: s.y, level: lvl, points: lvl + mods.heroSkillPoints)
        for e in Element.allCases { resist[e] = 0; dmgWindow[e] = 0 }
        hero.hp = heroMaxHp()
        applyGears(1)
    }

    /// Where Wren starts. A start placed by the gate moves out to the main road, past its middle,
    /// so she meets the first foes and earns XP from the start.
    private static func heroStartPoint(stage: StageDef, roads: [RoadRt], gate: [Vec]) -> Vec {
        let st = stage.heroStart
        if !gate.contains(where: { hypot2($0.x - st.x, $0.y - st.y) < 300 }) { return st }
        let r = roads.stableSorted { $0.path.tot > $1.path.tot }[0]
        let p = r.path.point(at: r.path.tot * 0.62)
        return Vec(p.x, p.y)
    }

    // MARK: - commands

    public struct WavePreview { public let n: Int; public let hint: String; public let foes: [(kind: EnemyKind, count: Int)] }

    /// What the next wave will send, after the early-wave ramp. Nil once every wave has started.
    public func nextWave() -> WavePreview? {
        let n = wave + 1
        guard n <= totalWaves else { return nil }
        let w = stage.waves[n - 1], ramp = Battle.waveRamp(n, totalWaves)
        var foes: [(kind: EnemyKind, count: Int)] = []
        for g in w.groups {
            let count = max(1, Int(jsRound(Double(g.n) * ramp)))
            if let i = foes.firstIndex(where: { $0.kind == g.kind }) { foes[i].count += count } else { foes.append((g.kind, count)) }
        }
        return WavePreview(n: n, hint: w.hint, foes: foes)
    }

    /// True if the Hollow adapts when wave `n` starts.
    public func adaptsAt(_ n: Int) -> Bool {
        let every = stage.adaptEvery ?? 3
        return n > 1 && n <= totalWaves && (n - 1) % every == 0
    }

    /// The element the Hollow would harden against if it adapted now, if any.
    public func adaptLean() -> Element? {
        var total = 0.0
        var top: Element?
        for e in Battle.elements {
            total += dmgWindow[e]!
            if top == nil || dmgWindow[e]! > dmgWindow[top!]! { top = e }
        }
        if let top, total > 0 && dmgWindow[top]! / total > 0.3 { return top }
        return nil
    }

    public var totalWaves: Int { stage.waves.count }
    public var over: Bool { status == .won || status == .lost }

    /// Start the next wave. Early calls pay gold for the time saved.
    @discardableResult
    public func callWave() -> Bool {
        if over || wave >= totalWaves { return false }
        if status == .running && nextIn == nil { return false }
        if status == .running, let n = nextIn, n > 0 {
            let bonus = Int((n * 2 * (1 + mods.early)).rounded(.up))
            gold += bonus
            events.append(.early(gold: bonus))
        }
        status = .running
        startWave()
        return true
    }

    /// The early-call bonus right now, for the wave button.
    public var earlyBonus: Int { Int(((nextIn ?? 0) * 2 * (1 + mods.early)).rounded(.up)) }

    public func costOf(_ kind: TowerKind, level: Int = 1) -> Int {
        Int(jsRound(data.tower(kind).cost[level - 1] * (1 + mods.costMul)))
    }

    public func splitCost(_ kind: TowerKind, _ which: SplitId) -> Int {
        let s = data.tower(kind).splits.first { $0.id == which }!
        return Int(jsRound(s.cost * (1 + mods.costMul)))
    }

    public func canBuild(plot: Int, kind: TowerKind) -> Bool {
        guard plot >= 0, plot < plots.count, !plots[plot].sunk else { return false }
        return stage.towers.contains(kind) && !towers.contains { $0.plot == plot } && gold >= costOf(kind)
    }

    @discardableResult
    public func build(plot: Int, kind: TowerKind) -> Tower? {
        guard canBuild(plot: plot, kind: kind) else { return nil }
        let p = plots[plot], cost = costOf(kind)
        gold -= cost
        let t = Tower(id: nextId(), kind: kind, plot: plot, x: p.x, y: p.y, spent: cost, high: p.high)
        if let g = p.gear { t.down = !gearUp(g) }
        towers.append(t)
        threatDirty = true
        events.append(.build(tower: t.id, x: t.x, y: t.y))
        return t
    }

    public func upgradeCost(_ t: Tower) -> Int? { t.lv < 3 ? costOf(t.kind, level: t.lv + 1) : nil }

    @discardableResult
    public func upgrade(_ id: Int) -> Bool {
        guard let t = tower(id), let c = upgradeCost(t), gold >= c else { return false }
        gold -= c; t.spent += c; t.lv += 1
        threatDirty = true
        events.append(.upgrade(tower: t.id, x: t.x, y: t.y))
        return true
    }

    @discardableResult
    public func splitTower(_ id: Int, _ which: SplitId) -> Bool {
        guard let t = tower(id), t.lv == 3, mods.splits else { return false }
        let c = splitCost(t.kind, which)
        if gold < c { return false }
        gold -= c; t.spent += c; t.lv = 4; t.split = which
        threatDirty = true
        events.append(.upgrade(tower: t.id, x: t.x, y: t.y))
        return true
    }

    public func sellValue(_ t: Tower) -> Int { Int((Double(t.spent) * (0.7 + mods.sell)).rounded(.down)) }

    @discardableResult
    public func sell(_ id: Int) -> Bool {
        guard let t = tower(id) else { return false }
        gold += sellValue(t)
        towers.removeAll { $0 === t }
        threatDirty = true
        events.append(.sell(tower: t.id, x: t.x, y: t.y))
        return true
    }

    public func setMode(_ id: Int, _ mode: TargetMode) { tower(id)?.mode = mode }

    public func setRound(_ id: Int, _ round: Rounds?) {
        guard let t = tower(id) else { return }
        if (round == nil || mods.rounds.contains(round!)) && t.kind != .beacon && t.kind != .bell { t.round = round }
    }

    public func tower(_ id: Int) -> Tower? { towers.first { $0.id == id } }

    /// Send Wren to a point. She holds there and fights what comes.
    public func moveHero(x: Double, y: Double) {
        if hero.dead { return }
        hero.tx = clamp(x, 20, 1260); hero.ty = clamp(y, 50, 705)
        hero.anchorX = hero.tx; hero.anchorY = hero.ty
        hero.focus = nil
    }

    /// Tell Wren to fight one foe.
    public func attackFoe(_ id: Int) {
        guard let f = foes.first(where: { $0.id == id }), !hero.dead else { return }
        hero.focus = id
        hero.anchorX = f.x; hero.anchorY = f.y
    }

    public func canLearn(_ key: SkillKey) -> Bool {
        let s = data.skill(key), r = hero.rank(key)
        if hero.points < 1 || r >= s.maxRank { return false }
        if key == .w && !mods.skillW { return false }
        if key == .r && !mods.skillR { return false }
        return hero.level >= s.needLevel[r]
    }

    @discardableResult
    public func learn(_ key: SkillKey) -> Bool {
        guard canLearn(key) else { return false }
        hero.points -= 1
        hero.ranks[key, default: 0] += 1
        return true
    }

    /// Spend free points the way most players would: ultimate first, then Q, E and W in turn.
    public func autoLearn() {
        let order: [SkillKey] = [.r, .q, .e, .w, .q, .e, .w]
        var guardLeft = 40
        while hero.points > 0 && guardLeft > 0 {
            guardLeft -= 1
            guard let k = order.first(where: canLearn) ?? SkillKey.allCases.first(where: canLearn) else { break }
            learn(k)
        }
    }

    public func skillReady(_ key: SkillKey) -> Bool {
        !hero.dead && hero.rank(key) > 0 && hero.cooldown(key) <= 0 && key != .e
    }

    @discardableResult
    public func castQ() -> Bool {
        guard skillReady(.q) else { return false }
        let r = hero.rank(.q)
        let dmg = data.sweep.dmg[r - 1] * (1 + mods.sweep) * heroDmgMul()
        eachFoe { f in
            if self.reachable(f, byHero: true) && ell(f.x - self.hero.x, f.y - self.hero.y) < self.data.sweep.radius {
                self.damage(f, dmg, .element(.hero), byHero: true)
            }
        }
        hero.cd[.q] = data.skill(.q).cd[r - 1]
        hero.swing = 0.35
        events.append(.skill(key: .q, x: hero.x, y: hero.y))
        return true
    }

    @discardableResult
    public func castW(x tx: Double, y ty: Double) -> Bool {
        guard skillReady(.w) else { return false }
        let r = hero.rank(.w), sn = data.snare
        var x = tx, y = ty
        let dx = x - hero.x, dy = y - hero.y, dist = hypot2(dx, dy)
        if dist > sn.range { x = hero.x + dx / dist * sn.range; y = hero.y + dy / dist * sn.range }
        let hold = sn.hold[r - 1] + mods.snare
        eachFoe { f in
            if self.reachable(f, byHero: true) && !f.def.isFlying && ell(f.x - x, f.y - y) < sn.radius {
                if !f.def.isBoss { f.rootT = max(f.rootT, hold) }
                self.damage(f, sn.dmg[r - 1] * self.heroDmgMul(), .element(.hero), byHero: true)
            }
        }
        hero.cd[.w] = data.skill(.w).cd[r - 1]
        events.append(.skill(key: .w, x: x, y: y))
        return true
    }

    @discardableResult
    public func castR() -> Bool {
        guard skillReady(.r) else { return false }
        let r = hero.rank(.r)
        hero.sunriseT = data.sunrise.dur[r - 1] + mods.sunrise
        hero.cd[.r] = data.skill(.r).cd[r - 1]
        events.append(.skill(key: .r, x: hero.x, y: hero.y))
        return true
    }

    /// Wren buys at the gate only, like a Dota shop.
    public func nearGate() -> Bool {
        !hero.dead && gate.contains { hypot2($0.x - hero.x, $0.y - hero.y) < data.hero.gateRadius }
    }

    public func canBuy(_ id: ItemId) -> Bool {
        let it = data.item(id)
        return nearGate() && hero.items.count < data.itemSlots && Double(gold) >= it.cost && mods.shopAfter >= it.after && !hero.items.contains(id)
    }

    @discardableResult
    public func buy(_ id: ItemId) -> Bool {
        guard canBuy(id) else { return false }
        let before = heroMaxHp()
        gold -= Int(data.item(id).cost)
        hero.items.append(id)
        hero.hp += heroMaxHp() - before
        events.append(.buy(id))
        return true
    }

    @discardableResult
    public func sellItem(_ id: ItemId) -> Bool {
        guard nearGate(), hero.items.contains(id) else { return false }
        hero.items.removeAll { $0 == id }
        gold += Int((data.item(id).cost * data.sellItem).rounded(.down))
        hero.hp = min(hero.hp, heroMaxHp())
        events.append(.sellItem(id))
        return true
    }

    // MARK: - hero numbers

    func sumItems(_ key: KeyPath<ItemDef, Double?>) -> Double {
        var s = 0.0
        for id in hero.items { s += data.item(id)[keyPath: key] ?? 0 }
        return s
    }

    public func heroMaxHp() -> Double {
        let h = data.hero
        return h.hp + h.hpPerLevel * Double(hero.level - 1) + sumItems(\.hp)
    }
    public func heroDmg() -> Double {
        let h = data.hero
        return (h.dmg + h.dmgPerLevel * Double(hero.level - 1) + sumItems(\.dmg)) * heroDmgMul()
    }
    public func heroDmgMul() -> Double { hero.double > 0 ? 2 : 1 }
    public func heroSpeed() -> Double { data.hero.speed * (1 + sumItems(\.speed)) * (hero.haste > 0 ? 2 : 1) }
    public func heroSight() -> Double { data.hero.sight + sumItems(\.sight) }
    public func xpNeeded() -> Double { xpToNext(hero.level) }

    // MARK: - tower numbers

    /// Final numbers for a tower right now, after levels, splits, trees, beacons, night and Wren.
    public func stats(_ t: Tower) -> TowerStats {
        let def = data.tower(t.kind), i = min(t.lv, 3) - 1
        var dmg = def.dmg[i] * (1 + (mods.towerDmg[t.kind] ?? 0) + mods.dmgAll)
        var range = def.range[i] * (1 + (mods.towerRange[t.kind] ?? 0) + mods.rangeAll) * (t.high ? 1.2 : 1)
        var rate = def.rate[i]
        var crit = 0.0, jumps = 2 + mods.jumps, splash = 60 * (1 + mods.blast), shells = 1
        if let split = t.split {
            switch (t.kind, split) {
            case (.watch, .a): range *= 1.3; crit = 0.25; dmg *= 1.2
            case (.watch, .b): rate *= 0.42; dmg *= 0.75
            case (.cannon, .a): range *= 1.5; dmg *= 1.4; splash *= 1.2
            case (.cannon, .b): shells = 3; dmg *= 0.65
            case (.bell, _): dmg *= 1.3; range *= 1.1
            case (.pylon, .a): jumps += 3; dmg *= 1.1
            case (.pylon, .b): jumps = 0; dmg *= 4; rate *= 1.3
            case (.roots, _): dmg *= 1.3
            default: break
            }
            if t.kind == .beacon { range *= 1.1 }
            if t.lv == 4 && t.kind != .beacon { dmg *= 1.25 }
        }
        // Beacons: more damage, and for the splits more speed or more range.
        var rateMul = 1 + mods.rateAll
        if t.kind != .beacon {
            var buff = 0.0, drum = 0.0, fire = 0.0
            let beacon = data.tower(.beacon)
            for b in towers {
                if b.kind != .beacon || b.down { continue }
                let bi = min(b.lv, 3) - 1
                let bs = beacon.range[bi] * (b.split != nil ? 1.1 : 1) * (1 + mods.rangeAll)
                if ell(b.x - t.x, b.y - t.y) > bs { continue }
                buff = max(buff, data.beaconBuff[bi] + (b.lv == 4 ? 0.05 : 0))
                if b.split == .a { drum = 0.2 }
                if b.split == .b { fire = 0.25 }
            }
            dmg *= 1 + buff; rateMul += drum; range *= 1 + fire
            if night && buff == 0 && !inLighthouse(t.x, t.y) { range *= 0.85 }
        }
        let h = hero
        if !h.dead && h.rank(.e) > 0 && ell(h.x - t.x, h.y - t.y) < data.attune.radius { rateMul += data.attune.rate[h.rank(.e) - 1] + mods.attune }
        if !h.dead && h.double > 0 && ell(h.x - t.x, h.y - t.y) < data.attune.radius { dmg *= 2 }
        if h.sunriseT > 0 { rateMul *= 2 }
        if stage.weather == "rain" && def.element == .fire { dmg *= 0.8 }
        return TowerStats(dmg: dmg, range: range, rate: rate / rateMul, crit: crit, jumps: jumps, splash: splash, shells: shells, hitsFlying: def.hitsFlying)
    }

    // MARK: - the loop

    /// Advance the battle. Large steps are split so fast forward stays stable.
    public func step(_ dt: Double) {
        if paused || over { return }
        var left = dt * speed
        while left > 1e-6 {
            let s = min(left, 1.0 / 30)
            tick(s)
            left -= s
            if over { break }
        }
    }

    private func tick(_ dt: Double) {
        let running = status == .running
        if running { clock += dt }
        updateShifts()
        if running { updateWave(dt) }
        if running { updateRunes(dt) }
        updateVents(dt)
        updateFoes(dt)
        updateHero(dt)
        updateTowers(dt)
        updateShots(dt)
        updateClouds(dt)
        foes.removeAll { $0.dead }
        if running && wave >= totalWaves && queue.isEmpty && foes.isEmpty { finish(won: true) }
        if lives <= 0 { finish(won: false) }
    }

    private func finish(won: Bool) {
        if won {
            status = .won
            events.append(.won(stars: starsFor(lives)))
        } else {
            status = .lost
            lives = 0
            events.append(.lost)
        }
    }

    private func starsFor(_ lives: Int) -> Int {
        let share = Double(lives) / Double(startLives)
        return share >= 0.9 ? 3 : share >= 0.5 ? 2 : 1
    }

    public var stars: Int { status == .won ? starsFor(lives) : 0 }

    // MARK: waves

    private func startWave() {
        wave += 1
        let n = wave, w = stage.waves[n - 1]
        waveT = 0
        leakedThisWave = false
        // Early waves of a stage send a share of each group; the last wave sends all of it.
        let ramp = Battle.waveRamp(n, totalWaves)
        for g in w.groups {
            let count = max(1, Int(jsRound(Double(g.n) * ramp)))
            for i in 0..<count { queue.append(Queued(at: g.delay + Double(i) * g.gap / ramp, kind: g.kind, spawn: g.spawn)) }
        }
        queue = queue.stableSorted { $0.at < $1.at }
        nextIn = nil
        events.append(.wave(n: n, hint: w.hint))
        if n > 1 { gold += 15 + n * 3 }
        // Interest on banked gold.
        if n > 1 && mods.interest > 0 {
            let g = min(40, Int((Double(gold) * mods.interest).rounded(.down)))
            if g > 0 { gold += g; events.append(.interest(gold: g)) }
        }
        // The Hollow adapts to the element that hurt it most.
        let every = stage.adaptEvery ?? 3
        if n > 1 && (n - 1) % every == 0 { adapt() }
        applyGears(n)
        for i in plots.indices where stage.plots[i].sinkAt == n && !plots[i].sunk {
            plots[i].sunk = true
            if let t = towers.first(where: { $0.plot == i }) {
                gold += t.spent
                towers.removeAll { $0 === t }
                threatDirty = true
            }
            events.append(.sink(plot: i))
        }
        if stage.night == true {
            let on = n % 2 == 0
            if on != night { night = on; events.append(.night(on: on)); threatDirty = true }
        }
    }

    private func adapt() {
        var total = 0.0
        var top: Element?
        for e in Battle.elements {
            total += dmgWindow[e]!
            if top == nil || dmgWindow[e]! > dmgWindow[top!]! { top = e }
        }
        if let top, total > 0 && dmgWindow[top]! / total > 0.3 {
            for e in Battle.elements { resist[e] = e == top ? min(0.6, resist[e]! + 0.2) : max(0, resist[e]! - 0.1) }
            events.append(.adapt(el: top, resist: resist[top]!))
        }
        for e in Battle.elements { dmgWindow[e] = 0 }
    }

    /// Whether gear plots of this kind are raised on the current wave.
    public func gearUp(_ g: SplitId) -> Bool { (max(1, wave) % 2 == 1) == (g == .a) }

    private func applyGears(_ n: Int) {
        if !stage.plots.contains(where: { $0.gear != nil }) { return }
        for t in towers { if let g = plots[t.plot].gear { t.down = !gearUp(g) } else { t.down = false } }
        if n > 0 { events.append(.gear(up: n % 2 == 1 ? .a : .b)) }
        threatDirty = true
    }

    private func updateWave(_ dt: Double) {
        waveT += dt
        while let q = queue.first, q.at <= waveT {
            queue.removeFirst()
            spawn(q.kind, spawnId: q.spawn)
        }
        if queue.isEmpty && nextIn == nil && wave < totalWaves { nextIn = Battle.waveGap }
        if var n = nextIn {
            // When the field is clear, the next wave comes sooner.
            if foes.isEmpty { n = min(n, 8) }
            n -= dt
            nextIn = n
            if n <= 0 { nextIn = 0; startWave() }
        }
    }

    /// Spawn a foe at a rift. On a fork it takes the road with the least threat.
    @discardableResult
    func spawn(_ kind: EnemyKind, spawnId: String? = nil, at: (road: RoadRt, d: Double)? = nil) -> Foe {
        let def = data.enemy(kind)
        let road: RoadRt, d: Double
        if let at { road = at.road; d = at.d } else {
            let id = spawnId ?? spawns[Int((rng.next() * Double(spawns.count)).rounded(.down))].id
            road = pickRoad(spawns.first { $0.id == id }?.roads ?? spawns[0].roads, def)
            d = 0
        }
        let id = nextId()
        let p = road.path.point(at: d)
        let off = def.isBoss ? 0 : (rng.next() - 0.5) * road.def.w * 0.5
        let hp = def.hp * scale
        let speed = def.speed * (0.94 + rng.next() * 0.12)
        let f = Foe(id: id, kind: kind, def: def, road: road, d: d, at: p, off: off, hp: hp, speed: speed)
        foes.append(f)
        if def.isBoss { events.append(.boss(kind)) }
        return f
    }

    private func pickRoad(_ options: [RoadRt], _ def: EnemyDef) -> RoadRt {
        if options.count == 1 { return options[0] }
        let sapper = def.traits?.sapper ?? false
        let wallUp = { (r: RoadRt) in r.barrier.map { $0.hp > 0 } ?? false }
        var open = options.filter { !$0.closed && (sapper || !wallUp($0)) }
        if sapper, let walled = open.first(where: wallUp) { return walled }
        if open.isEmpty { open = options.filter { !wallUp($0) } }
        if open.isEmpty { open = options }
        if open.count == 1 { return open[0] }
        if threatDirty { computeThreat() }
        let w = open.map { r -> Double in let k = 20 + (threat[ObjectIdentifier(r)] ?? 0) / 40; return 1 / (k * k) }
        var x = rng.next() * w.reduce(0, +)
        for i in open.indices { x -= w[i]; if x <= 0 { return open[i] } }
        return open[open.count - 1]
    }

    /// How much tower fire covers each road: damage per second times the length it covers.
    private func computeThreat() {
        threatDirty = false
        for r in roads {
            var total = 0.0
            for t in towers {
                if t.kind == .beacon || t.down { continue }
                let s = stats(t)
                var cover = 0.0, d = 0.0
                while d < r.path.tot {
                    let p = r.path.point(at: d)
                    if ell(p.x - t.x, p.y - t.y) < s.range { cover += 1 }
                    d += 24
                }
                total += cover * s.dmg / s.rate
            }
            threat[ObjectIdentifier(r)] = total
        }
    }

    /// Threat per road id, for tests.
    public func roadThreat() -> [String: Double] {
        if threatDirty { computeThreat() }
        return Dictionary(uniqueKeysWithValues: roads.map { ($0.def.id, threat[ObjectIdentifier($0)] ?? 0) })
    }

    private func updateShifts() {
        let shifts = stage.shifts ?? []
        var closed = Set<String>()
        for (i, s) in shifts.enumerated() {
            let t = clock + shiftShift
            let phase = ((t - s.start).truncatingRemainder(dividingBy: s.every) + s.every).truncatingRemainder(dividingBy: s.every)
            let on = status == .running && phase < s.dur
            if on != shiftOn[i] { shiftOn[i] = on; events.append(.shift(label: on ? s.label : "The way is open again", on: on)) }
            if on { closed.formUnion(s.closes) }
        }
        for r in roads { r.closed = closed.contains(r.def.id) }
    }

    /// True while a shift is active, for the renderer.
    public func shiftActive(_ i: Int) -> Bool { i < shiftOn.count && shiftOn[i] }

    private func updateRunes(_ dt: Double) {
        nextRune -= dt
        if nextRune <= 0 {
            nextRune = data.runeEvery
            let kind = data.runeOrder[Int((rng.next() * Double(data.runeOrder.count)).rounded(.down))]
            rune = RuneState(kind: kind, x: stage.rune.x, y: stage.rune.y)
            events.append(.rune(kind: kind, picked: false))
        }
        if let r = rune, !hero.dead, hypot2(r.x - hero.x, r.y - hero.y) < 40 {
            rune = nil
            switch r.kind {
            case .haste: hero.haste = data.rune(.haste).dur
            case .double: hero.double = data.rune(.double).dur
            case .regen: hero.regenT = data.rune(.regen).dur
            case .bounty: gold += 30 + wave * 6; giveXp(40 + Double(wave) * 20)
            }
            events.append(.rune(kind: r.kind, picked: true))
        }
    }

    private func updateVents(_ dt: Double) {
        for i in vents.indices {
            let boosted = !hero.dead && hypot2(hero.x - vents[i].x, hero.y - vents[i].y) < 44
            vents[i].t -= dt * (boosted ? 2 : 1)
            if vents[i].t > 0 { continue }
            vents[i].t = vents[i].every
            let v = vents[i]
            events.append(.vent(x: v.x, y: v.y))
            eachFoe { f in
                if !f.def.isFlying && !f.under && ell(f.x - v.x, f.y - v.y) < 56 { self.damage(f, v.dmg * self.scale, .env, byHero: false) }
            }
        }
    }

    // MARK: foes

    func inLighthouse(_ x: Double, _ y: Double) -> Bool {
        guard let l = stage.lighthouse else { return false }
        return ell(l.x - x, l.y - y) < Battle.lighthouseRange
    }

    /// Visit every foe, including any spawned during the visit, as the web engine does.
    private func eachFoe(_ body: (Foe) -> Void) {
        var i = 0
        while i < foes.count { body(foes[i]); i += 1 }
    }

    private func updateFoes(_ dt: Double) {
        let wardens = foes.filter { $0.def.traits?.shield != nil && !$0.dead }
        let beacons = towers.filter { $0.kind == .beacon && !$0.down }
        let beaconRange = data.tower(.beacon).range
        var blocking = 0
        let sight = heroSight()
        let hd = data.hero
        var i = 0
        while i < foes.count {
            let f = foes[i]
            i += 1
            if f.dead { continue }
            let tr = f.def.traits
            f.slowT = max(0, f.slowT - dt); if f.slowT == 0 { f.slow = 0 }
            f.rootT = max(0, f.rootT - dt)
            f.freezeT = max(0, f.freezeT - dt)
            f.freezeImmune = max(0, f.freezeImmune - dt)
            f.vulnT = max(0, f.vulnT - dt)
            f.burstT = max(0, f.burstT - dt)
            f.hitT = max(0, f.hitT - dt)
            if f.burnT > 0 {
                f.burnT -= dt
                damage(f, f.burnDps * dt, .element(.fire), byHero: false, quiet: true)
                if f.dead { continue }
            }

            // Burrow and dive.
            if let b = tr?.burrow {
                f.underT -= dt
                if f.underT <= 0 { f.under.toggle(); f.underT = f.under ? b[0] : b[1] }
            }
            if let dv = tr?.dive {
                f.underT -= dt
                if f.underT <= 0 {
                    f.under.toggle(); f.underT = f.under ? dv.dur : dv.every
                    events.append(.dive(x: f.x, y: f.y, under: f.under))
                }
                if f.under { f.hp = min(f.max, f.hp + f.max * 0.01 * dt) }
            }
            // Summons.
            if let sm = tr?.summon {
                f.abilityT -= dt
                if f.abilityT <= 0 {
                    f.abilityT = sm.every
                    for k in 0..<sm.n { spawn(sm.kind, at: (f.road, max(0, f.d - 20 - Double(k) * 18))) }
                }
            }
            // Healing.
            if let heal = tr?.heal {
                f.abilityT -= dt
                if f.abilityT <= 0 {
                    f.abilityT = 2
                    for o in foes where !o.dead && ell(o.x - f.x, o.y - f.y) < 100 { o.hp = min(o.max, o.hp + o.max * heal) }
                }
            }
            // Queen phases.
            if let ph = tr?.phases, f.phase < ph.count, f.hp / f.max < ph[f.phase] {
                f.phase += 1
                f.burstT = 4
                shiftShift += 20
                for k in 0..<6 { spawn(.shade, at: (f.road, max(0, f.d - 30 - Double(k) * 16))) }
                events.append(.phase(n: f.phase, x: f.x, y: f.y))
            }

            f.shielded = tr?.shield == nil && wardens.contains { ell($0.x - f.x, $0.y - f.y) < ($0.def.traits?.shield ?? 0) }
            if tr?.stealth == true {
                let seen = (!hero.dead && hypot2(hero.x - f.x, hero.y - f.y) < sight)
                    || hero.sunriseT > 0
                    || inLighthouse(f.x, f.y)
                    || towers.contains { ell($0.x - f.x, $0.y - f.y) < Battle.towerSight }
                    || beacons.contains { ell($0.x - f.x, $0.y - f.y) < beaconRange[min($0.lv, 3) - 1] }
                f.hidden = !seen
            } else {
                f.hidden = false
            }

            // Wren holds ground foes that walk into her.
            f.blocked = false
            if !hero.dead && !hero.moving && !f.def.isFlying && !f.under && blocking < hd.blocks && hypot2(hero.x - f.x, hero.y - f.y) < 30 + f.def.size * 10 {
                f.blocked = true; blocking += 1
                let armor = min(0.6, sumItems(\.armor))
                hero.hp -= f.def.dps * scale * 0.6 * (1 - armor) * dt
            }

            // Movement.
            var mul = f.slow > 0 ? 1 - f.slow : 1
            if f.rootT > 0 || f.freezeT > 0 || f.blocked { mul = 0 }
            if f.burstT > 0 { mul *= 1.6 }
            for b in f.road.belts where f.d >= b.from && f.d <= b.to { mul *= b.mult }
            if f.under && tr?.burrow != nil { mul *= 1.4 }
            var nd = f.d + f.speed * mul * dt
            // A closed ford or lava pass holds foes on this side until it opens.
            if f.road.closed, let c = f.road.closeAt, f.d < c - 30, !f.def.isFlying { nd = min(nd, c - 40) }
            if var bar = f.road.barrier, bar.hp > 0, !f.def.isFlying, f.d < bar.d {
                nd = min(nd, bar.d - 26)
                if tr?.sapper == true && nd >= bar.d - 30 {
                    bar.hp -= 40 * dt
                    if bar.hp <= 0 {
                        bar.hp = 0
                        threatDirty = true
                        events.append(.barrier(road: f.road.def.id, broken: true))
                    }
                    f.road.barrier = bar
                }
            }
            f.d = nd
            let p = f.road.path.point(at: f.d)
            let nx = p.x + f.off * 0.3, ny = p.y + f.off * 0.3
            if abs(nx - f.x) > 0.01 { f.dir = jsSign(nx - f.x) }
            f.x = nx; f.y = ny
            if f.d >= f.road.path.tot - 2 { leak(f) }
        }
    }

    private func leak(_ f: Foe) {
        f.dead = true
        if mods.ironGate && !leakedThisWave && !f.def.isBoss { leakedThisWave = true; return }
        leakedThisWave = true
        lives = max(0, lives - f.def.leak)
        leaks += f.def.leak
        events.append(.leak(x: f.x, y: f.y, lives: f.def.leak, kind: f.kind, hpLeft: f.hp / f.max))
    }

    /// Can this foe be hit right now?
    public func reachable(_ f: Foe, byHero: Bool = false) -> Bool {
        if f.dead || f.under { return false }
        if f.hidden && !byHero { return false }
        return true
    }

    /// Deal damage after every rule: weakness, adaptation, shields, armor, plates. Returns damage done.
    @discardableResult
    func damage(_ f: Foe, _ amount: Double, _ src: DamageSource, byHero: Bool, quiet: Bool = false, crit: Bool = false) -> Double {
        if !reachable(f, byHero: true) || amount <= 0 { return 0 }
        var m = 1.0
        if case .element(let el) = src {
            m = f.def.takes?[el.rawValue] ?? 1
            if el != .hero { m *= 1 - resist[el]! }
        }
        if f.shielded { m *= 0.6 }
        if f.vulnT > 0 { m *= 1.25 }
        let chilled = f.slowT > 0 || f.freezeT > 0
        if src == .element(.fire) && chilled && mods.shatter { m *= 1.5 }
        if let plated = f.def.traits?.plated, !chilled { m *= plated }
        var dmg = amount * m
        if let armor = f.def.traits?.armor, armor != 0, !quiet { dmg = max(dmg * 0.15, dmg - armor * armorScale(stage.id)) }
        if dmg <= 0 { return 0 }
        f.hp -= dmg
        f.hitT = 0.12
        if case .element(let el) = src, el != .hero { dmgWindow[el]! += dmg }
        if !quiet { events.append(.hit(x: f.x, y: f.y - f.def.bar * 0.6, dmg: dmg, crit: crit, source: src)) }
        if f.hp <= 0 { kill(f, byHero: byHero) }
        return dmg
    }

    private func kill(_ f: Foe, byHero: Bool) {
        if f.dead { return }
        f.dead = true
        kills += 1
        let bonus = byHero ? 1 + data.hero.lastHit + mods.lastHit : 1
        let g = Int(jsRound(f.def.gold * goldScale(stage.id) * bonus))
        gold += g
        events.append(.kill(x: f.x, y: f.y, kind: f.kind, gold: g, hero: byHero))
        // Full XP for kills near Wren, a share for kills anywhere else, so she grows wherever the fight is.
        if !hero.dead { giveXp(f.def.hp * 0.45 * scale * (hypot2(hero.x - f.x, hero.y - f.y) < data.hero.xpRadius ? 1 : data.hero.xpFar)) }
        if let sp = f.def.traits?.splitInto {
            for k in 0..<sp.n {
                let c = spawn(sp.kind, at: (f.road, max(0, f.d - Double(k) * 14)))
                c.off = Double(k - 1) * 12
            }
        }
        if hero.focus == f.id { hero.focus = nil }
    }

    private func giveXp(_ xp: Double) {
        hero.xp += xp
        while hero.level < data.hero.maxLevel && hero.xp >= xpToNext(hero.level) {
            hero.xp -= xpToNext(hero.level)
            let before = heroMaxHp()
            hero.level += 1; hero.points += 1
            hero.hp += heroMaxHp() - before
            events.append(.level(hero.level))
        }
        if hero.level >= data.hero.maxLevel { hero.xp = 0 }
    }

    // MARK: hero

    private func updateHero(_ dt: Double) {
        let hd = data.hero
        for k in [SkillKey.q, .w, .r] { hero.cd[k] = max(0, hero.cooldown(k) - dt) }
        hero.haste = max(0, hero.haste - dt); hero.double = max(0, hero.double - dt); hero.regenT = max(0, hero.regenT - dt)
        hero.sunriseT = max(0, hero.sunriseT - dt); hero.swing = max(0, hero.swing - dt)
        if hero.dead {
            hero.respawnT -= dt
            if hero.respawnT <= 0 {
                hero.dead = false
                hero.hp = heroMaxHp()
                let g = gate[0]
                hero.x = g.x - 60; hero.tx = hero.x; hero.anchorX = hero.x
                hero.y = g.y - 20; hero.ty = hero.y; hero.anchorY = hero.y
                events.append(.heroUp)
            }
            return
        }
        let maxHp = heroMaxHp()
        var regen = hd.regen + sumItems(\.regen)
        if nearGate() { regen += hd.gateRegen }
        if hero.regenT > 0 { regen += maxHp * 0.12 }
        hero.hp = min(maxHp, hero.hp + regen * dt)
        if hero.hp <= 0 {
            if hero.items.contains(.seconddawn) && !hero.revived {
                hero.revived = true
                hero.items.removeAll { $0 == .seconddawn }
                hero.hp = maxHp
                events.append(.revive)
            } else {
                hero.dead = true; hero.hp = 0; hero.respawnT = hd.respawn(level: hero.level); hero.focus = nil; hero.moving = false
                events.append(.heroDown)
                return
            }
        }

        // Pick a fight: her focus, then a foe she holds, then the nearest within reach of her post.
        var target: Foe?
        if let focus = hero.focus { target = foes.first { $0.id == focus && reachable($0, byHero: true) } }
        if target == nil {
            hero.focus = nil
            var best = Double.infinity
            for f in foes {
                if !reachable(f, byHero: true) { continue }
                if hypot2(f.x - hero.anchorX, f.y - hero.anchorY) > hd.aggro { continue }
                let score = hypot2(f.x - hero.x, f.y - hero.y) - (f.blocked ? 200 : 0)
                if score < best { best = score; target = f }
            }
        }
        // Walk: to her post, or a little way out to meet a foe.
        var gx = hero.tx, gy = hero.ty
        if let t = target {
            let dist = hypot2(t.x - hero.x, t.y - hero.y)
            if dist > hd.reach + t.def.size * 6 { gx = t.x; gy = t.y + 4 } else { gx = hero.x; gy = hero.y }
        }
        let dx = gx - hero.x, dy = gy - hero.y, dist = hypot2(dx, dy), stepLen = heroSpeed() * dt
        hero.moving = dist > 3
        if dist > 0.5 {
            let k = min(1, stepLen / dist)
            hero.x += dx * k; hero.y += dy * k
            if abs(dx) > 1 { hero.face = jsSign(dx) }
        }
        guard let target else { hero.atkCd = max(0, hero.atkCd - dt); return }
        hero.atkCd -= dt
        if hypot2(target.x - hero.x, target.y - hero.y) <= hd.reach + target.def.size * 6 && hero.atkCd <= 0 {
            hero.atkCd = hd.atkRate / (1 + sumItems(\.atkSpeed))
            hero.swing = 0.25
            let s = jsSign(target.x - hero.x)
            if s != 0 { hero.face = s }
            let dmg = heroDmg()
            damage(target, dmg, .element(.hero), byHero: true)
            let cleave = sumItems(\.cleave)
            if cleave > 0 {
                eachFoe { o in
                    if o !== target && self.reachable(o, byHero: true) && ell(o.x - target.x, o.y - target.y) < 70 {
                        self.damage(o, dmg * cleave, .element(.hero), byHero: true, quiet: true)
                    }
                }
            }
            events.append(.heroHit(x: target.x, y: target.y - 18))
        }
    }

    // MARK: towers

    private func targetable(_ f: Foe, from t: Tower, range: Double, flying: Bool) -> Bool {
        if !reachable(f) || (f.def.isFlying && !flying) { return false }
        return ell(f.x - t.x, f.y - t.y) < range
    }

    private func pick(_ t: Tower, range: Double, flying: Bool) -> Foe? {
        var best: Foe?, score = -Double.infinity
        for f in foes where targetable(f, from: t, range: range, flying: flying) {
            let s: Double
            switch t.mode {
            case .first: s = f.d / f.road.path.tot + (f.def.isBoss ? 0.01 : 0)
            case .strong: s = f.hp
            case .close: s = -ell(f.x - t.x, f.y - t.y)
            }
            if s > score { score = s; best = f }
        }
        return best
    }

    private func updateTowers(_ dt: Double) {
        for t in towers {
            t.fired += dt
            if t.kind == .beacon || t.down { continue }
            let s = stats(t)
            t.cd -= dt
            let target = pick(t, range: s.range, flying: s.hitsFlying)
            if let target {
                let want = atan2(target.y - t.y, target.x - t.x)
                if t.kind == .cannon {
                    var da = want - t.aim
                    while da > .pi { da -= .pi * 2 }
                    while da < -.pi { da += .pi * 2 }
                    t.aim += da * min(1, dt * 7)
                } else {
                    t.aim = want
                }
            }
            guard t.cd <= 0, let target else { continue }
            t.cd = s.rate
            t.fired = 0
            attack(t, target, s)
        }
    }

    private func attack(_ t: Tower, _ target: Foe, _ s: TowerStats) {
        let el = data.tower(t.kind).element
        switch t.kind {
        case .watch:
            let crit = s.crit > 0 && rng.next() < s.crit
            let dist = hypot2(target.x - t.x, target.y - t.y)
            shots.append(Shot(id: nextId(), kind: .bolt, tower: t.id, x0: t.x, y0: t.y - 110 * (t.split != nil ? 1.08 : 1), tx: target.x, ty: target.y,
                              foe: target.id, t: 0, dur: max(0.12, dist / 950), dmg: s.dmg * (crit ? 3 : 1), el: el, splash: 0, round: t.round, crit: crit))
            events.append(.shot(tower: t.id, kind: .bolt))
        case .cannon:
            let dur = t.split == .a ? 1.0 : 0.7
            let lead = target.rootT > 0 || target.freezeT > 0 || target.blocked ? 0 : target.speed * (1 - target.slow) * dur
            for i in 0..<s.shells {
                let off = s.shells > 1 ? Double(i - 1) * 46 : 0
                let p = target.road.path.point(at: target.d + lead + off)
                shots.append(Shot(id: nextId(), kind: .shell, tower: t.id, x0: t.x, y0: t.y - 44, tx: p.x, ty: p.y,
                                  foe: target.id, t: -Double(i) * 0.08, dur: dur, dmg: s.dmg, el: el, splash: s.splash, round: t.round, crit: false))
            }
            events.append(.shot(tower: t.id, kind: .shell))
        case .bell:
            let slow = min(0.75, 0.4 + mods.slow)
            eachFoe { f in
                guard self.targetable(f, from: t, range: s.range, flying: true) else { return }
                f.slow = max(f.slow, f.def.isBoss ? slow * 0.5 : slow)
                f.slowT = max(f.slowT, 1.6)
                if t.split == .a && f.freezeImmune <= 0 && !f.def.isBoss { f.freezeT = 0.9; f.freezeImmune = 2.6 }
                if t.split == .b { f.vulnT = 2 }
                self.damage(f, s.dmg, .element(el), byHero: false, quiet: true)
            }
            events.append(.pulse(tower: t.id, x: t.x, y: t.y, r: s.range))
        case .pylon:
            var pts = [Vec(t.x, t.y - 100)]
            var hit = Set<Int>()
            var cur: Foe? = target
            var dmg = s.dmg
            var jumps = s.jumps + (mods.overload && (target.rootT > 0 || target.freezeT > 0) ? 2 : 0)
            let reach = stage.weather == "rain" ? 220.0 : 120.0
            while let c = cur {
                hit.insert(c.id)
                pts.append(Vec(c.x, c.y - 14))
                damage(c, dmg, .element(el), byHero: false)
                if c === target { applyRound(t.round, c, dmg) }
                if jumps <= 0 { break }
                jumps -= 1
                dmg *= 0.75
                var next: Foe?, bd = reach
                for f in foes where !hit.contains(f.id) && reachable(f) {
                    let d = hypot2(f.x - c.x, f.y - c.y)
                    if d < bd { bd = d; next = f }
                }
                cur = next
            }
            events.append(.arc(pts: pts))
        case .roots:
            let hold = 1.2 + mods.hold
            let caught = t.split == .a
                ? foes.filter { reachable($0) && !$0.def.isFlying && hypot2($0.x - target.x, $0.y - target.y) < 70 }
                : [target]
            for f in caught {
                if !f.def.isBoss { f.rootT = max(f.rootT, hold) }
                damage(f, s.dmg, .element(el), byHero: false)
                applyRound(t.round, f, s.dmg)
            }
            if t.split == .b { clouds.append(Cloud(x: target.x, y: target.y, r: 64, dps: s.dmg * 0.9, t: 3)) }
            events.append(.root(x: target.x, y: target.y))
        case .beacon:
            break
        }
    }

    private func applyRound(_ round: Rounds?, _ f: Foe, _ dmg: Double) {
        guard let round, !f.dead else { return }
        switch round {
        case .ember: f.burnT = 2; f.burnDps = max(f.burnDps, dmg * 0.25)
        case .frost: f.slow = max(f.slow, 0.2); f.slowT = max(f.slowT, 1)
        case .storm:
            guard rng.next() < 0.18 else { return }
            var next: Foe?, bd = 100.0
            for o in foes where o !== f && reachable(o) {
                let d = hypot2(o.x - f.x, o.y - f.y)
                if d < bd { bd = d; next = o }
            }
            if let next {
                damage(next, dmg * 0.5, .element(.storm), byHero: false)
                events.append(.arc(pts: [Vec(f.x, f.y - 14), Vec(next.x, next.y - 14)]))
            }
        }
    }

    private func updateShots(_ dt: Double) {
        for i in shots.indices {
            shots[i].t += dt
            let s = shots[i]
            let f = foes.first { $0.id == s.foe }
            if s.kind == .bolt, let f, !f.dead { shots[i].tx = f.x; shots[i].ty = f.y }
            if shots[i].t < s.dur { continue }
            shots[i].t = -1
            let shot = shots[i]
            switch shot.kind {
            case .bolt:
                if let f, !f.dead {
                    damage(f, shot.dmg, .element(shot.el), byHero: false, crit: shot.crit)
                    applyRound(shot.round, f, shot.dmg)
                }
            case .shell:
                events.append(.boom(x: shot.tx, y: shot.ty, r: shot.splash))
                eachFoe { o in
                    if o.dead || o.def.isFlying || !self.reachable(o) { return }
                    let d = ell(o.x - shot.tx, o.y - shot.ty)
                    if d > shot.splash { return }
                    let dmg = shot.dmg * (d < shot.splash * 0.4 ? 1 : 0.6)
                    self.damage(o, dmg, .element(shot.el), byHero: false)
                    self.applyRound(shot.round, o, dmg)
                }
            }
        }
        // As on the web, a shell still waiting for its turn (t below zero) is dropped here.
        shots.removeAll { $0.t < 0 }
    }

    private func updateClouds(_ dt: Double) {
        for i in clouds.indices {
            clouds[i].t -= dt
            let c = clouds[i]
            eachFoe { f in
                if !f.dead && !f.def.isFlying && ell(f.x - c.x, f.y - c.y) < c.r { self.damage(f, c.dps * dt, .element(.nature), byHero: false, quiet: true) }
            }
        }
        clouds.removeAll { $0.t <= 0 }
    }

    private func nextId() -> Int { defer { ids += 1 }; return ids }

    /// Remove and return the events since the last call.
    public func drain() -> [BattleEvent] {
        defer { events = [] }
        return events
    }
}

/// The fewest lives that still earn 3 and 2 stars: 90% and 50% of the lives you start with.
public func starLives(_ start: Int) -> (three: Int, two: Int) {
    var three = start, two = start
    while three > 0 && Double(three - 1) / Double(start) >= 0.9 { three -= 1 }
    while two > 0 && Double(two - 1) / Double(start) >= 0.5 { two -= 1 }
    return (three, two)
}
