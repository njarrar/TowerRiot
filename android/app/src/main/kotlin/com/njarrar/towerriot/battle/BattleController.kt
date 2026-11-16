package com.njarrar.towerriot.battle

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.njarrar.towerriot.AppModel
import com.njarrar.towerriot.engine.Battle
import com.njarrar.towerriot.engine.BattleEvent
import com.njarrar.towerriot.engine.Element
import com.njarrar.towerriot.engine.EnemyKind
import com.njarrar.towerriot.engine.OathId
import com.njarrar.towerriot.engine.Rounds
import com.njarrar.towerriot.engine.ShotKind
import com.njarrar.towerriot.engine.SkillKey
import com.njarrar.towerriot.engine.SplitId
import com.njarrar.towerriot.engine.StageVariant
import com.njarrar.towerriot.engine.Status
import com.njarrar.towerriot.engine.TargetMode
import com.njarrar.towerriot.engine.Tower
import com.njarrar.towerriot.engine.TowerKind
import com.njarrar.towerriot.engine.Vec
import com.njarrar.towerriot.engine.World
import com.njarrar.towerriot.engine.ell
import com.njarrar.towerriot.engine.hypot2
import com.njarrar.towerriot.engine.jsRound
import com.njarrar.towerriot.engine.starLives
import com.njarrar.towerriot.sound.Sound
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/**
 * Runs one fight: steps the battle each frame, turns events into sound and banners, and holds what the HUD shows.
 * A port of the iOS BattleController (itself a port of src/ui/battle.ts). The HUD reads the battle directly;
 * `tick` tells Compose when to look again.
 */
class BattleController(stageId: Int, val variant: StageVariant, val oaths: List<OathId>, private val app: AppModel) {
    val battle: Battle
    val scene: BattleRenderer
    val autoSkills: Boolean

    sealed class Menu {
        data class Plot(val i: Int) : Menu()
        data class TowerMenu(val id: Int) : Menu()
    }
    data class BannerItem(val id: Int, val title: String, val sub: String, val secs: Double, val low: Boolean)
    class ResultInfo(
        val won: Boolean, val stars: Int, val embers: Int,
        val text: String, val nextStar: String?,
        val cause: Pair<EnemyKind, Int>?,
        val bdTowersPct: Int, val bdHeroPct: Int, val bdStatusPct: Int,
        val mvpText: String?,
    )

    /** Bumped a few times a second so the HUD redraws without redrawing every frame. */
    var tick by mutableIntStateOf(0); private set
    /** Bumped every frame, for the map. */
    var frameNo by mutableIntStateOf(0); private set
    var menu by mutableStateOf<Menu?>(null); private set
    var banner by mutableStateOf<BannerItem?>(null); private set
    var shopOpen by mutableStateOf(false)
    var aimingW by mutableStateOf(false); private set
    var showLeash by mutableStateOf(false)
    var autoNext by mutableStateOf(false)
    var hintPlot by mutableStateOf<Int?>(null); private set
    /** A finger cannot hover: the first tap on a build button shows the range, the second pays. */
    var armed by mutableStateOf<TowerKind?>(null); private set
    var sellArmedId by mutableStateOf<Int?>(null); private set
    var exitAsk by mutableStateOf(false); private set
    var result by mutableStateOf<ResultInfo?>(null); private set
    var levelFlash by mutableStateOf(false); private set
    /** Upright phones: the world x at the middle of the screen. The map is wider than the screen and slides under a drag. */
    var viewCentre by mutableDoubleStateOf(World.width / 2); private set
    /** Set by the view on each layout: pixels per world unit, and half the world width in view. */
    private var panScale = 1.0
    private var panHalf = World.width / 2
    var canPan = false; private set

    private var frames = 0
    private var bannerT = 0.0
    private val bannerQ = ArrayDeque<Triple<String, String, Double>>()
    private var bannerId = 0
    private var lvlT = 0.0
    private val leakBy = HashMap<EnemyKind, Int>()
    private var exitWasPaused = false
    private var ended = false
    private var resultScheduled = false
    private var endAt: Double? = null
    private var endWon = false
    private var endStars = 0
    private var embersGained = 0
    private var panelOpenedAt = 0.0
    private var armedAt = 0.0
    private var sellArmedUntil = 0.0

