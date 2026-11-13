import SwiftUI
import SpriteKit
import TowerRiotKit

/// Runs one fight: steps the battle each frame, turns events into sound and banners, and holds what the HUD shows.
/// A port of the logic in src/ui/battle.ts. The HUD reads the battle directly; `tick` tells SwiftUI when to look again.
final class BattleController: ObservableObject {
    let battle: Battle
    let scene: BattleScene
    private unowned let app: AppModel
    let autoSkills: Bool
    let variant: StageVariant
    let oaths: [OathId]

    /// Bumped a few times a second so the HUD redraws without redrawing every frame.
    @Published private(set) var tick = 0
    @Published private(set) var menu: Menu?
    @Published private(set) var banner: BannerItem?
    @Published var shopOpen = false
    @Published private(set) var aimingW = false
    @Published var showLeash = false
    @Published var autoNext = false
    @Published private(set) var hintPlot: Int?
    /// A finger cannot hover: the first tap on a build button shows the range, the second pays (after arming delay).
    @Published private(set) var armed: TowerKind?
    @Published private(set) var sellArmedId: Int?
    @Published private(set) var exitAsk = false
    @Published private(set) var result: ResultInfo?
    @Published private(set) var levelFlash = false
    /// Upright phones: the world x at the middle of the screen. The map is wider than the screen and slides under a drag.
    @Published private(set) var viewCentre = World.width / 2
    /// Set by the view on each layout: points per world unit, and half the world width in view.
    private var panScale: CGFloat = 1
    private var panHalf = World.width / 2

    enum Menu: Equatable { case plot(Int), tower(Int) }
    struct BannerItem: Equatable { let id: Int; let title: String; let sub: String; let secs: Double; let low: Bool }
    struct ResultInfo {
        let won: Bool, stars: Int, embers: Int
        let text: String, nextStar: String?
        let cause: (kind: EnemyKind, lives: Int)?
        let bdTowersPct: Int, bdHeroPct: Int, bdStatusPct: Int
        let mvpText: String?
    }

    private var frames = 0
    private var bannerT = 0.0
    private var bannerQ: [(String, String, Double)] = []
    private var bannerId = 0
    private var lvlT = 0.0
    private var leakBy: [EnemyKind: Int] = [:]
    private var exitWasPaused = false
    private var ended = false
    private var resultScheduled = false
    private var embersGained = 0
    private var panelOpenedAt = 0.0
    private var armedAt = 0.0
    private var sellArmedUntil = 0.0

    init(stageId: Int, variant: StageVariant = .standard, oaths: [OathId] = [], app: AppModel) {
        self.app = app
        self.variant = variant
        self.oaths = oaths
        let st = app.data.stage(stageId)
        battle = Battle(stage: st, mods: app.save.mods, seed: Int(Date().timeIntervalSince1970 * 1000) & 0xffff, variant: variant, oaths: oaths)
        scene = BattleScene(battle: battle)
        autoSkills = app.autoSkills(for: stageId)
        autoNext = app.save.settings.autoNext
        scene.look.reduceMotion = app.save.settings.reduceMotion
        scene.look.dmgNumbers = app.save.settings.dmgNumbers
        scene.tapAimW = app.save.settings.tapAimW
        scene.onFrame = { [weak self] dt in self?.frame(dt) ?? [] }
        scene.onTap = { [weak self] x, y in self?.tap(x, y) }
        scene.onAim = { [weak self] x, y in
            guard let self else { return }
            let cancel = hypot2(x - self.battle.hero.x, y - self.battle.hero.y) > self.data.snare.range + 45
            self.scene.look.aimW = cancel ? nil : Vec(x, y)
            self.scene.look.showLeash = true
        }
        scene.onAimEnd = { [weak self] x, y, cancel in
            guard let self else { return }
            if !cancel && self.aimingW { _ = self.battle.castW(x: x, y: y) }
            self.endAim()
            self.tick &+= 1
        }
        // Switches, towers and plots keep their taps even when Wren stands beside them.
        scene.grabBlocked = { [weak self] x, y in self?.structureAt(x, y) ?? false }
        scene.onHeroDrag = { [weak self] x, y in
            guard let self else { return }
            self.showLeash = true
            self.scene.look.showLeash = true
            self.battle.moveHero(x: x, y: y)
            if self.menu != nil { self.closeMenu() }
        }
        scene.onHeroDragEnd = { [weak self] x, y in
            guard let self else { return }
            self.battle.moveHero(x: x, y: y)
            self.scene.markMove(x, y)
            self.showLeash = false
            self.scene.look.showLeash = false
            self.tick &+= 1
        }
        scene.onHeroDragCancel = { [weak self] in
            guard let self else { return }
            self.showLeash = false
            self.scene.look.showLeash = false
            self.tick &+= 1
        }
        scene.onPan = { [weak self] dx in self?.pan(by: dx) }
        start()
        // Open on the marked plot, or on Wren, when only part of the map shows.
        viewCentre = hintPlot.map { battle.plots[$0].x } ?? battle.hero.x
    }

