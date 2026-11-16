package com.njarrar.towerriot.engine

import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * The battle: a headless, deterministic simulation of one stage.
 *
 * A line-for-line port of the iOS engine (ios/TowerRiotKit), which is itself a port of the web engine
 * (src/game/sim.ts). It uses the same random source, the same order of operations and the same rounding,
 * so a given seed and set of moves gives exactly the same battle on Android, iOS and the web.
 * `BotParityTest` checks this on all 20 stages, on every Variant B layout and on a spread of Oath runs.
 * The renderer reads its state and drains `events` each frame; the UI calls its command methods.
 */
class Battle(
    val rawStage: StageDef,
    val mods: Mods = Mods(),
    seed: Int = 1234,
    val variant: StageVariant = StageVariant.standard,
    val oaths: List<OathId> = emptyList(),
    val data: GameData = GameData.shared,
) {
    companion object {
        const val WAVE_GAP = 22.0
        /** Any tower sees hidden foes this close. */
        const val TOWER_SIGHT = 130.0
        const val LIGHTHOUSE_RANGE = 380.0
        val elements = listOf(Element.pierce, Element.fire, Element.frost, Element.storm, Element.nature)

        /** Share of each wave group sent on wave n of total: 55% on the first wave, all of it on the last. */
        fun waveRamp(n: Int, total: Int): Double = if (total <= 1) 1.0 else 0.55 + 0.45 * (n - 1).toDouble() / (total - 1).toDouble()
    }

    val stage: StageDef = rawStage.resolved(variant, oaths)
    val scale: Double = hpScale(stage.id) * (stage.hpMul ?: 1.0)
    private val rng = Rng(seed)

    val roads: List<RoadRt>
    val spawns: List<Pair<String, List<RoadRt>>>
    val plots: List<PlotRt>
    val waters: List<WaterRt>
    val switches: List<SwitchRt>
    val portals: List<PortalRt>
    val gate: List<Vec>
    val startLives: Int

    var status = Status.prep; private set
    var gold: Int; private set
    var lives: Int; private set
    /** Seconds since the first wave was called. */
    var clock = 0.0; private set
    /** Waves started so far (1-based number of the current wave). */
    var wave = 0; private set
    /** Seconds before the next wave starts on its own. Null while a wave is still spawning. */
    var nextIn: Double? = null; private set
    var night = false; private set
    var speed = 1.0
    var paused = false

    val foes = ArrayList<Foe>()
    val towers = ArrayList<Tower>()
    val shots = ArrayList<Shot>()
    val clouds = ArrayList<Cloud>()
    val vents = ArrayList<VentRt>()
    val hero: HeroState
    var rune: RuneState? = null; private set
    var nextRune: Double; private set
    /** How much the Hollow resists each element, by Element ordinal. */
    private val resistArr = DoubleArray(Element.entries.size)
    private val dmgWindow = DoubleArray(Element.entries.size)
    val breakdown = DamageBreakdown()
    private var events = ArrayList<BattleEvent>()
    var kills = 0; private set
    var leaks = 0; private set

    private var activeHigh: List<Vec>? = stage.high
    private val appliedTerraforms = HashSet<Int>()
    private class Queued(val at: Double, val kind: EnemyKind, val spawn: String?)
    private var queue = ArrayList<Queued>()
    private var waveT = 0.0
    private var ids = 1
    private var shiftShift = 0.0
    private var leakedThisWave = false
    private var gateShockUsedWave = -1
    private var threatDirty = true
    private val shiftOn: BooleanArray

    fun resist(e: Element): Double = resistArr[e.ordinal]

    init {
        val sc = scale
        roads = stage.roads.map { def ->
            val path = Path(def.id, smooth(def.ctrl))
            val openWave = def.openAtWave ?: 1
            // Like the web engine's `!def.openOnPhase`: a phase of 0 counts as "no phase".
            val active = openWave <= 1 && (def.openOnPhase ?: 0) == 0
            val spawnOpen = active && (def.closeAtWave == null || def.closeAtWave > 1)
            val rt = RoadRt(def, path, active, openWave == 2, spawnOpen)
            for (s in stage.shifts ?: emptyList()) if (def.id in s.closes) rt.closeAt = path.nearestDistance(s.at)
            // A gate switch holds walkers at its boom, exactly like a tide holds them at a ford.
            for (sw in stage.switches ?: emptyList()) {
                if (sw.mode == SwitchMode.gate && rt.closeAt == null && def.id in (sw.closesB ?: emptyList())) rt.closeAt = path.nearestDistance(sw.at)
            }
            for (b in stage.barriers ?: emptyList()) if (b.road == def.id) {
                val p = path.point(path.tot * b.at)
                rt.barrier = RoadRt.BarrierState(b.hp * sc, b.hp * sc, path.tot * b.at, p.x, p.y)
            }
            for (b in stage.belts ?: emptyList()) if (b.road == def.id) rt.belts.add(RoadRt.BeltState(path.tot * b.from, path.tot * b.to, b.mult))
            rt
        }
        for (v in stage.vents ?: emptyList()) {
            val road = roads.firstOrNull { it.def.id == v.road } ?: continue
            val d = road.path.tot * v.at
            val p = road.path.point(d)
            vents.add(VentRt(p.x, p.y, road, d, v.every, v.every, v.dmg))
        }
        spawns = stage.spawns.map { (id, rs) -> id to rs.mapNotNull { r -> roads.firstOrNull { it.def.id == r.id } } }
        waters = stage.waters.map { WaterRt(it.id, it.w, Path(it.id ?: "w", smooth(it.ctrl))) }
        plots = stage.plots.map { p -> PlotRt(p.at.x, p.at.y, p.gear, (p.openAtWave ?: 1) <= 1, p.rubble, p.rubble?.holdSec ?: 0.0) }
        switches = (stage.switches ?: emptyList()).map { SwitchRt(it) }
        portals = (stage.portals ?: emptyList()).mapNotNull { def ->
            val fromRoad = roads.firstOrNull { it.def.id == def.fromRoad } ?: return@mapNotNull null
            val toRoad = roads.firstOrNull { it.def.id == def.toRoad } ?: return@mapNotNull null
            val fromD = fromRoad.path.tot * def.fromAt
            val toD = toRoad.path.tot * def.toAt
            val fp = fromRoad.path.point(fromD)
            val tp = toRoad.path.point(toD)
            PortalRt(def, fromRoad, toRoad, fromD, toD, Vec(fp.x, fp.y), Vec(tp.x, tp.y), (def.openAtWave ?: 1) <= 1)
        }
        val endKeys = ArrayList<String>()
        val endAt = ArrayList<Vec>()
        for (r in roads) {
            val e = r.path.pts[r.path.pts.size - 1]
            val key = "${jsRound(e.x).toInt()},${jsRound(e.y).toInt()}"
            val i = endKeys.indexOf(key)
            if (i >= 0) endAt[i] = e else { endKeys.add(key); endAt.add(e) }
        }
        gate = endAt
        startLives = stage.lives + mods.lives
        lives = startLives
        gold = stage.startGold + mods.gold
        nextRune = data.runeFirst
        shiftOn = BooleanArray(stage.shifts?.size ?: 0)
        if (OathId.longNight in oaths) night = true
        val lvl = 1 + mods.heroLevel
        val s = heroStartPoint(stage, roads, gate)
        hero = HeroState(s.x, s.y, lvl, lvl + mods.heroSkillPoints)
        recomputePlotTraits()
        hero.hp = heroMaxHp()
        applyGears(1)
    }

    private fun recomputePlotTraits() {
        val activeWaters = if (stage.isLava) emptyList() else waters.filter { !it.drained }
        val hi = activeHigh
        for (p in plots) {
            p.high = hi?.let { inPolygon(Vec(p.x, p.y), it) } ?: false
            p.nearWater = activeWaters.any { it.path.distanceTo(p.x, p.y) < it.w / 2 + 160 }
        }
        for (t in towers) if (t.plot >= 0 && t.plot < plots.size) t.high = plots[t.plot].high
    }

    /** Where Wren starts. A start placed by the gate moves out to the main road, past its middle,
     *  so she meets the first foes and earns XP from the start. */
    private fun heroStartPoint(stage: StageDef, roads: List<RoadRt>, gate: List<Vec>): Vec {
        val st = stage.heroStart
        if (stage.id == 1) return st
        if (gate.none { hypot2(it.x - st.x, it.y - st.y) < 300 }) return st
        val r = roads.filter { it.active }.sortedWith { a, b -> b.path.tot.compareTo(a.path.tot) }.firstOrNull() ?: roads[0]
        val p = r.path.point(r.path.tot * 0.62)
        return Vec(p.x, p.y)
    }

    // ---------------------------------------------------------------- commands

    class WavePreview(val n: Int, val hint: String, val foes: List<Pair<EnemyKind, Int>>, val spawns: List<String>, val openingRoads: List<String>)

    /** What the next wave will send, after the early-wave ramp. Null once every wave has started. */
    fun nextWave(): WavePreview? {
        val n = wave + 1
        if (n > totalWaves) return null
        val w = stage.waves[n - 1]
        val ramp = waveRamp(n, totalWaves)
        val kinds = ArrayList<EnemyKind>()
        val counts = ArrayList<Int>()
        val spawnList = ArrayList<String>()
        for (g in w.groups) {
            val count = max(1, jsRound(g.n * ramp).toInt())
            val i = kinds.indexOf(g.kind)
            if (i >= 0) counts[i] += count else { kinds.add(g.kind); counts.add(count) }
            if (g.spawn != null && g.spawn !in spawnList) spawnList.add(g.spawn)
        }
        if (spawnList.isEmpty()) spawnList.addAll(spawns.map { it.first })
        val opening = roads.filter { it.def.openAtWave == n }.map { it.def.id }
        return WavePreview(n, w.hint, kinds.zip(counts), spawnList, opening)
    }

    /** True if the Hollow adapts when wave `n` starts. */
    fun adaptsAt(n: Int): Boolean {
        if (stage.region == 0 && stage.adaptEvery == null) return false
        val every = stage.adaptEvery ?: 3
        return n > 1 && n <= totalWaves && (n - 1) % every == 0
    }

    class AdaptShare(val top: Element?, val share: Double, val threshold: Double)

    /** Current leading element pressure toward the 42% adaptation threshold. */
    fun adaptationShare(): AdaptShare {
        var total = 0.0
        var top: Element? = null
        for (e in elements) {
            total += dmgWindow[e.ordinal]
            if (top == null || dmgWindow[e.ordinal] > dmgWindow[top.ordinal]) top = e
        }
        val share = if (top != null && total > 0) dmgWindow[top.ordinal] / total else 0.0
        return AdaptShare(top, share, 0.42)
    }

    /** A Herald's aura cuts damage from the element the player leans on most right now. */
    private val heraldCut: Double by lazy { data.enemy(EnemyKind.herald).traits?.aura?.cut ?: 0.0 }

    fun heraldEl(): Element? {
        val s = adaptationShare()
        return if (s.share > 0) s.top else null
    }

    /** The element the Hollow would harden against if it adapted now, if any. */
    fun adaptLean(): Element? {
        val s = adaptationShare()
        return if (s.share > s.threshold) s.top else null
    }

    val totalWaves: Int get() = stage.waves.size
    val over: Boolean get() = status == Status.won || status == Status.lost

    /** Start the next wave. Early calls pay bonus gold without shaving skill cooldowns. */
    fun callWave(): Boolean {
        if (over || wave >= totalWaves) return false
        if (status == Status.running && nextIn == null) return false
        val n = nextIn
        if (status == Status.running && n != null && n > 0) {
            val bonus = ceil(n * 2 * (1 + mods.early)).toInt()
            gold += bonus
            events.add(BattleEvent.Early(bonus))
        }
        status = Status.running
        startWave()
        return true
    }

    /** Set the purse directly. Only for staged scenes, such as the title screen's still frame. */
    fun setGold(g: Int) { gold = g }

    val earlyBonus: Int get() = ceil((nextIn ?: 0.0) * 2 * (1 + mods.early)).toInt()

    fun costOf(kind: TowerKind, level: Int = 1): Int = jsRound(data.tower(kind).cost[level - 1] * (1 + mods.costMul)).toInt()

    fun splitCost(kind: TowerKind, which: SplitId): Int {
        val s = data.tower(kind).splits.first { it.id == which }
        return jsRound(s.cost * (1 + mods.costMul)).toInt()
    }

    fun masteryCost(kind: TowerKind, which: SplitId): Int {
        val s = data.tower(kind).splits.first { it.id == which }
        return jsRound(s.masteryCost * (1 + mods.costMul)).toInt()
    }

    fun canBuild(plot: Int, kind: TowerKind): Boolean {
        if (plot < 0 || plot >= plots.size) return false
        val p = plots[plot]
        return p.unlocked && !p.sunk && p.rubble == null && kind in stage.towers && towers.none { it.plot == plot } && gold >= costOf(kind)
    }

    fun build(plot: Int, kind: TowerKind): Tower? {
        if (!canBuild(plot, kind)) return null
        val p = plots[plot]
        val cost = costOf(kind)
        gold -= cost
        val t = Tower(nextId(), kind, plot, p.x, p.y, cost, p.high)
        p.gear?.let { t.down = !gearUp(it) }
        towers.add(t)
        threatDirty = true
        events.add(BattleEvent.Build(t.id, t.x, t.y))
        return t
    }

    fun canClearPlot(plot: Int): Boolean {
        if (plot < 0 || plot >= plots.size) return false
        val p = plots[plot]
        val r = p.rubble ?: return false
        return p.unlocked && !p.sunk && gold >= r.cost
    }

    fun clearPlot(plot: Int, free: Boolean = false): Boolean {
        if (plot < 0 || plot >= plots.size) return false
        val p = plots[plot]
        if (!p.unlocked || p.sunk) return false
        val r = p.rubble ?: return false
        if (!free && gold < r.cost) return false
        if (!free) gold -= r.cost
        p.rubble = null
        p.rubbleLeft = 0.0
        events.add(BattleEvent.ClearPlot(plot, free))
        return true
    }

    fun toggleSwitch(index: Int): Boolean {
        if (index < 0 || index >= switches.size) return false
        val s = switches[index]
        if (s.cdLeft > 0) return false
        if (s.def.mode != SwitchMode.fork && s.activeT > 0) return false
        s.state = if (s.state == 0) 1 else 0
        if (s.def.mode == SwitchMode.fork) {
            s.cdLeft = s.def.cd
        } else {
            s.activeT = s.def.dur ?: 10.0
            s.cdLeft = s.def.cd
        }
        threatDirty = true
        updateShifts()
        events.add(BattleEvent.SwitchFlip(s.def.id, s.def.label, s.state))
        return true
    }

    fun upgradeCost(t: Tower): Int? {
        if (t.lv < 3) return costOf(t.kind, t.lv + 1)
        val sp = t.split
        if (sp != null && t.lv == 4 && t.lv < data.maxTowerLevel) return masteryCost(t.kind, sp)
        return null
    }

    fun upgrade(id: Int): Boolean {
        val t = tower(id) ?: return false
        val c = upgradeCost(t) ?: return false
        if (gold < c) return false
        gold -= c; t.spent += c; t.lv += 1
        threatDirty = true
        events.add(BattleEvent.Upgrade(t.id, t.x, t.y))
        return true
    }

    fun splitTower(id: Int, which: SplitId): Boolean {
        val t = tower(id) ?: return false
        if (t.lv != 3 || !mods.splits) return false
        val c = splitCost(t.kind, which)
        if (gold < c) return false
        gold -= c; t.spent += c; t.lv = 4; t.split = which
        threatDirty = true
        events.add(BattleEvent.Upgrade(t.id, t.x, t.y))
        return true
    }

    fun sellValue(t: Tower): Int = floor(t.spent * (0.7 + mods.sell)).toInt()

    fun sell(id: Int): Boolean {
        val t = tower(id) ?: return false
        gold += sellValue(t)
        towers.removeAll { it === t }
        threatDirty = true
        events.add(BattleEvent.Sell(t.id, t.x, t.y))
        return true
    }

    fun setMode(id: Int, mode: TargetMode) { tower(id)?.mode = mode }

    fun setRound(id: Int, round: Rounds?) {
        val t = tower(id) ?: return
        if ((round == null || round in mods.rounds) && t.kind != TowerKind.beacon && t.kind != TowerKind.bell) t.round = round
    }

    fun tower(id: Int): Tower? = towers.firstOrNull { it.id == id }

    /** Pin Wren to a post. She holds there and engages foes inside her 90 px leash without dropping road block. */
    fun moveHero(x: Double, y: Double) {
        if (hero.dead || !x.isFinite() || !y.isFinite()) return
        hero.tx = clamp(x, 20.0, 1260.0); hero.ty = clamp(y, 85.0, 705.0)
        hero.anchorX = hero.tx; hero.anchorY = hero.ty
        hero.focus = null
    }

    /** Tell Wren to fight one foe (explicit tap or boss focus updates post anchor so she commits). */
    fun attackFoe(id: Int) {
        val f = foes.firstOrNull { it.id == id } ?: return
        if (hero.dead) return
        hero.focus = id
        hero.tx = clamp(f.x, 20.0, 1260.0); hero.ty = clamp(f.y, 85.0, 705.0)
        hero.anchorX = hero.tx; hero.anchorY = hero.ty
    }

    fun canLearn(key: SkillKey): Boolean {
        val s = data.skill(key)
        val r = hero.rank(key)
        if (hero.points < 1 || r >= s.maxRank) return false
        if (key == SkillKey.w && !mods.skillW) return false
        if (key == SkillKey.r && !mods.skillR) return false
        return hero.level >= s.needLevel[r]
    }

    fun learn(key: SkillKey): Boolean {
        if (!canLearn(key)) return false
        hero.points -= 1
        hero.ranks[key.ordinal] += 1
        return true
    }

    /** Spend free points the way most players would: ultimate first, then Q, E and W in turn. */
    fun autoLearn() {
        val order = listOf(SkillKey.r, SkillKey.q, SkillKey.e, SkillKey.w, SkillKey.q, SkillKey.e, SkillKey.w)
        var guardLeft = 40
        while (hero.points > 0 && guardLeft > 0) {
            guardLeft -= 1
            val k = order.firstOrNull { canLearn(it) } ?: SkillKey.entries.firstOrNull { canLearn(it) } ?: break
            learn(k)
        }
    }

    fun skillReady(key: SkillKey): Boolean = !hero.dead && hero.rank(key) > 0 && hero.cooldown(key) <= 0 && key != SkillKey.e

    fun castQ(): Boolean {
        if (!skillReady(SkillKey.q)) return false
        val r = hero.rank(SkillKey.q)
        val dmg = data.sweep.dmg[r - 1] * (1 + mods.sweep) * heroDmgMul()
        eachFoe { f ->
            if (reachable(f, true) && ell(f.x - hero.x, f.y - hero.y) < data.sweep.radius) {
                damage(f, dmg, DamageSource.El(Element.hero), byHero = true, bucket = Bucket.skills)
            }
        }
        hero.cd[SkillKey.q.ordinal] = data.skill(SkillKey.q).cd[r - 1]
        hero.swing = 0.35
        events.add(BattleEvent.Skill(SkillKey.q, hero.x, hero.y))
        return true
    }

    fun castW(tx: Double, ty: Double): Boolean {
        if (!skillReady(SkillKey.w)) return false
        val r = hero.rank(SkillKey.w)
        val sn = data.snare
        var x = tx
        var y = ty
        val dx = x - hero.x
        val dy = y - hero.y
        val dist = hypot2(dx, dy)
        if (dist > sn.range) { x = hero.x + dx / dist * sn.range; y = hero.y + dy / dist * sn.range }
        val hold = sn.hold[r - 1] + mods.snare
        val burst = sn.dmg[r - 1] * heroDmgMul()
        val burnDps = burst * sn.burnDpsMul
        eachFoe { f ->
            if (reachable(f, true) && !f.def.isFlying && ell(f.x - x, f.y - y) < sn.radius) {
                if (!f.def.isBoss) f.rootT = max(f.rootT, hold)
                f.burnT = max(f.burnT, sn.burnSec)
                f.burnDps = max(f.burnDps, burnDps)
                damage(f, burst, DamageSource.El(Element.hero), byHero = true, bucket = Bucket.skills)
            }
        }
        hero.cd[SkillKey.w.ordinal] = data.skill(SkillKey.w).cd[r - 1]
        events.add(BattleEvent.Skill(SkillKey.w, x, y))
        return true
    }

    fun castR(): Boolean {
        if (!skillReady(SkillKey.r)) return false
        val r = hero.rank(SkillKey.r)
        hero.sunriseT = data.sunrise.dur[r - 1] + mods.sunrise
        hero.cd[SkillKey.r.ordinal] = data.skill(SkillKey.r).cd[r - 1]
        events.add(BattleEvent.Skill(SkillKey.r, hero.x, hero.y))
        return true
    }

    /** Wren heals faster at the gate. */
    fun nearGate(): Boolean = !hero.dead && gate.any { hypot2(it.x - hero.x, it.y - hero.y) < data.hero.gateRadius }

    /** Courier buys away from the gate during active combat cost +20%; free at gate, prep, or cleared wave. */
    fun itemCost(id: ItemId): Int {
        val base = data.item(id).cost
        val freeCourier = nearGate() || status == Status.prep || (nextIn != null && foes.isEmpty())
        return (if (freeCourier) base else jsRound(base * (1 + data.courierSurcharge))).toInt()
    }

    /** Wren can trade anytime while alive; away from the gate during combat adds the courier surcharge. */
    fun canShop(): Boolean = !hero.dead

    fun canBuy(id: ItemId): Boolean {
        val it = data.item(id)
        return canShop() && hero.items.size < data.itemSlots && gold >= itemCost(id) && mods.shopAfter >= it.after && id !in hero.items
    }

    fun buy(id: ItemId): Boolean {
        if (!canBuy(id)) return false
        val before = heroMaxHp()
        gold -= itemCost(id)
        hero.items.add(id)
        hero.hp += heroMaxHp() - before
        events.add(BattleEvent.Buy(id))
        return true
    }

    fun sellItem(id: ItemId): Boolean {
        if (!canShop() || id !in hero.items) return false
        hero.items.removeAll { it == id }
        gold += floor(data.item(id).cost * data.sellItem).toInt()
        hero.hp = min(hero.hp, heroMaxHp())
        events.add(BattleEvent.SellItem(id))
        return true
    }

    // ---------------------------------------------------------------- hero numbers

    internal fun sumItems(key: (ItemDef) -> Double?): Double {
        var s = 0.0
        for (id in hero.items) s += key(data.item(id)) ?: 0.0
        return s
    }

    fun heroMaxHp(): Double {
        val h = data.hero
        return h.hp + h.hpPerLevel * (hero.level - 1).toDouble() + sumItems { it.hp }
    }

    fun heroDmg(): Double {
        val h = data.hero
        return (h.dmg + h.dmgPerLevel * (hero.level - 1).toDouble() + sumItems { it.dmg }) * heroDmgMul()
    }

    fun heroDmgMul(): Double = if (hero.double > 0) 2.0 else 1.0
    fun heroSpeed(): Double = data.hero.speed * (1 + sumItems { it.speed }) * (if (hero.haste > 0) 2.0 else 1.0)
    fun heroSight(): Double = data.hero.sight + sumItems { it.sight }
    fun xpNeeded(): Double = xpToNext(hero.level)

    // ---------------------------------------------------------------- tower numbers

    private fun beaconRange(b: Tower): Double {
        val bi = min(b.lv, 3) - 1
        val bw = if (mods.tidePearl && b.plot >= 0 && b.plot < plots.size && plots[b.plot].nearWater) 0.15 else 0.0
        val br = if (b.lv >= data.maxTowerLevel) GameData.SPLIT_MASTERY_RANGE else 1.0
        val splitMul = if (b.split != null) 1.1 else 1.0
        val highMul = if (b.high) 1.2 else 1.0
        val allMul = 1.0 + mods.rangeAll + bw
        // Same left-to-right order as the web engine.
        return data.tower(TowerKind.beacon).range[bi] * splitMul * br * allMul * highMul
    }

    /** Final numbers for a tower right now, after levels, splits, mastery, trees, beacons, night and Wren.
     *  `splitOverride` replaces the tower's split when `overrideSplit` is true (null meaning no split). */
    fun stats(t: Tower, lvOverride: Int? = null, overrideSplit: Boolean = false, splitOverride: SplitId? = null): TowerStats {
        val lv = lvOverride ?: t.lv
        val spId: SplitId? = if (overrideSplit) splitOverride else t.split
        val def = data.tower(t.kind)
        val i = min(lv, 3) - 1
        val waterBonus = if (mods.tidePearl && t.plot >= 0 && t.plot < plots.size && plots[t.plot].nearWater) 0.15 else 0.0
        var dmg = def.dmg[i] * (1 + (mods.towerDmg[t.kind] ?: 0.0) + mods.dmgAll)
        var range = def.range[i] * (1 + (mods.towerRange[t.kind] ?: 0.0) + mods.rangeAll + waterBonus) * (if (t.high) 1.2 else 1.0)
        var rate = def.rate[i]
        var crit = 0.0
        var jumps = 2 + mods.jumps
        var splash = 60 * (1 + mods.blast)
        var shells = 1
        val buffs = ArrayList<String>()
        if (t.high) buffs.add("High +20% rng")
        if (waterBonus > 0) buffs.add("Tide Pearl +15%")
        val sp = spId?.let { id -> def.splits.firstOrNull { it.id == id } }
        if (sp != null) {
            dmg *= sp.dmgMul
            range *= sp.rangeMul
            rate *= sp.rateMul
            // The web engine tests these for truthiness, so 0 means "not set" (except jumpsOverride).
            sp.crit?.let { if (it != 0.0) crit = it }
            sp.shells?.let { if (it != 0) shells = it }
            sp.jumpsDelta?.let { if (it != 0) jumps += it }
            sp.jumpsOverride?.let { jumps = it }
            sp.splashMul?.let { if (it != 0.0) splash *= it }
            if (lv >= data.maxTowerLevel) {
                if (t.kind != TowerKind.beacon) {
                    dmg *= GameData.SPLIT_MASTERY_DMG
                    if (t.kind == TowerKind.watch && spId == SplitId.a) crit += 0.1
                    if (t.kind == TowerKind.cannon && spId == SplitId.a) splash *= 1.18
                    if (t.kind == TowerKind.cannon && spId == SplitId.b) splash *= 1.1
                    if (t.kind == TowerKind.pylon && spId == SplitId.a) jumps += 1
                }
                if (t.kind == TowerKind.beacon || t.kind == TowerKind.bell) range *= GameData.SPLIT_MASTERY_RANGE
            }
        }
        var rateMul = 1 + mods.rateAll
        if (t.kind != TowerKind.beacon) {
            var buff = 0.0
            var drum = 0.0
            var fire = 0.0
            for (b in towers) {
                if (b.kind != TowerKind.beacon || b.down) continue
                val bs = beaconRange(b)
                if (ell(b.x - t.x, b.y - t.y) > bs) continue
                val bi = min(b.lv, 3) - 1
                val splitBuff = if (b.lv >= data.maxTowerLevel) 0.11 else if (b.lv >= 4) 0.05 else 0.0
                buff = max(buff, data.beaconBuff[bi] + splitBuff)
                if (b.split == SplitId.a) drum = max(drum, if (b.lv >= data.maxTowerLevel) 0.28 else 0.2)
                if (b.split == SplitId.b) fire = max(fire, if (b.lv >= data.maxTowerLevel) 0.35 else 0.25)
            }
            if (buff > 0) buffs.add("Beacon +${jsRound(buff * 100).toInt()}%")
            if (drum > 0) buffs.add("Drum +${jsRound(drum * 100).toInt()}% spd")
            if (fire > 0) buffs.add("Watchfire +${jsRound(fire * 100).toInt()}% rng")
            dmg *= 1 + buff; rateMul += drum; range *= 1 + fire
            if (night && buff == 0.0 && !inLighthouse(t.x, t.y)) {
                range *= 0.85
                buffs.add("Night -15% rng")
            }
        }
        val h = hero
        if (!h.dead && ell(h.x - t.x, h.y - t.y) < data.attune.radius) {
            if (h.rank(SkillKey.e) > 0) {
                val aRate = data.attune.rate[h.rank(SkillKey.e) - 1] + mods.attune
                rateMul += aRate
                buffs.add("Attune +${jsRound(aRate * 100).toInt()}% spd")
            }
            val aura = sumItems { it.auraDmg }
            if (aura > 0) { dmg *= 1 + aura; buffs.add("Mantle +12%") }
            if (h.double > 0) { dmg *= 2; buffs.add("2x Rune") }
        }
        if (h.sunriseT > 0) { rateMul *= 2; buffs.add("Sunrise 2x") }
        if (stage.weather == "rain" && def.element == Element.fire) { dmg *= 0.8; buffs.add("Rain -20%") }
        return TowerStats(dmg, range, rate / rateMul, crit, jumps, splash, shells, def.hitsFlying, buffs)
    }

    fun mvpTower(): Tower? {
        var best: Tower? = null
        for (t in towers) if (best == null || t.dmgDealt > best.dmgDealt) best = t
        return best?.takeIf { it.dmgDealt > 0 }
    }

    // ---------------------------------------------------------------- the loop

    /** Advance the battle. Large steps are split so fast forward stays stable. */
    fun step(dt: Double) {
        if (paused || over) return
        var left = dt * speed
        while (left > 1e-6) {
            val s = min(left, 1.0 / 30)
            tick(s)
            left -= s
            if (over) break
        }
    }

    private fun tick(dt: Double) {
        val running = status == Status.running
        if (running) clock += dt
        updateSwitches(dt)
        updateShifts()
        if (running) updateWave(dt)
        if (running) updateRunes(dt)
        updateVents(dt)
        updateFoes(dt)
        updateHero(dt)
        updateTowers(dt)
        updateShots(dt)
        updateClouds(dt)
        foes.removeAll { it.dead }
        if (lives <= 0) {
            finish(false)
        } else if (running && wave >= totalWaves && queue.isEmpty() && foes.isEmpty()) {
            finish(true)
        }
    }

    private fun finish(won: Boolean) {
        if (won) {
            status = Status.won
            events.add(BattleEvent.Won(starsFor(lives)))
        } else {
            status = Status.lost
            lives = 0
            events.add(BattleEvent.Lost)
        }
    }

    private fun starsFor(lives: Int): Int {
        val share = lives.toDouble() / startLives.toDouble()
        return if (share >= 0.9) 3 else if (share >= 0.5) 2 else 1
    }

    val stars: Int get() = if (status == Status.won) starsFor(lives) else 0

    // ---------------------------------------------------------------- waves

    private fun startWave() {
        wave += 1
        val n = wave
        val w = stage.waves[n - 1]
        waveT = 0.0
        leakedThisWave = false
        val ramp = waveRamp(n, totalWaves)
        for (g in w.groups) {
            val count = max(1, jsRound(g.n * ramp).toInt())
            for (i in 0 until count) queue.add(Queued(g.delay + i * g.gap / ramp, g.kind, g.spawn))
        }
        queue = ArrayList(queue.sortedWith { a, b -> a.at.compareTo(b.at) })
        nextIn = null
        events.add(BattleEvent.Wave(n, w.hint))
        if (n > 1) gold += 15 + n * 3
        if (adaptsAt(n)) adapt()
        applyGears(n)

        // Unlock scheduled roads and telegraph upcoming breaches one wave early.
        for (r in roads) {
            val open = r.def.openAtWave
            if (!r.active && open != null && n >= open) {
                openRoad(r, r.def.closeAtWave == null || n < r.def.closeAtWave)
            }
            val close = r.def.closeAtWave
            if (r.active && close != null && n >= close) r.spawnOpen = false
            if (!r.active && r.def.openAtWave == n + 1) {
                r.telegraph = true
                events.add(BattleEvent.RiftWarn(r.def.id, n + 1))
            }
        }
        for (i in plots.indices) {
            val def = stage.plots[i]
            if (!plots[i].unlocked && (def.openAtWave ?: 1) <= n) plots[i].unlocked = true
            if (def.sinkAt == n && !plots[i].sunk) sinkPlot(i)
        }
        for (p in portals) if (!p.active && (p.def.openAtWave ?: 1) <= n) p.active = true
        var waterChanged = false
        for (i in stage.waters.indices) {
            if (stage.waters[i].drainAtWave == n && i < waters.size && !waters[i].drained) {
                waters[i].drained = true
                waterChanged = true
            }
        }
        if (waterChanged) recomputePlotTraits()
        for ((idx, tf) in (stage.terraforms ?: emptyList()).withIndex()) {
            if (tf.atWave == n && idx !in appliedTerraforms) {
                appliedTerraforms.add(idx)
                applyTerraform(tf)
            }
        }
        if (stage.night == true) {
            val on = if (OathId.longNight in oaths) true else n % 2 == 0
            if (on != night) { night = on; events.add(BattleEvent.Night(on)); threatDirty = true }
        }
    }

    /** Open a road for good. A fork switch that was holding the new road shut flips onto it, so the road is really used. */
    private fun openRoad(r: RoadRt, spawnOpen: Boolean) {
        r.active = true
        r.telegraph = false
        r.spawnOpen = spawnOpen
        for (s in switches) {
            if (s.def.mode != SwitchMode.fork) continue
            val shut = if (s.state == 0) s.def.closesA else s.def.closesB
            if (r.def.id in (shut ?: emptyList())) s.state = if (s.state == 0) 1 else 0
        }
        threatDirty = true
        updateShifts()
        events.add(BattleEvent.RiftOpen(r.def.id))
    }

    private fun sinkPlot(i: Int) {
        if (i < 0 || i >= plots.size || plots[i].sunk) return
        plots[i].sunk = true
        val t = towers.firstOrNull { it.plot == i }
        if (t != null) {
            // A sinking plot refunds its tower in full, except under the Shifting Earth oath.
            gold += if (OathId.shiftingEarth in oaths) jsRound(t.spent * StageDef.SHIFTING_EARTH_REFUND).toInt() else t.spent
            towers.removeAll { it === t }
            threatDirty = true
        }
        events.add(BattleEvent.Sink(i))
    }

    private fun applyTerraform(tf: TerraformDef) {
        var traitRefresh = false
        val ws = tf.waters
        if (!ws.isNullOrEmpty()) {
            for (w in waters) {
                val wid = w.id
                if (wid.isNullOrEmpty() || wid !in ws) continue
                w.drained = tf.kind == TerraformKind.drain
                traitRefresh = true
            }
        }
        for (id in tf.openRoads ?: emptyList()) {
            val r = roads.firstOrNull { it.def.id == id } ?: continue
            if (!r.active) openRoad(r, true) else r.spawnOpen = true
        }
        for (id in tf.closeRoads ?: emptyList()) roads.firstOrNull { it.def.id == id }?.spawnOpen = false
        for (i in tf.openPlots ?: emptyList()) if (i >= 0 && i < plots.size) { plots[i].unlocked = true; traitRefresh = true }
        for (i in tf.sinkPlots ?: emptyList()) sinkPlot(i)
        tf.highPoly?.let { activeHigh = it; traitRefresh = true }
        if (traitRefresh) recomputePlotTraits()
        threatDirty = true
        events.add(BattleEvent.Terraform(tf.label))
    }

    private fun adapt() {
        var total = 0.0
        var top: Element? = null
        for (e in elements) {
            total += dmgWindow[e.ordinal]
            if (top == null || dmgWindow[e.ordinal] > dmgWindow[top.ordinal]) top = e
        }
        if (top != null && total > 0 && dmgWindow[top.ordinal] / total > 0.42) {
            for (e in elements) {
                resistArr[e.ordinal] = if (e == top) min(0.6, resistArr[e.ordinal] + 0.2) else max(0.0, resistArr[e.ordinal] - 0.1)
            }
            events.add(BattleEvent.Adapt(top, resistArr[top.ordinal]))
        }
        for (e in elements) dmgWindow[e.ordinal] = 0.0
    }

    /** Whether gear plots of this kind are raised on the current wave. */
    fun gearUp(g: SplitId): Boolean = (max(1, wave) % 2 == 1) == (g == SplitId.a)

    private fun applyGears(n: Int) {
        if (stage.plots.none { it.gear != null }) return
        for (t in towers) {
            val g = plots[t.plot].gear
            t.down = if (g != null) !gearUp(g) else false
        }
        if (n > 0) events.add(BattleEvent.Gear(if (n % 2 == 1) SplitId.a else SplitId.b))
        threatDirty = true
    }

    private fun updateWave(dt: Double) {
        waveT += dt
        while (queue.isNotEmpty() && queue[0].at <= waveT) {
            val q = queue.removeAt(0)
            spawn(q.kind, q.spawn)
        }
        if (queue.isEmpty() && nextIn == null && wave < totalWaves) nextIn = WAVE_GAP
        var n = nextIn
        if (n != null) {
            if (foes.isEmpty()) n = min(n, 12.0)
            n -= dt
            nextIn = n
            if (n <= 0) { nextIn = 0.0; startWave() }
        }
    }

    /** Spawn a foe at a rift. On a fork it takes the road with the least threat. */
    internal fun spawn(kind: EnemyKind, spawnId: String? = null, atRoad: RoadRt? = null, atD: Double = 0.0): Foe {
        val def = data.enemy(kind)
        val road: RoadRt
        val d: Double
        if (atRoad != null) { road = atRoad; d = atD } else {
            val activeSpawns = spawns.filter { (_, rs) -> rs.any { it.active && it.spawnOpen } }.map { it.first }
            val chosenId: String = run {
                if (!spawnId.isNullOrEmpty()) {
                    val rs = spawns.firstOrNull { it.first == spawnId }?.second
                    if (rs != null && rs.any { it.active && it.spawnOpen }) return@run spawnId
                }
                activeSpawns.firstOrNull() ?: spawns[0].first
            }
            val options = spawns.firstOrNull { it.first == chosenId }?.second ?: roads.filter { it.active }
            road = pickRoad(options, def)
            d = 0.0
        }
        val id = nextId()
        val p = road.path.point(d)
        val off = if (def.isBoss) 0.0 else (rng.next() - 0.5) * road.def.w * 0.5
        val hp = def.hp * scale
        val speed = def.speed * (0.94 + rng.next() * 0.12)
        val f = Foe(id, kind, def, road, d, p, off, hp, speed)
        foes.add(f)
        if (def.isBoss) events.add(BattleEvent.Boss(kind))
        return f
    }

    private fun pickRoad(options: List<RoadRt>, def: EnemyDef): RoadRt {
        val active = options.filter { it.active && it.spawnOpen }
        val pool = if (active.isEmpty()) options.filter { it.active } else active
        val cand = if (pool.isEmpty()) options else pool
        if (cand.size == 1) return cand[0]
        val sapper = def.traits?.sapper ?: false
        val wallUp = { r: RoadRt -> r.barrier?.let { it.hp > 0 } ?: false }
        var open = cand.filter { !it.closed && (sapper || !wallUp(it)) }
        if (sapper) open.firstOrNull(wallUp)?.let { return it }
        if (open.isEmpty()) open = cand.filter { !wallUp(it) }
        if (open.isEmpty()) open = cand
        if (open.size == 1) return open[0]
        if (threatDirty) computeThreat()
        val w = open.map { r -> val k = 20 + (if (def.isFlying) r.airThreat else r.threat) / 40; 1 / (k * k) }
        var x = rng.next() * w.fold(0.0) { a, b -> a + b }
        for (i in open.indices) { x -= w[i]; if (x <= 0) return open[i] }
        return open[open.size - 1]
    }

    /** How much tower fire covers each road: damage per second times the length it covers. */
    private fun computeThreat() {
        threatDirty = false
        for (r in roads) {
            var ground = 0.0
            var air = 0.0
            for (t in towers) {
                if (t.kind == TowerKind.beacon || t.down) continue
                val s = stats(t)
                var cover = 0.0
                var d = 0.0
                while (d < r.path.tot) {
                    val p = r.path.point(d)
                    if (ell(p.x - t.x, p.y - t.y) < s.range) cover += 1
                    d += 24
                }
                if (cover == 0.0) continue
                val dps = if (t.kind == TowerKind.bell) 18.0 else (s.dmg * s.shells / s.rate) * (if (t.kind == TowerKind.pylon) 1 + 0.35 * s.jumps else 1.0)
                val v = cover * dps
                ground += v
                if (s.hitsFlying) air += v
            }
            r.threat = ground
            r.airThreat = air
        }
    }

    /** Threat per road id, for tests. */
    fun roadThreat(): Map<String, Double> {
        if (threatDirty) computeThreat()
        return roads.associate { it.def.id to it.threat }
    }

    private fun updateSwitches(dt: Double) {
        for (s in switches) {
            val at = s.def.at
            s.boosted = !hero.dead && hypot2(hero.x - at.x, hero.y - at.y) < 48
            if (s.activeT > 0) {
                s.activeT = max(0.0, s.activeT - dt)
                if (s.activeT == 0.0 && s.def.mode != SwitchMode.fork) {
                    s.state = 0
                    threatDirty = true
                }
            }
            if (s.cdLeft > 0 && (s.def.mode == SwitchMode.fork || s.activeT <= 0)) {
                s.cdLeft = max(0.0, s.cdLeft - dt * (if (s.boosted) 2 else 1))
            }
        }
    }

    private fun updateShifts() {
        val shifts = stage.shifts ?: emptyList()
        val closed = HashSet<String>()
        for ((i, s) in shifts.withIndex()) {
            val t = clock + shiftShift
            val phase = ((t - s.start) % s.every + s.every) % s.every
            val on = status == Status.running && phase < s.dur
            if (on != shiftOn[i]) { shiftOn[i] = on; events.add(BattleEvent.ShiftEv(if (on) s.label else "The way is open again", on)) }
            if (on) closed.addAll(s.closes)
        }
        for (sw in switches) {
            if (sw.def.mode == SwitchMode.fork) {
                val list = if (sw.state == 0) sw.def.closesA else sw.def.closesB
                closed.addAll(list ?: emptyList())
            } else if (sw.def.mode == SwitchMode.gate && sw.activeT > 0) {
                closed.addAll(sw.def.closesB ?: emptyList())
            }
        }
        for (r in roads) r.closed = r.def.id in closed
    }

    /** True while a shift is active, for the renderer. */
    fun shiftActive(i: Int): Boolean = i < shiftOn.size && shiftOn[i]

    private fun updateRunes(dt: Double) {
        nextRune -= dt
        if (nextRune <= 0) {
            nextRune = data.runeEvery
            val kind = data.runeOrder[floor(rng.next() * data.runeOrder.size).toInt()]
            rune = RuneState(kind, stage.rune.x, stage.rune.y, data.runeLifetime)
            events.add(BattleEvent.RuneEv(kind, false))
        }
        val r = rune ?: return
        r.ttl -= dt
        if (!hero.dead && hypot2(r.x - hero.x, r.y - hero.y) < 40) {
            rune = null
            when (r.kind) {
                RuneKind.haste -> hero.haste = data.rune(RuneKind.haste).dur
                RuneKind.double -> hero.double = data.rune(RuneKind.double).dur
                RuneKind.regen -> hero.regenT = data.rune(RuneKind.regen).dur
                RuneKind.bounty -> { gold += 30 + wave * 6; giveXp(40 + wave.toDouble() * 20) }
            }
            if (mods.runeAttune) hero.sunriseT = max(hero.sunriseT, 3.0)
            events.add(BattleEvent.RuneEv(r.kind, true))
        } else if (r.ttl <= 0) {
            rune = null
        }
    }

    private fun updateVents(dt: Double) {
        for (v in vents) {
            val boosted = !hero.dead && hypot2(hero.x - v.x, hero.y - v.y) < 44
            v.t -= dt * (if (boosted) 2 else 1)
            if (v.t > 0) continue
            v.t = v.every
            events.add(BattleEvent.VentEv(v.x, v.y))
            eachFoe { f ->
                if (!f.def.isFlying && !f.under && ell(f.x - v.x, f.y - v.y) < 56) damage(f, v.dmg * scale, DamageSource.Env, byHero = false, bucket = Bucket.status)
            }
        }
    }

    // ---------------------------------------------------------------- foes

    fun inLighthouse(x: Double, y: Double): Boolean {
        val l = stage.lighthouse ?: return false
        return ell(l.x - x, l.y - y) < LIGHTHOUSE_RANGE
    }

    /** Visit every foe, including any spawned during the visit, as the web engine does. */
    private inline fun eachFoe(body: (Foe) -> Unit) {
        var i = 0
        while (i < foes.size) { body(foes[i]); i++ }
    }

    private fun updateFoes(dt: Double) {
        val wardens = foes.filter { (it.def.traits?.shield ?: 0.0) != 0.0 && !it.dead }
        val heralds = foes.filter { it.def.traits?.aura != null && !it.dead && !it.under }
        val beacons = towers.filter { it.kind == TowerKind.beacon && !it.down }
        val beaconRange = data.tower(TowerKind.beacon).range
        var blocking = 0
        val sight = heroSight()
        val hd = data.hero
        var i = 0
        while (i < foes.size) {
            val f = foes[i]
            i += 1
            if (f.dead) continue
            val tr = f.def.traits
            f.slowT = max(0.0, f.slowT - dt); if (f.slowT == 0.0) f.slow = 0.0
            f.rootT = max(0.0, f.rootT - dt)
            f.staggerT = max(0.0, f.staggerT - dt)
            f.freezeT = max(0.0, f.freezeT - dt)
            f.freezeImmune = max(0.0, f.freezeImmune - dt)
            f.vulnT = max(0.0, f.vulnT - dt)
            f.burstT = max(0.0, f.burstT - dt)
            f.hitT = max(0.0, f.hitT - dt)
            f.paneCd = max(0.0, f.paneCd - dt)
            val pn = tr?.panes
            if (pn != null && f.panes < pn.n) {
                f.paneT -= dt
                if (f.paneT <= 0) { f.panes += 1; f.paneT = pn.regrow }
            }
            if (f.burnT > 0) {
                f.burnT -= dt
                damage(f, f.burnDps * dt, DamageSource.El(Element.fire), byHero = false, quiet = true, bucket = Bucket.status)
                if (f.dead) continue
                if (f.burnT <= 0) { f.burnT = 0.0; f.burnDps = 0.0 }
            }

            tr?.burrow?.let { b ->
                f.underT -= dt
                if (f.underT <= 0) { f.under = !f.under; f.underT = if (f.under) b[0] else b[1] }
            }
            tr?.dive?.let { dv ->
                f.underT -= dt
                if (f.underT <= 0) {
                    f.under = !f.under; f.underT = if (f.under) dv.dur else dv.every
                    events.add(BattleEvent.Dive(f.x, f.y, f.under))
                }
                if (f.under) f.hp = min(f.max, f.hp + f.max * 0.01 * dt)
            }
            tr?.summon?.let { sm ->
                f.abilityT -= dt
                if (f.abilityT <= 0) {
                    f.abilityT = sm.every
                    for (k in 0 until sm.n) spawn(sm.kind, atRoad = f.road, atD = max(0.0, f.d - 20 - k * 18.0))
                }
            }
            val held = f.rootT > 0 || f.freezeT > 0 || f.staggerT > 0
            tr?.lunge?.let { lg ->
                f.lungeT = max(0.0, f.lungeT - dt)
                if (f.slow > 0 || held || f.blocked) f.lungeT = 0.0
                f.abilityT -= dt
                if (f.abilityT <= 0) {
                    f.abilityT = lg.every
                    if (f.slow <= 0 && !held && !f.blocked) { f.lungeT = lg.dur; events.add(BattleEvent.Lunge(f.x, f.y)) }
                }
            }
            tr?.stamp?.let { st ->
                f.abilityT -= dt
                if (f.abilityT <= 0) {
                    f.abilityT = st.every
                    if (!held) {
                        for (t in towers) if (ell(t.x - f.x, t.y - f.y) < st.r) t.stunT = max(t.stunT, st.stun)
                        events.add(BattleEvent.Stamp(f.x, f.y, st.r))
                    }
                }
            }
            val heal = tr?.heal
            if (heal != null && heal != 0.0) {
                f.abilityT -= dt
                if (f.abilityT <= 0) {
                    f.abilityT = 2.0
                    for (o in foes) if (!o.dead && ell(o.x - f.x, o.y - f.y) < 100) o.hp = min(o.max, o.hp + o.max * heal)
                }
            }
            val ph = tr?.phases
            if (ph != null && f.phase < ph.size && f.hp / f.max < ph[f.phase]) {
                f.phase += 1
                f.burstT = 4.0
                shiftShift += 20
                for (r in roads) {
                    val op = r.def.openOnPhase
                    if (!r.active && op != null && f.phase >= op) openRoad(r, true)
                }
                for ((idx, tf) in (stage.terraforms ?: emptyList()).withIndex()) {
                    if (tf.atPhase == f.phase && idx !in appliedTerraforms) {
                        appliedTerraforms.add(idx)
                        applyTerraform(tf)
                    }
                }
                tr.summon?.kind?.let { brood ->
                    for (k in 0 until 6) spawn(brood, atRoad = f.road, atD = max(0.0, f.d - 30 - k * 16.0))
                }
                events.add(BattleEvent.Phase(f.phase, f.x, f.y))
            }

            f.shielded = (tr?.shield ?: 0.0) == 0.0 && wardens.any { ell(it.x - f.x, it.y - f.y) < (it.def.traits?.shield ?: 0.0) }
            f.warded = tr?.aura == null && heralds.any { ell(it.x - f.x, it.y - f.y) < (it.def.traits?.aura?.r ?: 0.0) }
            if (tr?.stealth == true) {
                val seen = (!hero.dead && hypot2(hero.x - f.x, hero.y - f.y) < sight) ||
                    hero.sunriseT > 0 ||
                    inLighthouse(f.x, f.y) ||
                    (tr.veil != true && towers.any { ell(it.x - f.x, it.y - f.y) < TOWER_SIGHT }) ||
                    beacons.any { ell(it.x - f.x, it.y - f.y) < beaconRange[min(it.lv, 3) - 1] }
                f.hidden = !seen
            } else {
                f.hidden = false
            }

            // Pin and leash hold: stepping inside 36 px of the pinned anchor keeps Wren's block active.
            f.blocked = false
            val inLeash = hypot2(hero.x - hero.anchorX, hero.y - hero.anchorY) <= 36
            if (!hero.dead && (!hero.moving || inLeash) && !f.def.isFlying && !f.under && blocking < hd.blocks && hypot2(hero.x - f.x, hero.y - f.y) < 30 + f.def.size * 10) {
                f.blocked = true; blocking += 1
                val armor = min(0.6, sumItems { it.armor })
                hero.hp -= f.def.dps * scale * 0.6 * (1 - armor) * dt
            }

            var mul = if (f.slow > 0) 1 - f.slow else 1.0
            if (f.rootT > 0 || f.freezeT > 0 || f.staggerT > 0 || f.blocked) mul = 0.0
            if (f.burstT > 0) mul *= 1.6
            if (f.lungeT > 0) tr?.lunge?.let { mul *= it.mult }
            val activeBrake = switches.firstOrNull { it.def.mode == SwitchMode.belt && it.activeT > 0 && it.def.targetRoad == f.road.def.id }
            if (activeBrake != null) {
                mul *= activeBrake.def.beltMult ?: 0.55
            } else {
                for (b in f.road.belts) if (f.d >= b.from && f.d <= b.to) mul *= b.mult
            }
            if (f.under && tr?.burrow != null) mul *= 1.4
            var nd = f.d + f.speed * mul * dt
            val c = f.road.closeAt
            if (f.road.closed && c != null && f.d < c - 30 && !f.def.isFlying) nd = min(nd, c - 40)
            val bar = f.road.barrier
            if (bar != null && bar.hp > 0 && !f.def.isFlying && f.d < bar.d) {
                nd = min(nd, bar.d - 26)
                if (tr?.sapper == true && nd >= bar.d - 30) {
                    bar.hp -= 40 * dt
                    if (bar.hp <= 0) {
                        bar.hp = 0.0
                        threatDirty = true
                        events.add(BattleEvent.BarrierEv(f.road.def.id, true))
                    }
                }
            }
            f.d = nd

            if (!f.def.isBoss) {
                for (pi in portals.indices) {
                    val pt = portals[pi]
                    if (!pt.active || !pt.toRoad.active) continue
                    if ((pt.def.groundOnly ?: true) && f.def.isFlying) continue
                    if (f.road !== pt.fromRoad || (f.warpedMask and (1 shl pi)) != 0) continue
                    if (f.d >= pt.fromD && f.d <= pt.fromD + 28) {
                        pt.count += 1
                        if (pt.count % (pt.def.everyNth ?: 1) == 0) {
                            val oldX = f.x
                            val oldY = f.y
                            f.warpedMask = f.warpedMask or (1 shl pi)
                            f.road = pt.toRoad
                            f.d = pt.toD
                            val tp = f.road.path.point(f.d)
                            f.x = tp.x; f.y = tp.y; f.dir = tp.dir
                            events.add(BattleEvent.Warp(oldX, oldY, f.x, f.y, pt.def.kind))
                            break
                        }
                        f.warpedMask = f.warpedMask or (1 shl pi)
                    }
                }
            }

            val p = f.road.path.point(f.d)
            val nx = p.x + f.off * 0.3
            val ny = p.y + f.off * 0.3
            if (kotlin.math.abs(nx - f.x) > 0.01) f.dir = jsSign(nx - f.x)
            f.x = nx; f.y = ny
            if (f.d >= f.road.path.tot - 2) leak(f)
        }
    }

    private fun leak(f: Foe) {
        f.dead = true
        if ((mods.ironGate || mods.gateShock) && !leakedThisWave && !f.def.isBoss) {
            leakedThisWave = true
            if (mods.gateShock && gateShockUsedWave != wave) {
                gateShockUsedWave = wave
                events.add(BattleEvent.GateShock(f.x, f.y))
                for (o in foes) if (!o.dead && !o.def.isBoss && hypot2(o.x - f.x, o.y - f.y) < 160) o.rootT = max(o.rootT, 2.5)
            }
            return
        }
        leakedThisWave = true
        lives = max(0, lives - f.def.leak)
        leaks += f.def.leak
        events.add(BattleEvent.Leak(f.x, f.y, f.def.leak, f.kind, f.hp / f.max))
    }

    /** Can this foe be hit right now? */
    fun reachable(f: Foe, byHero: Boolean = false): Boolean {
        if (f.dead || f.under) return false
        if (f.hidden && !byHero) return false
        return true
    }

    internal fun damage(
        f: Foe, amount0: Double, src: DamageSource, byHero: Boolean, quiet: Boolean = false, crit: Boolean = false,
        sourceTower: Tower? = null, bucket: Bucket? = null, armorPierceExtra: Double = 0.0,
    ): Double {
        if (!reachable(f, true) || amount0 <= 0) return 0.0
        if (f.panes > 0) {
            // Each hit breaks one pane and does no harm. Burns and vents only scratch the glass;
            // a spore cloud breaks a pane now and then.
            val tick = bucket == Bucket.status
            if (tick && src != DamageSource.El(Element.nature)) return 0.0
            if (f.paneCd > 0) return 0.0
            f.panes -= 1
            f.paneCd = if (tick) 0.6 else 0.12
            f.paneT = f.def.traits?.panes?.regrow ?: 2.5
            events.add(BattleEvent.Pane(f.x, f.y - f.def.bar * 0.6, f.panes))
            return 0.0
        }
        var amount = amount0
        val srcEl = (src as? DamageSource.El)?.el
        if (f.warded && srcEl != null && srcEl != Element.hero && srcEl == heraldEl()) amount *= 1 - heraldCut
        var m = 1.0
        var dmgEl: Element? = null
        if (srcEl != null) {
            dmgEl = srcEl
            m = f.def.takes?.get(srcEl.name) ?: 1.0
            if (srcEl != Element.hero) m *= 1 - resistArr[srcEl.ordinal]
        }
        if (f.shielded) m *= 0.6
        if (f.vulnT > 0) m *= 1.25
        val chilled = f.slowT > 0 || f.freezeT > 0
        if (chilled && ((dmgEl == Element.fire && mods.shatter) || ((dmgEl == Element.hero || dmgEl == Element.fire) && mods.burnShatter && (byHero || quiet)))) {
            m *= 1.5
        }
        val plated = f.def.traits?.plated
        if (plated != null && plated != 0.0 && !chilled) m *= plated
        var dmg = amount * m
        val armor = f.def.traits?.armor
        if (armor != null && armor != 0.0 && !quiet) {
            val pierce = min(1.0, mods.armorPierce + armorPierceExtra)
            dmg = max(dmg * 0.15, dmg - armor * armorScale(stage.id) * (1 - pierce))
        }
        if (dmg <= 0) return 0.0
        val prevHp = max(0.0, f.hp)
        val clamped = min(prevHp, dmg)
        f.hp -= dmg
        f.hitT = 0.12
        if (dmgEl != null && dmgEl != Element.hero) dmgWindow[dmgEl.ordinal] += clamped
        val b = bucket ?: if (quiet) Bucket.status else if (byHero) Bucket.hero else Bucket.towers
        when (b) {
            Bucket.towers -> breakdown.towers += clamped
            Bucket.hero -> breakdown.hero += clamped
            Bucket.skills -> breakdown.skills += clamped
            Bucket.status -> breakdown.status += clamped
        }
        sourceTower?.let { it.dmgDealt += clamped }
        if (!quiet) events.add(BattleEvent.Hit(f.x, f.y - f.def.bar * 0.6, dmg, crit, src))
        if (f.hp <= 0) kill(f, byHero, sourceTower)
        return dmg
    }

    private fun kill(f: Foe, byHero: Boolean, sourceTower: Tower?) {
        if (f.dead) return
        f.dead = true
        kills += 1
        sourceTower?.let { it.kills += 1 }
        val bonus = if (byHero) 1 + data.hero.lastHit + mods.lastHit else 1.0
        val g = jsRound(f.def.gold * goldScale(stage.id) * bonus).toInt()
        gold += g
        events.add(BattleEvent.Kill(f.x, f.y, f.kind, g, byHero))
        if (!hero.dead) giveXp(f.def.hp * 0.45 * scale * (if (hypot2(hero.x - f.x, hero.y - f.y) < data.hero.xpRadius) 1.0 else data.hero.xpFar))
        f.def.traits?.splitInto?.let { sp ->
            for (k in 0 until sp.n) {
                val c = spawn(sp.kind, atRoad = f.road, atD = max(0.0, f.d - k * 14.0))
                c.off = (k - 1) * 12.0
            }
        }
        if (hero.focus == f.id) hero.focus = null
    }

    private fun giveXp(xp: Double) {
        hero.xp += xp
        while (hero.level < data.hero.maxLevel && hero.xp >= xpToNext(hero.level)) {
            hero.xp -= xpToNext(hero.level)
            val before = heroMaxHp()
            hero.level += 1; hero.points += 1
            hero.hp += heroMaxHp() - before
            events.add(BattleEvent.Level(hero.level))
        }
        if (hero.level >= data.hero.maxLevel) hero.xp = 0.0
    }

    // ---------------------------------------------------------------- hero

    private fun heroInheritedRound(): Rounds? {
        if (!mods.roundInherit) return null
        var best: Tower? = null
        var bestD = data.attune.radius
        for (t in towers) {
            if (t.round == null || t.down) continue
            val d = ell(t.x - hero.x, t.y - hero.y)
            if (d < bestD) { bestD = d; best = t }
        }
        return best?.round
    }

    private fun updateHero(dt: Double) {
        val hd = data.hero
        for (k in listOf(SkillKey.q, SkillKey.w, SkillKey.r)) hero.cd[k.ordinal] = max(0.0, hero.cooldown(k) - dt)
        hero.haste = max(0.0, hero.haste - dt); hero.double = max(0.0, hero.double - dt); hero.regenT = max(0.0, hero.regenT - dt)
        hero.sunriseT = max(0.0, hero.sunriseT - dt); hero.swing = max(0.0, hero.swing - dt)
        if (hero.dead) {
            hero.respawnT -= dt
            if (hero.respawnT <= 0) {
                hero.dead = false
                hero.hp = heroMaxHp()
                val g = gate[0]
                hero.x = g.x - 60; hero.tx = hero.x; hero.anchorX = hero.x
                hero.y = g.y - 20; hero.ty = hero.y; hero.anchorY = hero.y
                events.add(BattleEvent.HeroUp)
            }
            return
        }
        val maxHp = heroMaxHp()
        var regen = hd.regen + sumItems { it.regen }
        if (nearGate()) regen += hd.gateRegen
        if (hero.regenT > 0) regen += maxHp * 0.12
        hero.hp = min(maxHp, hero.hp + regen * dt)
        if (hero.hp <= 0) {
            if (ItemId.seconddawn in hero.items && !hero.revived) {
                hero.revived = true
                hero.items.removeAll { it == ItemId.seconddawn }
                hero.hp = maxHp
                events.add(BattleEvent.Revive)
            } else {
                hero.dead = true; hero.hp = 0.0; hero.respawnT = hd.respawn(hero.level); hero.focus = null; hero.moving = false
                events.add(BattleEvent.HeroDown)
                return
            }
        }

        // Wren clears an adjacent rubble plot free of charge when standing still beside it.
        for (pi in plots.indices) {
            val p = plots[pi]
            if (!p.unlocked || p.sunk) continue
            val r = p.rubble ?: continue
            val holdSec = r.holdSec ?: continue
            if (holdSec == 0.0) continue
            if (status == Status.running && !hero.moving && hypot2(p.x - hero.x, p.y - hero.y) <= 48) {
                p.rubbleLeft -= dt
                if (p.rubbleLeft <= 0) clearPlot(pi, true)
            } else {
                p.rubbleLeft = holdSec
            }
        }

        // Engage targets within the pinned leash, or the focus target.
        var target: Foe? = null
        val focus = hero.focus
        if (focus != null) target = foes.firstOrNull { it.id == focus && reachable(it, true) }
        if (target == null) {
            hero.focus = null
            var best = Double.POSITIVE_INFINITY
            for (f in foes) {
                if (!reachable(f, true)) continue
                if (hypot2(f.x - hero.anchorX, f.y - hero.anchorY) > hd.leash) continue
                val score = hypot2(f.x - hero.x, f.y - hero.y) - (if (f.blocked) 200 else 0)
                if (score < best) { best = score; target = f }
            }
        }
        var gx = hero.tx
        var gy = hero.ty
        val t = target
        if (t != null) {
            val dist = hypot2(t.x - hero.x, t.y - hero.y)
            val reach = hd.reach + t.def.size * 6
            if (dist > reach) {
                val toTarget = hypot2(t.x - hero.anchorX, t.y - hero.anchorY)
                if (hero.focus != null || toTarget <= hd.leash) { gx = t.x; gy = t.y + 4 }
            } else {
                gx = hero.x; gy = hero.y
            }
        }
        val dx = gx - hero.x
        val dy = gy - hero.y
        val dist = hypot2(dx, dy)
        val stepLen = heroSpeed() * dt
        hero.moving = dist > 3
        if (dist > 0.5) {
            val k = min(1.0, stepLen / dist)
            hero.x += dx * k; hero.y += dy * k
            if (kotlin.math.abs(dx) > 1) hero.face = jsSign(dx)
        }
        val foe = target
        if (foe == null) { hero.atkCd = max(0.0, hero.atkCd - dt); return }
        hero.atkCd -= dt
        if (hypot2(foe.x - hero.x, foe.y - hero.y) <= hd.reach + foe.def.size * 6 && hero.atkCd <= 0) {
            hero.atkCd = hd.atkRate / (1 + sumItems { it.atkSpeed })
            hero.swing = 0.25
            val s = jsSign(foe.x - hero.x)
            if (s != 0.0) hero.face = s
            val dmg = heroDmg()
            damage(foe, dmg, DamageSource.El(Element.hero), byHero = true, bucket = Bucket.hero)
            val inherited = heroInheritedRound()
            if (inherited != null && !foe.dead) applyRound(inherited, foe, dmg)
            if (sumItems { it.sunder } > 0 && !foe.dead) {
                foe.burnT = max(foe.burnT, 2.5)
                foe.burnDps = max(foe.burnDps, dmg * 0.2)
                foe.vulnT = max(foe.vulnT, 2.5)
            }
            val cleave = sumItems { it.cleave }
            if (cleave > 0) {
                eachFoe { o ->
                    if (o !== foe && reachable(o, true) && ell(o.x - foe.x, o.y - foe.y) < 70) {
                        damage(o, dmg * cleave, DamageSource.El(Element.hero), byHero = true, quiet = true, bucket = Bucket.hero)
                    }
                }
            }
            events.add(BattleEvent.HeroHit(foe.x, foe.y - 18))
        }
    }

    // ---------------------------------------------------------------- towers

    private fun targetable(f: Foe, t: Tower, range: Double, flying: Boolean): Boolean {
        if (!reachable(f) || (f.def.isFlying && !flying)) return false
        return ell(f.x - t.x, f.y - t.y) < range
    }

    private fun pick(t: Tower, range: Double, flying: Boolean): Foe? {
        var best: Foe? = null
        var score = Double.NEGATIVE_INFINITY
        for (f in foes) {
            if (!targetable(f, t, range, flying)) continue
            val s = when (t.mode) {
                TargetMode.first -> f.d / f.road.path.tot + (if (f.def.isBoss) 0.01 else 0.0)
                TargetMode.strong -> f.hp
                TargetMode.armored -> (f.def.traits?.armor ?: 0.0) * 1000 + (if ((f.def.traits?.plated ?: 0.0) != 0.0) 500 else 0) + f.hp * 0.001
                TargetMode.close -> -ell(f.x - t.x, f.y - t.y)
            }
            if (s > score) { score = s; best = f }
        }
        return best
    }

    private fun updateTowers(dt: Double) {
        for (t in towers.toList()) {
            t.fired += dt
            if (t.stunT > 0) { t.stunT = max(0.0, t.stunT - dt); continue }
            if (t.kind == TowerKind.beacon || t.down) continue
            val s = stats(t)
            t.cd -= dt
            val picked = pick(t, s.range, s.hitsFlying)
            if (picked != null) {
                val want = atan2(picked.y - t.y, picked.x - t.x)
                if (t.kind == TowerKind.cannon) {
                    var da = want - t.aim
                    while (da > PI) da -= PI * 2
                    while (da < -PI) da += PI * 2
                    t.aim += da * min(1.0, dt * 7)
                } else {
                    t.aim = want
                }
            }
            if (t.cd > 0 || picked == null) continue
            t.cd = s.rate
            t.fired = 0.0
            attack(t, picked, s)
        }
    }

    private fun attack(t: Tower, target: Foe, s: TowerStats) {
        val el = data.tower(t.kind).element
        t.shotCount += 1
        when (t.kind) {
            TowerKind.watch -> {
                val bolts = if (t.lv >= data.maxTowerLevel && t.split == SplitId.b && t.shotCount % 4 == 0) 2 else 1
                for (b in 0 until bolts) {
                    val crit = s.crit > 0 && rng.next() < s.crit
                    val dist = hypot2(target.x - t.x, target.y - t.y)
                    shots.add(
                        Shot(
                            nextId(), ShotKind.bolt, t.id, t.x + b * 6.0, t.y - 110 * (if (t.split != null) 1.08 else 1.0), target.x, target.y,
                            target.id, -b * 0.05, max(0.12, dist / 950), s.dmg * (if (crit) 3 else 1), el, 0.0, t.round, crit,
                        ),
                    )
                }
                events.add(BattleEvent.ShotFired(t.id, ShotKind.bolt))
            }
            TowerKind.cannon -> {
                val dur = if (t.split == SplitId.a) 0.65 else 0.68
                var belt = 1.0
                for (b in target.road.belts) if (target.d >= b.from && target.d <= b.to) belt *= b.mult
                val lead = if (target.rootT > 0 || target.freezeT > 0 || target.blocked) 0.0 else target.speed * (1 - target.slow) * belt * dur
                for (i in 0 until s.shells) {
                    val off = if (s.shells > 1) (i - 1) * 54.0 else 0.0
                    val p = target.road.path.point(target.d + lead + off)
                    shots.add(Shot(nextId(), ShotKind.shell, t.id, t.x, t.y - 44, p.x, p.y, target.id, -i * 0.08, dur, s.dmg, el, s.splash, t.round, false))
                }
                events.add(BattleEvent.ShotFired(t.id, ShotKind.shell))
            }
            TowerKind.bell -> {
                val slow = min(0.75, 0.4 + mods.slow)
                val freezeDur = if (t.lv >= data.maxTowerLevel && t.split == SplitId.a) 1.3 else 0.9
                eachFoe { f ->
                    if (targetable(f, t, s.range, true)) {
                        f.slow = max(f.slow, if (f.def.isBoss) slow * 0.5 else slow)
                        f.slowT = max(f.slowT, 1.6)
                        if (t.split == SplitId.a && f.freezeImmune <= 0 && !f.def.isBoss) { f.freezeT = freezeDur; f.freezeImmune = 2.6 }
                        if (t.split == SplitId.b) f.vulnT = 2.0
                        damage(f, s.dmg, DamageSource.El(el), byHero = false, quiet = true, sourceTower = t, bucket = Bucket.towers)
                    }
                }
                events.add(BattleEvent.Pulse(t.id, t.x, t.y, s.range))
            }
            TowerKind.pylon -> {
                val pts = arrayListOf(Vec(t.x, t.y - 100))
                val hit = HashSet<Int>()
                val held = target.rootT > 0 || target.freezeT > 0
                var cur: Foe? = target
                var dmg = if (t.split == SplitId.b && held) s.dmg * 1.35 else s.dmg
                val pierceExtra = if (t.lv >= data.maxTowerLevel && t.split == SplitId.b && !target.def.isBoss) 0.3 else 0.0
                var jumps = if (t.split == SplitId.b) 0 else s.jumps + (if (mods.overload && held) 2 else 0)
                val reach = if (stage.weather == "rain") 220.0 else 120.0
                while (cur != null) {
                    val c: Foe = cur
                    hit.add(c.id)
                    pts.add(Vec(c.x, c.y - 14))
                    damage(c, dmg, DamageSource.El(el), byHero = false, sourceTower = t, bucket = Bucket.towers, armorPierceExtra = pierceExtra)
                    if (c === target) applyRound(t.round, c, dmg, t)
                    if (jumps <= 0) break
                    jumps -= 1
                    dmg *= 0.75
                    var next: Foe? = null
                    var bd = reach
                    for (f in foes.toList()) {
                        if (f.id in hit || !reachable(f)) continue
                        val d = hypot2(f.x - c.x, f.y - c.y)
                        if (d < bd) { bd = d; next = f }
                    }
                    cur = next
                }
                events.add(BattleEvent.Arc(pts))
            }
            TowerKind.roots -> {
                val hold = 1.2 + mods.hold
                val catchR = if (t.lv >= data.maxTowerLevel && t.split == SplitId.a) 90.0 else 70.0
                val caught = if (t.split == SplitId.a) {
                    foes.filter { reachable(it) && !it.def.isFlying && hypot2(it.x - target.x, it.y - target.y) < catchR }
                } else listOf(target)
                for (f in caught) {
                    if (!f.def.isBoss) f.rootT = max(f.rootT, hold)
                    damage(f, s.dmg, DamageSource.El(el), byHero = false, sourceTower = t, bucket = Bucket.towers)
                    applyRound(t.round, f, s.dmg, t)
                }
                if (t.split == SplitId.b) {
                    val cloudDur = if (t.lv >= data.maxTowerLevel) 4.0 else 3.0
                    clouds.add(Cloud(target.x, target.y, 64.0, s.dmg * 0.9, cloudDur))
                }
                events.add(BattleEvent.RootEv(target.x, target.y))
            }
            TowerKind.beacon -> {}
        }
    }

    private fun applyRound(round: Rounds?, f: Foe, dmg: Double, sourceTower: Tower? = null) {
        if (round == null || f.dead) return
        when (round) {
            Rounds.ember -> { f.burnT = 2.0; f.burnDps = max(f.burnDps, dmg * 0.25) }
            Rounds.frost -> { f.slow = max(f.slow, 0.2); f.slowT = max(f.slowT, 1.0) }
            Rounds.storm -> {
                if (rng.next() >= 0.18) return
                var next: Foe? = null
                var bd = 100.0
                for (o in foes) {
                    if (o === f || !reachable(o)) continue
                    val d = hypot2(o.x - f.x, o.y - f.y)
                    if (d < bd) { bd = d; next = o }
                }
                if (next != null) {
                    damage(next, dmg * 0.5, DamageSource.El(Element.storm), byHero = false, sourceTower = sourceTower, bucket = Bucket.towers)
                    events.add(BattleEvent.Arc(listOf(Vec(f.x, f.y - 14), Vec(next.x, next.y - 14))))
                }
            }
        }
    }

    private fun updateShots(dt: Double) {
        for (shot in shots) {
            shot.t += dt
            if (shot.t < 0) continue
            var f = foes.firstOrNull { it.id == shot.foe }
            if (shot.kind == ShotKind.bolt) {
                if (f == null || !reachable(f)) {
                    var bd = 65.0
                    f = null
                    for (o in foes) {
                        if (!reachable(o)) continue
                        val d = hypot2(o.x - shot.tx, o.y - shot.ty)
                        if (d < bd) { bd = d; f = o }
                    }
                    if (f != null) shot.foe = f.id
                }
                if (f != null && !f.dead) { shot.tx = f.x; shot.ty = f.y }
            }
            if (shot.t < shot.dur) continue
            shot.t = -99.0
            val src = tower(shot.tower)
            when (shot.kind) {
                ShotKind.bolt -> {
                    if (f != null && reachable(f)) {
                        if (shot.crit && src != null && src.lv >= data.maxTowerLevel && src.split == SplitId.a && !f.def.isBoss) {
                            f.staggerT = max(f.staggerT, 0.35)
                        }
                        damage(f, shot.dmg, DamageSource.El(shot.el), byHero = false, crit = shot.crit, sourceTower = src, bucket = Bucket.towers)
                        applyRound(shot.round, f, shot.dmg, src)
                    }
                }
                ShotKind.shell -> {
                    events.add(BattleEvent.Boom(shot.tx, shot.ty, shot.splash))
                    eachFoe { o ->
                        if (o.dead || o.def.isFlying || !reachable(o)) return@eachFoe
                        val d = ell(o.x - shot.tx, o.y - shot.ty)
                        if (d > shot.splash) return@eachFoe
                        val dmg = shot.dmg * (if (d < shot.splash * 0.4) 1.0 else 0.6)
                        damage(o, dmg, DamageSource.El(shot.el), byHero = false, sourceTower = src, bucket = Bucket.towers)
                        applyRound(shot.round, o, dmg, src)
                    }
                }
            }
        }
        shots.removeAll { it.t < -50 }
    }

    private fun updateClouds(dt: Double) {
        for (c in clouds) {
            c.t -= dt
            eachFoe { f ->
                if (!f.dead && !f.def.isFlying && ell(f.x - c.x, f.y - c.y) < c.r) damage(f, c.dps * dt, DamageSource.El(Element.nature), byHero = false, quiet = true, bucket = Bucket.status)
            }
        }
        clouds.removeAll { it.t <= 0 }
    }

    private fun nextId(): Int = ids++

    /** Remove and return the events since the last call. */
    fun drain(): List<BattleEvent> {
        val out = events
        events = ArrayList()
        return out
    }
}

/** The fewest lives that still earn 3 and 2 stars: 90% and 50% of the lives you start with. */
fun starLives(start: Int): Pair<Int, Int> {
    var three = start
    var two = start
    while (three > 0 && (three - 1).toDouble() / start >= 0.9) three -= 1
    while (two > 0 && (two - 1).toDouble() / start >= 0.5) two -= 1
    return three to two
}