    private fun now() = System.nanoTime() / 1e9

    init {
        val st = app.data.stage(stageId)
        battle = Battle(st, app.save.mods, (System.currentTimeMillis() and 0xffff).toInt(), variant, oaths)
        scene = BattleRenderer(battle)
        autoSkills = app.autoSkills(stageId)
        autoNext = app.save.settings.autoNext
        scene.look.reduceMotion = app.save.settings.reduceMotion
        scene.look.dmgNumbers = app.save.settings.dmgNumbers
        start()
        // Open on the marked plot, or on Wren, when only part of the map shows.
        viewCentre = hintPlot?.let { battle.plots[it].x } ?: battle.hero.x
    }

    val data get() = battle.data
    private val sound: Sound get() = app.sound
    val soundOn: Boolean get() = app.save.settings.sound
    val leftHandHud: Boolean get() = app.save.settings.leftHandHud
    private val tapGroundMove: Boolean get() = app.save.settings.tapGroundMove
    val tapAimW: Boolean get() = app.save.settings.tapAimW

    private fun bump() { tick += 1 }

    private fun start() {
        val st = battle.stage
        // Stage 1 opens on the build prompt alone: the name card would sit over the marked plot.
        if (st.id != 1) showBanner(st.name, st.twist, 4.0)
        if (st.id == 1) {
            // One skill works right away. Building comes first; how to move Wren follows the first tower.
            if (battle.canLearn(SkillKey.q)) battle.learn(SkillKey.q)
            val hx = battle.hero.x; val hy = battle.hero.y
            var best = 0
            for ((i, p) in battle.plots.withIndex()) {
                if (hypot(p.x - hx, p.y - hy) < hypot(battle.plots[best].x - hx, battle.plots[best].y - hy)) best = i
            }
            hintPlot = best
            scene.look.hintPlot = best
            showBanner("Build your first tower", "Tap the marked plot. Towers do most of the work.", 5.0)
        }
        if (autoSkills) battle.autoLearn()
    }

    /* ------------------------------------------------------------------ sliding map */

    /** The view tells the controller how the map is shown; a map that fits leaves nothing to slide. */
    fun setView(scale: Double, halfWidth: Double) {
        panScale = scale; panHalf = halfWidth
        canPan = halfWidth < World.width / 2 - 1
    }

    /** The world x at the middle of the screen, kept so the map never slides past its edges. */
    fun centre(): Double = min(max(viewCentre, panHalf), World.width - panHalf)

    fun pan(dx: Double) {
        if (menu != null) closeMenu()
        viewCentre = min(max(centre() - dx / max(0.01, panScale), panHalf), World.width - panHalf)
    }

    /* ------------------------------------------------------------------ loop */

    /** One frame of `dt` real seconds: step the fight, react, and move the picture on. */
    fun frame(dt: Double) {
        val simDt = if (aimingW) dt * 0.25 else dt
        battle.step(simDt)
        val events = battle.drain()
        react(events)
        // Auto-call waits for a clear field, so waves never pile up on each other.
        if (autoNext && !battle.paused && !battle.over && battle.status == Status.running && battle.nextIn != null && battle.wave < battle.totalWaves && battle.foes.isEmpty()) {
            battle.callWave()
        }
        // Nothing to throw once Wren is down or the fight is over: time must not stay slowed.
        if (aimingW && (battle.hero.dead || battle.over)) endAim()
        if (sellArmedId != null && now() >= sellArmedUntil) sellArmedId = null
        scene.look.showLeash = showLeash || aimingW
        if (bannerT > 0) {
            bannerT -= dt
            if (bannerT <= 0) { if (bannerQ.isEmpty()) banner = null else { val n = bannerQ.removeFirst(); putBanner(n.first, n.second, n.third) } }
        }
        if (lvlT > 0) { lvlT -= dt; if (lvlT <= 0) levelFlash = false }
        if (hintPlot != null && battle.towers.isNotEmpty()) {
            hintPlot = null; scene.look.hintPlot = null
            showBanner("Drag Wren to the road", "She holds up to 2 foes inside a 90 px leash and earns +50% gold on kills.", 4.5)
        }
        endAt?.let { if (now() >= it) { endAt = null; end(endWon, endStars) } }
        scene.frame(events, dt, if (battle.paused) 0.0 else simDt)
        frames += 1
        frameNo = frames
        if (frames % 4 == 0 || (events.isNotEmpty() && frames % 2 == 0)) bump()
    }