    var data: GameData { battle.data }
    var sound: Sound { app.sound }
    var soundOn: Bool { app.save.settings.sound }
    var leftHandHud: Bool { app.save.settings.leftHandHud }
    var tapGroundMove: Bool { app.save.settings.tapGroundMove }
    var tapAimW: Bool { app.save.settings.tapAimW }

    private func start() {
        let st = battle.stage
        // Stage 1 opens on the build prompt alone: the name card would sit over the marked plot.
        if st.id != 1 { showBanner(st.name, st.twist, 4) }
        if st.id == 1 {
            // One skill works right away. Building comes first; how to move Wren follows the first tower.
            if battle.canLearn(.q) { _ = battle.learn(.q) }
            let hx = battle.hero.x, hy = battle.hero.y
            var best = 0
            for (i, p) in battle.plots.enumerated() where hypot(p.x - hx, p.y - hy) < hypot(battle.plots[best].x - hx, battle.plots[best].y - hy) { best = i }
            hintPlot = best
            scene.look.hintPlot = best
            showBanner("Build your first tower", "Tap the marked plot. Towers do most of the work.", 5)
        }
        if autoSkills { battle.autoLearn() }
    }

    /* ------------------------------------------------------------------ sliding map */

    /// The view tells the controller how the map is shown; a map that fits leaves nothing to slide.
    func setView(scale: CGFloat, halfWidth: Double) {
        panScale = scale; panHalf = halfWidth
        scene.canPan = halfWidth < World.width / 2 - 1
    }

    /// The world x at the middle of the screen, kept so the map never slides past its edges.
    func centre() -> Double { min(max(viewCentre, panHalf), World.width - panHalf) }

    private func pan(by dx: CGFloat) {
        if menu != nil { closeMenu() }
        viewCentre = min(max(centre() - Double(dx / max(0.01, panScale)), panHalf), World.width - panHalf)
    }

    /* ------------------------------------------------------------------ loop */

    private func frame(_ dt: Double) -> [BattleEvent] {
        let simDt = aimingW ? dt * 0.25 : dt
        battle.step(simDt)
        let events = battle.drain()
        react(events)
        // Auto-call waits for a clear field, so waves never pile up on each other.
        if autoNext && !battle.paused && !battle.over && battle.status == .running && battle.nextIn != nil && battle.wave < battle.totalWaves && battle.foes.isEmpty {
            _ = battle.callWave()
        }
        // Nothing to throw once Wren is down or the fight is over: time must not stay slowed.
        if aimingW && (battle.hero.dead || battle.over) { endAim() }
        if sellArmedId != nil && Date().timeIntervalSince1970 >= sellArmedUntil { sellArmedId = nil }
        scene.look.showLeash = showLeash || aimingW
        if bannerT > 0 {
            bannerT -= dt
            if bannerT <= 0 { if bannerQ.isEmpty { banner = nil } else { let n = bannerQ.removeFirst(); putBanner(n.0, n.1, n.2) } }
        }
        if lvlT > 0 { lvlT -= dt; if lvlT <= 0 { levelFlash = false } }
        if let hp = hintPlot, battle.towers.count > 0 {
            _ = hp
            hintPlot = nil; scene.look.hintPlot = nil
            showBanner("Drag Wren to the road", "She holds up to 2 foes inside a 90 px leash and earns +50% gold on kills.", 4.5)
        }
        frames += 1
        if frames % 4 == 0 || !events.isEmpty && frames % 2 == 0 { tick &+= 1 }
        return events
    }