    private fun react(events: List<BattleEvent>) {
        val b = battle
        for (e in events) {
            when (e) {
                is BattleEvent.ShotFired -> sound.play(if (e.kind == ShotKind.bolt) Sound.Sfx.bolt else Sound.Sfx.boom)
                is BattleEvent.Pulse -> sound.play(Sound.Sfx.bell)
                is BattleEvent.Arc -> sound.play(Sound.Sfx.zap)
                is BattleEvent.RootEv -> sound.play(Sound.Sfx.root)
                is BattleEvent.Kill -> sound.play(Sound.Sfx.coin)
                is BattleEvent.HeroHit -> sound.play(Sound.Sfx.hero)
                is BattleEvent.Leak -> { sound.play(Sound.Sfx.leak); leakBy[e.kind] = (leakBy[e.kind] ?: 0) + e.lives }
                is BattleEvent.Build, is BattleEvent.Upgrade -> sound.play(Sound.Sfx.build)
                is BattleEvent.ClearPlot -> { sound.play(Sound.Sfx.clear); showBanner(if (e.free) "Plot salvaged" else "Rubble cleared", "This plot is open for building.", 1.8) }
                is BattleEvent.SwitchFlip -> { sound.play(Sound.Sfx.switchFlip); showBanner(e.label, if (e.state != 0) "Mechanism engaged!" else "Mechanism reset.", 1.8) }
                is BattleEvent.Warp -> sound.play(Sound.Sfx.warp)
                is BattleEvent.RiftWarn -> showBanner("New breach forming", "Watch the marked path before Wave ${e.wave}.", 2.6)
                is BattleEvent.RiftOpen -> { sound.play(Sound.Sfx.wave); showBanner("Rift torn open", "A new lane has activated on the field!", 2.4) }
                is BattleEvent.Terraform -> { sound.play(Sound.Sfx.boss); showBanner("Ground shifts", e.label, 3.0, now = true) }
                is BattleEvent.Stamp -> sound.play(Sound.Sfx.boom)
                is BattleEvent.Pane -> sound.play(Sound.Sfx.bell)
                is BattleEvent.GateShock -> { sound.play(Sound.Sfx.sunrise); showBanner("Bastion bell!", "The Keep shockwave stuns intruders at the gate.", 2.2) }
                is BattleEvent.Level -> { sound.play(Sound.Sfx.level); lvlT = 0.9; levelFlash = true; if (autoSkills) b.autoLearn() }
                is BattleEvent.Wave -> {
                    sound.play(Sound.Sfx.wave); showBanner("Wave ${e.n} of ${b.totalWaves}", e.hint, 2.0)
                    // The first time a new foe walks in, name it and say what beats it.
                    if (e.n >= 1 && e.n <= b.stage.waves.size) {
                        for (g in b.stage.waves[e.n - 1].groups) {
                            if (!isNewFoe(g.kind) || data.enemy(g.kind).isBoss) continue
                            metFoes.add(g.kind)
                            val d = data.enemy(g.kind)
                            showBanner("New foe: ${d.name}", d.answer, 3.6)
                        }
                    }
                }
                is BattleEvent.Adapt -> showBanner("The Hollow adapts", "It hardens against ${Words.element[e.el] ?: e.el.name}: ${jsRound(e.resist * 100).toInt()}% less damage. Mix your towers.", 3.4)
                is BattleEvent.ShiftEv -> showBanner(if (e.on) e.label else "The way is open again", if (e.on) "Foes on that road wait at the edge. Others go round." else "", 2.6)
                is BattleEvent.BarrierEv -> showBanner("The wreck gives way", "The beach road is open. Foes will use it now.", 3.0)
                is BattleEvent.Boss -> { sound.play(Sound.Sfx.boss); val d = data.enemy(e.kind); showBanner(d.name, d.blurb, 4.0, now = true) }
                is BattleEvent.Phase -> { sound.play(Sound.Sfx.boss); showBanner("Boss phase ${e.n + 1}", "New breaches tear open!", 3.0) }
                is BattleEvent.Night -> showBanner(if (e.on) "Night falls" else "Morning", if (e.on) "Towers outside a Beacon's light see less. Shades walk." else "Full sight again.", 2.4)
                is BattleEvent.Gear -> if (b.wave > 1) showBanner(if (e.up == SplitId.a) "Gold gears rise" else "Iron gears rise", "Towers on the lowered plots sleep this wave.", 2.4)
                is BattleEvent.Sink -> showBanner("The ground gives way", if (OathId.shiftingEarth in oaths) "A plot sinks. Any tower on it was half refunded." else "A plot sinks. Any tower on it was refunded in full.", 2.6)
                is BattleEvent.Skill -> {
                    sound.play(when (e.key) { SkillKey.q -> Sound.Sfx.sweep; SkillKey.w -> Sound.Sfx.snare; else -> Sound.Sfx.sunrise })
                    if (e.key == SkillKey.r) showBanner("Sunrise", "Every tower fires twice as fast. Nothing hides.", 2.0)
                }
                is BattleEvent.RuneEv -> { sound.play(Sound.Sfx.rune); if (!e.picked) showBanner("${data.rune(e.kind).name} rune", "Send Wren to pick it up before it fades.", 2.2) }
                is BattleEvent.HeroDown -> showBanner("Wren falls", "She returns at the gate in ${ceil(b.hero.respawnT).toInt()} s.", 2.4)
                is BattleEvent.Revive -> showBanner("Second dawn", "Wren stands back up.", 2.0)
                is BattleEvent.Early -> showBanner("Called early", "+${e.gold} gold", 1.6)
                is BattleEvent.Won -> { sound.play(Sound.Sfx.win); scheduleEnd(true, e.stars) }
                is BattleEvent.Lost -> { sound.play(Sound.Sfx.lose); scheduleEnd(false, 0) }
                else -> {}
            }
        }
    }

    /** New foes already introduced in this fight. */
    private val metFoes = HashSet<EnemyKind>()
    /** The stage where each foe first walks in. */
    private val firstStage: Map<EnemyKind, Int> by lazy {
        val out = HashMap<EnemyKind, Int>()
        for (st in data.stages) for (w in st.waves) for (g in w.groups) if (g.kind !in out) out[g.kind] = st.id
        out
    }
    fun isNewFoe(kind: EnemyKind): Boolean = firstStage[kind] == battle.stage.id && kind !in metFoes

    private fun scheduleEnd(won: Boolean, stars: Int) {
        if (ended || resultScheduled) return
        resultScheduled = true
        // The win is written down at once; only the card waits. Leaving before it shows never loses the stars.
        if (won) embersGained = app.record(battle.stage.id, stars, variant, oaths)
        val delay = if (scene.look.reduceMotion) 0.12 else if (won) 1.0 else 0.4
        endWon = won; endStars = stars; endAt = now() + delay
    }

    /* ------------------------------------------------------------------ banners */

    /** Banners wait their turn instead of replacing each other. `now` cuts in line. */
    fun showBanner(title: String, sub: String, secs: Double, now: Boolean = false) {
        if (now) { bannerQ.clear(); putBanner(title, sub, secs); return }
        if (bannerT > 0) {
            bannerQ.addLast(Triple(title, sub, secs))
            if (bannerQ.size > 3) bannerQ.removeFirst()
            return
        }
        putBanner(title, sub, secs)
    }

    private fun putBanner(title: String, sub: String, secs: Double) {
        bannerId += 1
        // While stage 1 marks a plot, prompts sit at the foot of the map so they never hide it.
        banner = BannerItem(bannerId, title, sub, secs, hintPlot != null)
        bannerT = secs
    }

    /* ------------------------------------------------------------------ touch */

    private var touchStartX = 0f
    private var touchStartY = 0f
    private var touching = false
    private var lastX = 0f
    private var panning = false
    /** A finger came down on Wren. She is picked up once it travels; a still release stays a tap. */
    private var heroGrab = false
    private var heroDragging = false