    private func react(_ events: [BattleEvent]) {
        let b = battle
        for e in events {
            switch e {
            case let .shot(_, kind): sound.play(kind == .bolt ? .bolt : .boom)
            case .pulse: sound.play(.bell)
            case .arc: sound.play(.zap)
            case .root: sound.play(.root)
            case .kill: sound.play(.coin)
            case .heroHit: sound.play(.hero)
            case let .leak(_, _, lives, kind, _): sound.play(.leak); leakBy[kind, default: 0] += lives
            case .build, .upgrade: sound.play(.build)
            case let .clearPlot(_, free): sound.play(.clear); showBanner(free ? "Plot salvaged" : "Rubble cleared", "This plot is open for building.", 1.8)
            case let .switchFlip(_, label, state): sound.play(.switchFlip); showBanner(label, state != 0 ? "Mechanism engaged!" : "Mechanism reset.", 1.8)
            case .warp: sound.play(.warp)
            case let .riftWarn(_, wv): showBanner("New breach forming", "Watch the marked path before Wave \(wv).", 2.6)
            case .riftOpen: sound.play(.wave); showBanner("Rift torn open", "A new lane has activated on the field!", 2.4)
            case let .terraform(label): sound.play(.boss); showBanner("Ground shifts", label, 3.0, now: true)
            case .stamp: sound.play(.boom)
            case .pane: sound.play(.bell)
            case .gateShock: sound.play(.sunrise); showBanner("Bastion bell!", "The Keep shockwave stuns intruders at the gate.", 2.2)
            case .level: sound.play(.level); lvlT = 0.9; levelFlash = true; if autoSkills { b.autoLearn() }
            case let .wave(n, hint):
                sound.play(.wave); showBanner("Wave \(n) of \(b.totalWaves)", hint, 2)
                // The first time a new foe walks in, name it and say what beats it.
                if n >= 1 && n <= b.stage.waves.count {
                    for g in b.stage.waves[n - 1].groups where isNewFoe(g.kind) && !data.enemy(g.kind).isBoss {
                        metFoes.insert(g.kind)
                        let d = data.enemy(g.kind)
                        showBanner("New foe: \(d.name)", d.answer, 3.6)
                    }
                }
            case let .adapt(el, resist): showBanner("The Hollow adapts", "It hardens against \(Words.element[el] ?? el.rawValue): \(Int((resist * 100).rounded()))% less damage. Mix your towers.", 3.4)
            case let .shift(label, on): showBanner(on ? label : "The way is open again", on ? "Foes on that road wait at the edge. Others go round." : "", 2.6)
            case .barrier: showBanner("The wreck gives way", "The beach road is open. Foes will use it now.", 3)
            case let .boss(kind): sound.play(.boss); let d = data.enemy(kind); showBanner(d.name, d.blurb, 4, now: true)
            case let .phase(n, _, _): sound.play(.boss); showBanner("Boss phase \(n + 1)", "New breaches tear open!", 3)
            case let .night(on): showBanner(on ? "Night falls" : "Morning", on ? "Towers outside a Beacon's light see less. Shades walk." : "Full sight again.", 2.4)
            case let .gear(up): if b.wave > 1 { showBanner(up == .a ? "Gold gears rise" : "Iron gears rise", "Towers on the lowered plots sleep this wave.", 2.4) }
            case .sink: showBanner("The ground gives way", oaths.contains(.shiftingEarth) ? "A plot sinks. Any tower on it was half refunded." : "A plot sinks. Any tower on it was refunded in full.", 2.6)
            case let .skill(key, _, _):
                sound.play(key == .q ? .sweep : key == .w ? .snare : .sunrise)
                if key == .r { showBanner("Sunrise", "Every tower fires twice as fast. Nothing hides.", 2) }
            case let .rune(kind, picked): sound.play(.rune); if !picked { showBanner("\(data.rune(kind).name) rune", "Send Wren to pick it up before it fades.", 2.2) }
            case .heroDown: showBanner("Wren falls", "She returns at the gate in \(Int(b.hero.respawnT.rounded(.up))) s.", 2.4)
            case .revive: showBanner("Second dawn", "Wren stands back up.", 2)
            case let .early(gold): showBanner("Called early", "+\(gold) gold", 1.6)
            case let .won(stars): sound.play(.win); scheduleEnd(won: true, stars: stars)
            case .lost: sound.play(.lose); scheduleEnd(won: false, stars: 0)
            default: break
            }
        }
    }