    /** A finger came down. Screen pixels (sx, sy) for travel, world units (wx, wy) for the map. */
    fun touchDown(sx: Float, sy: Float, wx: Double, wy: Double) {
        touchStartX = sx; touchStartY = sy; touching = true
        lastX = sx
        panning = false; heroGrab = false; heroDragging = false
        if (scene.look.aiming) { aim(wx, wy); return }
        val h = battle.hero
        val onHero = !h.dead && hypot2(wx - h.x, wy - (h.y - 20)) < 52
        if (onHero && !structureAt(wx, wy)) heroGrab = true
    }

    fun touchMove(sx: Float, sy: Float, wx: Double, wy: Double, slop: Float) {
        if (!touching) return
        if (heroDragging) { heroDrag(wx, wy); return }
        if (scene.look.aiming) { aim(wx, wy); return }
        if (heroGrab) {
            // Wren follows only after the finger has clearly moved, so a tap near her never shifts her.
            if (hypot((sx - touchStartX).toDouble(), (sy - touchStartY).toDouble()) > slop) {
                heroDragging = true
                scene.look.showLeash = true
                heroDrag(wx, wy)
            }
            return
        }
        if (canPan) {
            if (!panning && abs(sx - touchStartX) > slop) panning = true
            if (panning) { pan((sx - lastX).toDouble()); lastX = sx }
        }
    }

    fun touchUp(sx: Float, sy: Float, wx: Double, wy: Double, tapSlop: Float) {
        if (!touching) return
        touching = false
        heroGrab = false
        if (heroDragging) {
            heroDragging = false
            battle.moveHero(wx, wy)
            scene.markMove(wx, wy)
            showLeash = false
            scene.look.showLeash = false
            bump()
            return
        }
        val dist = hypot((sx - touchStartX).toDouble(), (sy - touchStartY).toDouble())
        if (scene.look.aiming) {
            // Tap-to-aim: a drag only moves the mark, and the next tap throws.
            if (tapAimW && dist > tapSlop) return
            // Every other release ends the aim: thrown, or called off when let go far outside the range.
            val cancel = hypot2(wx - battle.hero.x, wy - battle.hero.y) > battle.data.snare.range + 45
            if (!cancel && aimingW) battle.castW(wx, wy)
            endAim()
            bump()
            return
        }
        if (panning || dist > tapSlop) { panning = false; return }
        tap(wx, wy)
    }

    fun touchCancel() {
        touching = false; panning = false; heroGrab = false
        if (heroDragging) { heroDragging = false; showLeash = false; scene.look.showLeash = false; bump() }
    }

    private fun aim(x: Double, y: Double) {
        if (!scene.look.aiming) return
        val cancel = hypot2(x - battle.hero.x, y - battle.hero.y) > data.snare.range + 45
        scene.look.aimW = if (cancel) null else Vec(x, y)
        scene.look.showLeash = true
    }

    private fun heroDrag(x: Double, y: Double) {
        showLeash = true
        scene.look.showLeash = true
        battle.moveHero(x, y)
        if (menu != null) closeMenu()
    }

    /* ------------------------------------------------------------------ input */

    fun tap(x: Double, y: Double) {
        val b = battle
        if (aimingW) { b.castW(x, y); endAim(); return }
        shopOpen = false
        switchAt(x, y, 34.0)?.let { b.toggleSwitch(it); bump(); return }
        towerAt(x, y)?.let { openTower(it.id); return }
        plotAt(x, y)?.let { openPlot(it); return }
        if (menu != null) { closeMenu(); return }
        val foe = b.foes.firstOrNull { !it.dead && hypot2(it.x - x, it.y - it.def.bar * 0.4 - y) < 26 + it.def.size * 8 }
        if (foe != null && !b.hero.dead) { b.attackFoe(foe.id); scene.markMove(foe.x, foe.y); return }
        if (!b.hero.dead && hypot2(b.hero.x - x, b.hero.y - 24 - y) < 38) { showLeash = !showLeash; bump(); return }
        // A near miss on a lever still counts when nothing else was under the finger.
        switchAt(x, y, switchReach)?.let { b.toggleSwitch(it); bump(); return }
        if (!b.hero.dead && tapGroundMove) { b.moveHero(x, y); scene.markMove(x, y); showLeash = false }
    }

    /** A lever is small on a phone held sideways: its reach grows so it is never under 44 dp across. */
    private val switchReach: Double get() = max(34.0, 22 * density / max(0.01, panScale))
    var density = 1.0

    private fun switchAt(x: Double, y: Double, reach: Double): Int? =
        battle.switches.indices.firstOrNull { hypot2(battle.switches[it].def.at.x - x, battle.switches[it].def.at.y - y) < reach }

    private fun towerAt(x: Double, y: Double): Tower? =
        battle.towers.firstOrNull { abs(it.x - x) < 34 && y > it.y - 110 && y < it.y + 22 }

    private fun plotAt(x: Double, y: Double): Int? {
        val b = battle
        return b.plots.indices.firstOrNull { i -> val p = b.plots[i]; !p.sunk && ell(p.x - x, p.y - y) < 44 && b.towers.none { it.plot == i } }
    }

    /** True when a switch, tower or plot is under the point: a finger there is not picking Wren up. */
    private fun structureAt(x: Double, y: Double) = switchAt(x, y, 34.0) != null || towerAt(x, y) != null || plotAt(x, y) != null

    /** Leave W aiming, whether the snare was thrown or called off. */
    private fun endAim() {
        aimingW = false
        showLeash = false
        scene.look.aiming = false
        scene.look.aimW = null
        scene.look.showLeash = false
    }

    fun openPlot(i: Int) {
        menu = Menu.Plot(i); armed = null; sellArmedId = null; panelOpenedAt = now()
        scene.look.selPlot = i; scene.look.selTower = null; scene.look.preview = null
    }

    fun openTower(id: Int) {
        menu = Menu.TowerMenu(id); armed = null; sellArmedId = null; panelOpenedAt = now()
        scene.look.selTower = id; scene.look.selPlot = null; scene.look.preview = null
    }

    fun closeMenu() {
        menu = null; armed = null; sellArmedId = null
        scene.look.selPlot = null; scene.look.selTower = null; scene.look.preview = null
    }

    /** First tap shows the range and what the tower does; the second tap builds. */
    fun pickBuild(kind: TowerKind) {
        val pi = (menu as? Menu.Plot)?.i ?: return
        val t = now()
        if (t - panelOpenedAt < 0.2) return
        if (armed != kind || t - armedAt < 0.3) { armed = kind; armedAt = t; scene.look.preview = kind; return }
        if (battle.build(pi, kind) != null) closeMenu()
        bump()
    }

    /** Two taps to sell, so fast taps never scrap an upgraded tower. */
    fun sellOrArm(id: Int) {
        val t = now()
        if (t - panelOpenedAt < 0.2) return
        if (sellArmedId == id && t < sellArmedUntil) {
            if (battle.sell(id)) closeMenu()
        } else {
            sellArmedId = id
            sellArmedUntil = t + 2.6
        }
        bump()
    }

    fun act(f: () -> Unit) { f(); bump() }

    /** The learn button (apart from casting, so a tap on `+` never fires a skill). */
    fun learnSkill(k: SkillKey) { if (battle.learn(k)) sound.play(Sound.Sfx.click); bump() }

    /** Cast a skill, or learn it if unlearned or cooling down. */
    fun skillPress(k: SkillKey) {
        val b = battle
        if (b.canLearn(k) && (b.hero.rank(k) == 0 || !b.skillReady(k))) { b.learn(k); sound.play(Sound.Sfx.click); bump(); return }
        when {
            k == SkillKey.q -> b.castQ()
            k == SkillKey.r -> b.castR()
            k == SkillKey.w && b.skillReady(SkillKey.w) -> {
                aimingW = !aimingW
                showLeash = aimingW
                scene.look.aiming = aimingW
                scene.look.aimW = if (aimingW) Vec(b.hero.x + data.snare.range * 0.5 * b.hero.face, b.hero.y) else null
                if (aimingW) showBanner("Lantern Snare", if (tapAimW) "Time slows. Tap where to throw it." else "Time slows. Drag or tap inside range.", 1.8, now = true)
            }
            else -> if (b.canLearn(k)) b.learn(k)
        }
        bump()
    }

    fun callWave() { if (battle.callWave()) sound.play(Sound.Sfx.click); bump() }

    fun cycleSpeed() { battle.speed = if (battle.speed == 1.0) 2.0 else if (battle.speed == 2.0) 3.0 else 1.0; bump() }

    fun togglePause() { battle.paused = !battle.paused; bump() }