    /// New foes already introduced in this fight.
    private var metFoes = Set<EnemyKind>()
    /// The stage where each foe first walks in.
    private lazy var firstStage: [EnemyKind: Int] = {
        var out: [EnemyKind: Int] = [:]
        for st in data.stages { for w in st.waves { for g in w.groups where out[g.kind] == nil { out[g.kind] = st.id } } }
        return out
    }()
    func isNewFoe(_ kind: EnemyKind) -> Bool { firstStage[kind] == battle.stage.id && !metFoes.contains(kind) }

    private func scheduleEnd(won: Bool, stars: Int) {
        guard !ended && !resultScheduled else { return }
        resultScheduled = true
        // The win is written down at once; only the card waits. Leaving before it shows never loses the stars.
        if won { embersGained = app.record(stage: battle.stage.id, stars: stars, variant: variant, oaths: oaths) }
        let delay = scene.look.reduceMotion ? 0.12 : (won ? 1.0 : 0.4)
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            self?.end(won: won, stars: stars)
        }
    }

    /* ------------------------------------------------------------------ banners */

    /// Banners wait their turn instead of replacing each other. `now` cuts in line.
    func showBanner(_ title: String, _ sub: String, _ secs: Double, now: Bool = false) {
        if now { bannerQ = []; putBanner(title, sub, secs); return }
        if bannerT > 0 {
            bannerQ.append((title, sub, secs))
            if bannerQ.count > 3 { bannerQ.removeFirst() }
            return
        }
        putBanner(title, sub, secs)
    }

    private func putBanner(_ title: String, _ sub: String, _ secs: Double) {
        bannerId += 1
        // While stage 1 marks a plot, prompts sit at the foot of the map so they never hide it.
        banner = BannerItem(id: bannerId, title: title, sub: sub, secs: secs, low: hintPlot != nil)
        bannerT = secs
    }

    /* ------------------------------------------------------------------ input */

    func tap(_ x: Double, _ y: Double) {
        let b = battle
        if aimingW { _ = b.castW(x: x, y: y); endAim(); return }
        shopOpen = false
        if let si = switchAt(x, y, reach: 34) { _ = b.toggleSwitch(si); tick &+= 1; return }
        if let t = towerAt(x, y) { openTower(t.id); return }
        if let pi = plotAt(x, y) { openPlot(pi); return }
        if menu != nil { closeMenu(); return }
        if let foe = b.foes.first(where: { !$0.dead && hypot2($0.x - x, $0.y - $0.def.bar * 0.4 - y) < 26 + $0.def.size * 8 }), !b.hero.dead {
            b.attackFoe(foe.id); scene.markMove(foe.x, foe.y); return
        }
        if !b.hero.dead && hypot2(b.hero.x - x, b.hero.y - 24 - y) < 38 {
            showLeash.toggle(); tick &+= 1; return
        }
        // A near miss on a lever still counts when nothing else was under the finger.
        if let si = switchAt(x, y, reach: switchReach) { _ = b.toggleSwitch(si); tick &+= 1; return }
        if !b.hero.dead && tapGroundMove { b.moveHero(x: x, y: y); scene.markMove(x, y); showLeash = false }
    }

    /// A lever is small on a phone held sideways: its reach grows so it is never under 44 points across.
    private var switchReach: Double { max(34, 22 / max(0.01, Double(panScale))) }

    private func switchAt(_ x: Double, _ y: Double, reach: Double) -> Int? {
        let b = battle
        return b.switches.indices.first(where: { hypot2(b.switches[$0].def.at.x - x, b.switches[$0].def.at.y - y) < reach })
    }

    private func towerAt(_ x: Double, _ y: Double) -> Tower? {
        battle.towers.first(where: { abs($0.x - x) < 34 && y > $0.y - 110 && y < $0.y + 22 })
    }

    private func plotAt(_ x: Double, _ y: Double) -> Int? {
        let b = battle
        return b.plots.indices.first(where: { i in let p = b.plots[i]; return !p.sunk && ell(p.x - x, p.y - y) < 44 && !b.towers.contains { $0.plot == i } })
    }

    /// True when a switch, tower or plot is under the point: a finger there is not picking Wren up.
    private func structureAt(_ x: Double, _ y: Double) -> Bool {
        switchAt(x, y, reach: 34) != nil || towerAt(x, y) != nil || plotAt(x, y) != nil
    }

    /// Leave W aiming, whether the snare was thrown or called off.
    private func endAim() {
        aimingW = false
        showLeash = false
        scene.look.aiming = false
        scene.look.aimW = nil
        scene.look.showLeash = false
    }

    func openPlot(_ i: Int) {
        let now = Date().timeIntervalSince1970
        menu = .plot(i); armed = nil; sellArmedId = nil; panelOpenedAt = now
        scene.look.selPlot = i; scene.look.selTower = nil; scene.look.preview = nil
    }

    func openTower(_ id: Int) {
        let now = Date().timeIntervalSince1970
        menu = .tower(id); armed = nil; sellArmedId = nil; panelOpenedAt = now
        scene.look.selTower = id; scene.look.selPlot = nil; scene.look.preview = nil
    }

    func closeMenu() {
        menu = nil; armed = nil; sellArmedId = nil
        scene.look.selPlot = nil; scene.look.selTower = nil; scene.look.preview = nil
    }

    /// First tap shows the range and what the tower does; the second tap builds (after brief bounce/arm delay).
    func pickBuild(_ kind: TowerKind) {
        guard case let .plot(pi) = menu else { return }
        let now = Date().timeIntervalSince1970
        if now - panelOpenedAt < 0.2 { return }
        if armed != kind || now - armedAt < 0.3 {
            armed = kind; armedAt = now; scene.look.preview = kind; return
        }
        if battle.build(plot: pi, kind: kind) != nil { closeMenu() }
        tick &+= 1
    }

    /// 2-tap sell guard so fast taps never accidentally scrap an upgraded tower.
    func sellOrArm(_ id: Int) {
        let now = Date().timeIntervalSince1970
        if now - panelOpenedAt < 0.2 { return }
        if sellArmedId == id && now < sellArmedUntil {
            if battle.sell(id) { closeMenu() }
        } else {
            sellArmedId = id
            sellArmedUntil = now + 2.6
        }
        tick &+= 1
    }

    func act(_ f: () -> Void) { f(); tick &+= 1 }

    /// Explicit learn button press (separated from cast so tapping `+` never misfires a skill).
    func learnSkill(_ k: SkillKey) {
        if battle.learn(k) { sound.play(.click) }
        tick &+= 1
    }

    /// Cast a skill, or learn it if unlearned (`r == 0`) or cooling down.
    func skillPress(_ k: SkillKey) {
        let b = battle
        if b.canLearn(k) && (b.hero.rank(k) == 0 || !b.skillReady(k)) { _ = b.learn(k); sound.play(.click); tick &+= 1; return }
        switch k {
        case .q: _ = b.castQ()
        case .r: _ = b.castR()
        case .w where b.skillReady(.w):
            aimingW.toggle()
            showLeash = aimingW
            scene.look.aiming = aimingW
            scene.look.aimW = aimingW ? Vec(b.hero.x + data.snare.range * 0.5 * b.hero.face, b.hero.y) : nil
            if aimingW { showBanner("Lantern Snare", tapAimW ? "Time slows. Tap where to throw it." : "Time slows. Drag or tap inside range.", 1.8, now: true) }
        default: if b.canLearn(k) { _ = b.learn(k) }
        }
        tick &+= 1
    }

    func callWave() { if battle.callWave() { sound.play(.click) }; tick &+= 1 }

    func cycleSpeed() { battle.speed = battle.speed == 1 ? 2 : battle.speed == 2 ? 3 : 1; tick &+= 1 }

    func togglePause() { battle.paused.toggle(); tick &+= 1 }

    func toggleSound() { app.toggleSound(); tick &+= 1 }

    func toggleAutoNext() {
        autoNext.toggle()
        app.setSetting { $0.autoNext = autoNext }
        tick &+= 1
    }

    func toggleLeash() { showLeash.toggle(); tick &+= 1 }

    func sendToGate() {
        guard let g = battle.gate.first else { return }
        battle.moveHero(x: g.x - 60, y: g.y); scene.markMove(g.x - 60, g.y)
    }

    /* ------------------------------------------------------------------ leaving and the end */

    /// Leave, asking first if a fight is under way.
    func requestExit() {
        // Once the fight is decided there is nothing to lose: the result is already recorded.
        if ended || resultScheduled || battle.status == .prep { exit(); return }
        exitWasPaused = battle.paused
        battle.paused = true
        exitAsk = true
    }

    func keepFighting() {
        exitAsk = false
        if !exitWasPaused { battle.paused = false }
        tick &+= 1
    }

    func exit() { app.screen = .campaign(focus: battle.stage.id) }
    func retry() { app.play(battle.stage.id, variant: variant, oaths: oaths) }
    /// The next stage always opens as a plain first run: Standard, with no Oaths carried over.
    func next() { app.play(battle.stage.id + 1, variant: .standard, oaths: []) }

    private func end(won: Bool, stars: Int) {
        guard !ended else { return }
        ended = true
        let b = battle, st = b.stage
        let gained = won ? embersGained : 0
        let need = starLives(b.startLives), lost = b.startLives - b.lives
        let nextStar = won && stars < 3 ? "Lose \(b.startLives - need.three) lives or fewer for 3 stars. You lost \(lost)." : nil
        let worst = leakBy.max { $0.value < $1.value }
        let bd = b.breakdown
        let tot = max(1.0, bd.towers + bd.hero + bd.skills + bd.status)
        let tPct = Int(jsRound(bd.towers / tot * 100))
        let hPct = Int(jsRound((bd.hero + bd.skills) / tot * 100))
        let sPct = max(0, 100 - tPct - hPct)
        let mvp = b.mvpTower()
        let mvpTitle = mvp.map { tw in
            tw.split.flatMap { sp in data.tower(tw.kind).splits.first { $0.id == sp }?.name } ?? data.tower(tw.kind).name
        }
        result = ResultInfo(
            won: won, stars: stars, embers: gained,
            text: won ? "\(st.name) cleared with \(b.lives) lives left. Wren reached level \(b.hero.level)." : "You held until wave \(b.wave) of \(b.totalWaves).",
            nextStar: nextStar,
            cause: !won && worst != nil ? (worst!.key, worst!.value) : nil,
            bdTowersPct: tPct, bdHeroPct: hPct, bdStatusPct: sPct,
            mvpText: mvpTitle.map { "MVP: \($0) (\(Int(mvp!.dmgDealt.rounded())))" })
        closeMenu()
        shopOpen = false
    }
}

/// Words the HUD shares with the web game.
enum Words {
    static let element: [Element: String] = [.pierce: "bolts", .fire: "fire", .frost: "frost", .storm: "lightning", .nature: "roots"]
    static let elementTitle: [Element: String] = [.pierce: "Bolts", .fire: "Fire", .frost: "Frost", .storm: "Lightning", .nature: "Roots"]
    static let mode: [(TargetMode, String)] = [(.first, "First"), (.strong, "Strongest"), (.armored, "Armored"), (.close, "Closest")]
    static let round: [Rounds: String] = [.ember: "Ember", .frost: "Frost", .storm: "Storm"]
    /// What each tower is for, in a few words: shown on the build buttons, since a finger cannot hover.
    static let role: [TowerKind: String] = [
        .watch: "One target, hits fliers", .cannon: "Blasts groups, ground only", .bell: "Slows all around it",
        .pylon: "Jumps foe to foe, hits fliers", .roots: "Holds a foe, ground only", .beacon: "Boosts towers, shows Shades",
    ]
    /// The most the Hollow can harden against one element.
    static let resistCap = 0.6
}