    fun toggleSound() { app.toggleSound(); bump() }

    fun toggleAutoNext() {
        autoNext = !autoNext
        val v = autoNext
        app.setSetting { it.autoNext = v }
        bump()
    }

    fun toggleLeash() { showLeash = !showLeash; bump() }

    fun sendToGate() {
        val g = battle.gate.firstOrNull() ?: return
        battle.moveHero(g.x - 60, g.y); scene.markMove(g.x - 60, g.y)
    }

    fun setMode(t: Tower, m: TargetMode) = act { battle.setMode(t.id, m) }
    fun setRound(t: Tower, r: Rounds?) = act { battle.setRound(t.id, r) }

    /* ------------------------------------------------------------------ leaving and the end */

    /** Leave, asking first if a fight is under way. */
    fun requestExit() {
        // Once the fight is decided there is nothing to lose: the result is already recorded.
        if (ended || resultScheduled || battle.status == Status.prep) { exit(); return }
        exitWasPaused = battle.paused
        battle.paused = true
        exitAsk = true
    }

    fun keepFighting() {
        exitAsk = false
        if (!exitWasPaused) battle.paused = false
        bump()
    }

    fun exit() { app.screen = AppModel.Screen.Campaign(battle.stage.id) }
    fun retry() = app.play(battle.stage.id, variant, oaths)
    /** The next stage always opens as a plain first run: Standard, with no Oaths carried over. */
    fun next() = app.play(battle.stage.id + 1, StageVariant.standard, emptyList())

    private fun end(won: Boolean, stars: Int) {
        if (ended) return
        ended = true
        val b = battle; val st = b.stage
        val gained = if (won) embersGained else 0
        val need = starLives(b.startLives); val lost = b.startLives - b.lives
        val nextStar = if (won && stars < 3) "Lose ${b.startLives - need.first} lives or fewer for 3 stars. You lost $lost." else null
        val worst = leakBy.maxByOrNull { it.value }
        val bd = b.breakdown
        val tot = max(1.0, bd.towers + bd.hero + bd.skills + bd.status)
        val tPct = jsRound(bd.towers / tot * 100).toInt()
        val hPct = jsRound((bd.hero + bd.skills) / tot * 100).toInt()
        val sPct = max(0, 100 - tPct - hPct)
        val mvp = b.mvpTower()
        val mvpTitle = mvp?.let { tw -> tw.split?.let { sp -> data.tower(tw.kind).splits.firstOrNull { it.id == sp }?.name } ?: data.tower(tw.kind).name }
        result = ResultInfo(
            won, stars, gained,
            if (won) "${st.name} cleared with ${b.lives} lives left. Wren reached level ${b.hero.level}." else "You held until wave ${b.wave} of ${b.totalWaves}.",
            nextStar,
            if (!won && worst != null) worst.key to worst.value else null,
            tPct, hPct, sPct,
            mvpTitle?.let { "MVP: $it (${Math.round(mvp.dmgDealt)})" },
        )
        closeMenu()
        shopOpen = false
        bump()
    }
}

/** Words the HUD shares with the web game. */
object Words {
    val element = mapOf(Element.pierce to "bolts", Element.fire to "fire", Element.frost to "frost", Element.storm to "lightning", Element.nature to "roots")
    val elementTitle = mapOf(Element.pierce to "Bolts", Element.fire to "Fire", Element.frost to "Frost", Element.storm to "Lightning", Element.nature to "Roots")
    val mode = listOf(TargetMode.first to "First", TargetMode.strong to "Strongest", TargetMode.armored to "Armored", TargetMode.close to "Closest")
    val round = mapOf(Rounds.ember to "Ember", Rounds.frost to "Frost", Rounds.storm to "Storm")
    /** What each tower is for, in a few words: shown on the build buttons, since a finger cannot hover. */
    val role = mapOf(
        TowerKind.watch to "One target, hits fliers", TowerKind.cannon to "Blasts groups, ground only", TowerKind.bell to "Slows all around it",
        TowerKind.pylon to "Jumps foe to foe, hits fliers", TowerKind.roots to "Holds a foe, ground only", TowerKind.beacon to "Boosts towers, shows Shades",
    )
    /** The most the Hollow can harden against one element. */
    const val resistCap = 0.6
}
