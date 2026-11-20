package com.njarrar.towerriot.battle

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RadialGradient
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import com.njarrar.towerriot.art.ArtFiles
import com.njarrar.towerriot.art.Sprites
import com.njarrar.towerriot.engine.Battle
import com.njarrar.towerriot.engine.BattleEvent
import com.njarrar.towerriot.engine.DamageSource
import com.njarrar.towerriot.engine.Element
import com.njarrar.towerriot.engine.EnemyKind
import com.njarrar.towerriot.engine.Foe
import com.njarrar.towerriot.engine.RoadRt
import com.njarrar.towerriot.engine.Rng
import com.njarrar.towerriot.engine.RubbleKind
import com.njarrar.towerriot.engine.Rounds
import com.njarrar.towerriot.engine.ShotKind
import com.njarrar.towerriot.engine.SkillKey
import com.njarrar.towerriot.engine.SplitId
import com.njarrar.towerriot.engine.Status
import com.njarrar.towerriot.engine.SwitchMode
import com.njarrar.towerriot.engine.Tower
import com.njarrar.towerriot.engine.TowerKind
import com.njarrar.towerriot.engine.Vec
import com.njarrar.towerriot.engine.World
import com.njarrar.towerriot.engine.hypot2
import com.njarrar.towerriot.engine.jsRound
import com.njarrar.towerriot.engine.jsSign
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

/** What the player has open, for range rings and marks. The same as the web scene's View. */
class SceneLook {
    var selPlot: Int? = null
    var selTower: Int? = null
    var preview: TowerKind? = null
    /** W is being aimed: time runs slow and touches steer the mark until it is thrown or called off. */
    var aiming = false
    /** Where the snare would land. Null while not aiming, and while the finger sits in the call-off zone. */
    var aimW: Vec? = null
    var showLeash = false
    var reduceMotion = false
    var dmgNumbers = false
    var hintPlot: Int? = null
    /** A still frame (title screen): no health bars or shells in flight. */
    var still = false
}

/**
 * Draws a Battle with the baked art: ground, depth-sorted units, morning light and effects.
 * Reads battle state; never changes it. A port of the iOS BattleScene (itself a port of src/render/scene.ts).
 * World space is 1280 by 720 with y down, the same as an Android canvas, so nothing is flipped.
 */
class BattleRenderer(val battle: Battle) {
    val look = SceneLook()
    private val g = Gfx()
    private var T = 0.0
    private val rng = Rng(99)
    private fun R() = rng.next()
    private val TAU = PI * 2

    private val ground: Bitmap? = ArtFiles.ground(battle.stage.id, battle.variant == com.njarrar.towerriot.engine.StageVariant.alt)
    private val vignette = Gfx.vignette()
    private val sunWash = if (battle.stage.isLava) Gfx.sun(255, 170, 110, 0.55) else Gfx.sun(255, 232, 180, 0.32)
    private val posts: List<Vec>
    private class WaterLine(val path: Path, val w: Double, val idx: Int, val drains: Boolean)
    private val waterLines = ArrayList<WaterLine>()
    private class RoadLine(val road: RoadRt, val path: Path)
    private val dynRoads = ArrayList<RoadLine>()
    private val warnRoads = ArrayList<RoadLine>()
    private class BeltLine(val path: Path, val w: Double)
    private val beltLines = ArrayList<BeltLine>()
    private val portalArcs = ArrayList<Path>()
    private val rainPath = Path().apply { moveTo(0f, 0f); lineTo(-14f, 28f) }
    private val beam = Path().apply { moveTo(0f, 10f); lineTo(380f, 76f); lineTo(380f, -76f); lineTo(0f, -10f); close() }
    private val hex = Path().apply {
        for (k in 0 until 6) { val a = k / 6.0 * TAU; val x = (cos(a) * 13).toFloat(); val y = (-sin(a) * 13).toFloat(); if (k == 0) moveTo(x, y) else lineTo(x, y) }
        close()
    }
    private val tmp = Path()
    private val tmp2 = Path()

    init {
        val st = battle.stage
        val meta = ArtFiles.maps[st.id]
        posts = meta?.posts ?: emptyList()
        // Baked water lines are used only while they still match the stage; after a stale bake the engine's own paths stand in.
        val baked = meta?.waters ?: emptyList()
        val bakedFits = baked.size == st.waters.size && baked.zip(st.waters).all { (m, w) ->
            val p = m.second.firstOrNull(); val c = w.ctrl.firstOrNull()
            p != null && c != null && abs(p.x - c.x) < 1 && abs(p.y - c.y) < 1 && abs(m.first - w.w) < 0.5
        }
        val shifting = (st.terraforms ?: emptyList()).flatMap { it.waters ?: emptyList() }.toSet()
        for ((idx, w) in battle.waters.withIndex()) {
            val pts = if (bakedFits) baked[idx].second else w.path.pts
            val p = Path()
            for ((i, q) in pts.withIndex()) if (i == 0) p.moveTo(q.x.toFloat(), q.y.toFloat()) else p.lineTo(q.x.toFloat(), q.y.toFloat())
            val byWave = idx < st.waters.size && st.waters[idx].drainAtWave != null
            val byTerraform = w.id?.let { it in shifting } ?: false
            waterLines.add(WaterLine(p, w.w, idx, byWave || byTerraform))
        }
        for (r in battle.roads) {
            val p = Path()
            for ((i, q) in r.path.pts.withIndex()) if (i == 0) p.moveTo(q.x.toFloat(), q.y.toFloat()) else p.lineTo(q.x.toFloat(), q.y.toFloat())
            if (r.def.openAtWave != null || r.def.openOnPhase != null) dynRoads.add(RoadLine(r, p))
            if (r.def.openAtWave != null) warnRoads.add(RoadLine(r, p))
            for (bt in r.belts) {
                val bp = Path()
                var d = bt.from
                var first = true
                while (d <= bt.to) { val q = r.path.point(d); if (first) bp.moveTo(q.x.toFloat(), q.y.toFloat()) else bp.lineTo(q.x.toFloat(), q.y.toFloat()); first = false; d += 8 }
                beltLines.add(BeltLine(bp, r.def.w))
            }
        }
        for (pt in battle.portals) {
            val a = pt.fromPos; val b = pt.toPos
            val midY = min(a.y, b.y) - 42
            portalArcs.add(Path().apply { moveTo(a.x.toFloat(), a.y.toFloat()); quadTo(((a.x + b.x) / 2).toFloat(), midY.toFloat(), b.x.toFloat(), b.y.toFloat()) })
        }
    }

    /* ------------------------------------------------------------------ loop */

    private var shake = 0.0
    private var flash = 0.0

    /** One frame: `wall` seconds of real time pass for glints and pulses; effects move on by `dt` (0 while paused). */
    fun frame(events: List<BattleEvent>, wall: Double, dt: Double) {
        T += wall
        consume(events)
        step(dt)
        stepGaits(dt)
        crowDt = dt
    }

    /** Draw one still frame without running the loop (the title screen). */
    fun still() {
        consume(battle.drain())
        step(0.0)
        stepGaits(0.0)
        crowDt = 0.0
    }

    private fun step(dt: Double) {
        shake = max(0.0, shake - dt * 20)
        flash = max(0.0, flash - dt * 1.5)
        for (p in parts) {
            p.x += p.vx * dt; p.y += p.vy * dt
            if (p.grav) p.vy += 380 * dt
            p.life -= dt
        }
        parts.removeAll { it.life <= 0 }
        if (parts.size > 600) parts.subList(0, parts.size - 600).clear()
        for (f in fx) { if (f.kind == FxKind.ring) f.r += dt * 320 else f.life -= dt }
        fx.removeAll { if (it.kind == FxKind.ring) it.r >= it.max else it.life <= 0 }
        for (c in coins) {
            c.u += dt * 1.3
            c.x = c.sx + (40 - c.sx) * c.u * c.u
            c.y = c.sy + (20 - c.sy) * c.u - sin(c.u * PI) * 120
        }
        coins.removeAll { it.u >= 1 }
        for (f in floats) { f.life -= dt; f.y -= dt * (if (f.big) 26 else 40) }
        floats.removeAll { it.life <= 0 }
        moveMark?.let { it.t -= dt; if (it.t <= 0) moveMark = null }
    }

    /* ------------------------------------------------------------------ events to effects */

    private enum class PartKind { smoke, spark, chip }
    private class Part(var x: Double, var y: Double, var vx: Double, var vy: Double, var life: Double, val max: Double, val color: Int, val s: Double, val kind: PartKind, val grav: Boolean = false)
    private enum class FxKind { ring, arc, boom, slash, steam, lantern, sun, splash }
    private class Fx(val kind: FxKind, val x: Double, val y: Double, var r: Double, val max: Double, var life: Double, val color: Int) {
        var pts: List<Vec> = emptyList()
        var bolt: Path? = null
    }
    private class FloatText(var x: Double, var y: Double, var text: String, var color: Int, var big: Boolean) {
        var life = if (big) 1.4 else 0.8
        val max = life
        var gold: Int? = null
    }
    private class Coin(val sx: Double, val sy: Double) { var u = 0.0; var x = sx; var y = sy }
    class Mark(val x: Double, val y: Double, var t: Double)

    private val parts = ArrayList<Part>()
    private val fx = ArrayList<Fx>()
    private val floats = ArrayList<FloatText>()
    private val coins = ArrayList<Coin>()
    private var moveMark: Mark? = null

    fun markMove(x: Double, y: Double) { moveMark = Mark(x, y, 0.6) }

    private fun addFx(kind: FxKind, x: Double, y: Double, r: Double, max: Double, life: Double, color: Int = rgb(0xffffff)): Fx {
        val f = Fx(kind, x, y, r, max, life, color)
        fx.add(f)
        return f
    }

    private fun burst(n: Int, make: () -> Part) { repeat(n) { parts.add(make()) } }

    fun consume(events: List<BattleEvent>) {
        val b = battle
        for (e in events) {
            when (e) {
                is BattleEvent.Pulse -> addFx(FxKind.ring, e.x, e.y, 0.0, e.r, 1.0, rgb(170, 220, 255))
                is BattleEvent.Arc -> { val f = addFx(FxKind.arc, 0.0, 0.0, 0.0, 0.18, 0.18); f.pts = e.pts; f.bolt = boltPath(e.pts, (R() * 999).toInt()) }
                is BattleEvent.Boom -> {
                    addFx(FxKind.boom, e.x, e.y, e.r, 0.45, 0.45)
                    shake = max(shake, 4.0)
                    burst(14) { val a = R() * TAU; val v = 60 + R() * 160; Part(e.x, e.y, cos(a) * v, sin(a) * v * 0.5 - 90, 0.8, 0.8, rgb(0x2a241c), 2.6, PartKind.chip, true) }
                    burst(3) { Part(e.x + (R() - 0.5) * 26, e.y - 4, (R() - 0.5) * 20, -14.0, 0.9, 0.9, rgb(150, 142, 130), 6.0, PartKind.smoke) }
                }
                is BattleEvent.RootEv -> burst(8) { Part(e.x + (R() - 0.5) * 30, e.y, (R() - 0.5) * 40, -50 - R() * 50, 0.6, 0.6, rgb(0x3a3326), 2.6, PartKind.chip, true) }
                is BattleEvent.Hit -> {
                    val c = elementColor(e.source)
                    burst(3) { val a = R() * TAU; Part(e.x, e.y, cos(a) * 80, sin(a) * 80, 0.3, 0.3, c, 1.6, PartKind.spark) }
                    if (look.dmgNumbers && e.crit) float(e.x, e.y - 10, "${jsRound(e.dmg).toInt()}!", rgb(0xffe6b0), true)
                    else if (look.dmgNumbers && e.source == DamageSource.El(Element.hero)) float(e.x, e.y - 6, "${jsRound(e.dmg).toInt()}", rgb(0xe8f2ff), false)
                }
                is BattleEvent.Kill -> {
                    coins.add(Coin(e.x, e.y - 20))
                    goldPop(e.x + 12, e.y - 46, e.gold, e.hero)
                    burst(10) { val a = R() * TAU; Part(e.x, e.y - 10, cos(a) * 60, -30 - R() * 60, 0.9, 0.9, rgb(0x5ac8a8), 1.8, PartKind.spark) }
                    burst(2) { Part(e.x + (R() - 0.5) * 16, e.y - 6, 0.0, -16.0, 0.8, 0.8, rgb(60, 80, 72), 5.0, PartKind.smoke) }
                    if (e.kind == EnemyKind.mireking || e.kind == EnemyKind.tidewyrm || e.kind == EnemyKind.colossus || e.kind == EnemyKind.queen) { shake = 12.0; flash = 0.6 }
                }
                is BattleEvent.Leak -> { flash = max(flash, 0.25); float(e.x, e.y - 50, "-${e.lives}", rgb(0xff6a5a), true) }
                is BattleEvent.VentEv -> { addFx(FxKind.steam, e.x, e.y, 0.0, 1.2, 1.2); shake = max(shake, 2.0) }
                is BattleEvent.Skill -> {
                    if (e.key == SkillKey.q) addFx(FxKind.slash, e.x, e.y, 100.0, 0.4, 0.4)
                    if (e.key == SkillKey.w) addFx(FxKind.lantern, e.x, e.y, b.data.snare.radius, 0.7, 0.7)
                    if (e.key == SkillKey.r) { addFx(FxKind.sun, e.x, e.y, 0.0, 1.4, 1.4); shake = 7.0 }
                }
                is BattleEvent.Level -> addFx(FxKind.ring, b.hero.x, b.hero.y, 0.0, 70.0, 1.0, rgb(255, 215, 140))
                is BattleEvent.Phase -> { addFx(FxKind.ring, e.x, e.y, 0.0, 360.0, 1.0, rgb(120, 230, 200)); shake = 10.0 }
                is BattleEvent.Dive -> addFx(FxKind.splash, e.x, e.y, 0.0, 0.8, 0.8)
                is BattleEvent.Stamp -> {
                    addFx(FxKind.ring, e.x, e.y, 0.0, e.r, 0.7, rgb(120, 230, 190)); shake = max(shake, 5.0)
                    burst(10) { val a = R() * TAU; val v = 50 + R() * 90; Part(e.x + cos(a) * 20, e.y, cos(a) * v, -40 - R() * 60, 0.7, 0.7, rgb(0x4a4238), 2.6, PartKind.chip, true) }
                }
                is BattleEvent.Pane -> burst(9) { val a = R() * TAU; val v = 50 + R() * 80; Part(e.x, e.y, cos(a) * v, sin(a) * v * 0.5 - 60, 0.55, 0.55, rgb(0xe6f4fa), 2.2, PartKind.chip, true) }
                is BattleEvent.Lunge -> burst(4) { Part(e.x + (R() - 0.5) * 14, e.y - 4, (R() - 0.5) * 24, -18.0, 0.6, 0.6, rgb(110, 96, 84), 4.0, PartKind.smoke) }
                is BattleEvent.Build -> buildDust(e.x, e.y)
                is BattleEvent.Upgrade -> buildDust(e.x, e.y)
                is BattleEvent.HeroDown -> float(b.hero.x, b.hero.y - 80, "Wren falls", rgb(0xff8a7a), true)
                is BattleEvent.Revive -> addFx(FxKind.sun, b.hero.x, b.hero.y, 0.0, 1.0, 1.0)
                is BattleEvent.RuneEv -> if (e.picked) { val d = b.data.rune(e.kind); float(b.hero.x, b.hero.y - 80, d.name, css(d.color), true) }
                is BattleEvent.RiftWarn -> b.roads.firstOrNull { it.def.id == e.road }?.let { r -> val p = r.path.point(36.0); addFx(FxKind.ring, p.x, p.y, 0.0, 85.0, 1.1, rgb(255, 155, 70)) }
                is BattleEvent.RiftOpen -> b.roads.firstOrNull { it.def.id == e.road }?.let { r ->
                    val p = r.path.point(36.0); addFx(FxKind.ring, p.x, p.y, 0.0, 140.0, 1.0, rgb(96, 226, 180)); shake = max(shake, 5.0)
                }
                is BattleEvent.ClearPlot -> if (e.plot >= 0 && e.plot < b.plots.size) {
                    val pl = b.plots[e.plot]
                    burst(10) { val a = R() * TAU; Part(pl.x, pl.y - 6, cos(a) * 65, sin(a) * 35 - 40, 0.65, 0.65, rgb(0x7a6c58), 2.5, PartKind.chip, true) }
                    addFx(FxKind.ring, pl.x, pl.y, 0.0, 52.0, 0.6, if (e.free) rgb(140, 220, 160) else rgb(230, 190, 110))
                }
                is BattleEvent.SwitchFlip -> b.switches.firstOrNull { it.def.id == e.id }?.let { sw ->
                    val sx = sw.def.at.x; val sy = sw.def.at.y
                    addFx(FxKind.ring, sx, sy, 0.0, 58.0, 0.65, rgb(230, 185, 95))
                    burst(6) { val a = R() * TAU; Part(sx, sy - 10, cos(a) * 55, sin(a) * 40, 0.35, 0.35, rgb(0xffd480), 2.0, PartKind.spark) }
                }
                is BattleEvent.Terraform -> { shake = max(shake, 8.0); addFx(FxKind.ring, World.width / 2, World.height / 2, 0.0, 420.0, 0.9, rgb(180, 220, 210)) }
                is BattleEvent.Warp -> {
                    addFx(FxKind.ring, e.fromX, e.fromY, 0.0, 46.0, 0.55, rgb(90, 210, 255))
                    addFx(FxKind.ring, e.toX, e.toY, 0.0, 54.0, 0.65, rgb(255, 150, 70))
                }
                is BattleEvent.GateShock -> { addFx(FxKind.ring, e.x, e.y, 0.0, 180.0, 0.85, rgb(255, 215, 120)); shake = max(shake, 6.0) }
                is BattleEvent.IronGate -> { addFx(FxKind.ring, e.x, e.y, 0.0, 140.0, 0.75, rgb(235, 195, 125)); shake = max(shake, 5.0) }
                is BattleEvent.HeraldCleanse -> { addFx(FxKind.ring, e.x, e.y, 0.0, 150.0, 0.85, rgb(120, 245, 200)); float(e.x, e.y - 54, "Cleanse -20%", rgb(0x7cf0c4), true) }
                is BattleEvent.RuneStolen -> { addFx(FxKind.ring, e.x, e.y, 0.0, 140.0, 0.9, rgb(255, 195, 70)); float(e.x, e.y - 50, "Rune stolen!", rgb(0xffb040), true) }
                is BattleEvent.Escape -> float(e.x, e.y - 44, "Escaped!", rgb(0xe8c468), false)
                is BattleEvent.Bog -> addFx(FxKind.ring, e.x, e.y, 0.0, 52.0, 0.7, rgb(115, 175, 75))
                else -> {}
            }
        }
    }

    private fun buildDust(x: Double, y: Double) =
        burst(12) { val a = R() * TAU; Part(x + cos(a) * 20, y + sin(a) * 8, cos(a) * 30, -20 - R() * 30, 0.8, 0.8, rgb(150, 140, 120), 6.0, PartKind.smoke) }

    private fun elementColor(s: DamageSource): Int = when (s) {
        is DamageSource.Env -> rgb(0xffd9a0)
        is DamageSource.El -> when (s.el) {
            Element.pierce -> rgb(0xf0d6a8)
            Element.fire -> rgb(0xffb27a)
            Element.frost -> rgb(0xbfe6ff)
            Element.storm -> rgb(0xcfc6ff)
            Element.nature -> rgb(0xb8e6a0)
            Element.hero -> rgb(0xe8f2ff)
        }
    }

    /** Gold from kills close together in time and place adds up in one number instead of a stack. */
    private fun goldPop(x: Double, y: Double, gold: Int, byHero: Boolean) {
        val f = floats.firstOrNull { it.gold != null && it.max - it.life < 0.45 && hypot2(it.x - x, it.y - y) < 95 }
        if (f != null) {
            val n = f.gold!! + gold
            f.gold = n; f.text = "+$n"; f.life = f.max; f.y -= 3
            if (byHero) { f.color = rgb(0xffd76a); f.big = true }
            return
        }
        float(x, y, "+$gold", if (byHero) rgb(0xffd76a) else rgb(0xe8b34a), byHero)
        floats.last().gold = gold
    }

    private fun float(x: Double, y: Double, text: String, color: Int, big: Boolean) {
        if (floats.size > 28) floats.removeAt(0)
        floats.add(FloatText(x + (R() - 0.5) * 14, max(85.0, y), text, color, big))
    }

    /* ------------------------------------------------------------------ gaits */

    private class Gait(var x: Double, var y: Double, var ph: Double, var v: Double, var face: Double, var hx: Double, var hy: Double, var tick: Int)
    private enum class GaitKind(val stride: Double, val lift: Double, val rock: Double, val surge: Double) {
        crawl(30.0, 0.8, 0.0, 0.035), scuttle(16.0, 2.2, 0.0, 0.02), plod(34.0, 1.4, 0.035, 0.0), stomp(70.0, 3.0, 0.025, 0.015), fly(60.0, 0.0, 0.04, 0.0)
    }
    private fun gaitOf(f: Foe): GaitKind {
        if (f.def.isFlying) return GaitKind.fly
        if (f.def.isBoss) return GaitKind.stomp
        return when (f.kind) {
            EnemyKind.skitter, EnemyKind.hound, EnemyKind.runethief, EnemyKind.scarab -> GaitKind.scuttle
            EnemyKind.shell, EnemyKind.sapper, EnemyKind.elite, EnemyKind.warden, EnemyKind.glasshide, EnemyKind.herald, EnemyKind.tether -> GaitKind.plod
            EnemyKind.ram -> GaitKind.stomp
            else -> GaitKind.crawl
        }
    }
    private val gaits = HashMap<Int, Gait>()
    private var gaitTick = 0
    private fun seedOf(f: Foe) = 40.0 + (f.id * 7) % 9

    /** Follow each foe from frame to frame: how far it moved, which way it heads, how it turns. Drawing only. */
    private fun stepGaits(dt: Double) {
        gaitTick += 1
        val tick = gaitTick
        for (f in battle.foes) {
            val seed = seedOf(f)
            val d0 = if (f.dir == 0.0) 1.0 else f.dir
            val m = gaits.getOrPut(f.id) { Gait(f.x, f.y, seed * 1.7 + f.id * 2.3, 1.0, d0, d0, 0.0, tick) }
            m.tick = tick
            if (dt > 0) {
                val dx = f.x - m.x; val dy = f.y - m.y; val dist = hypot(dx, dy)
                m.x = f.x; m.y = f.y
                if (dist <= 40) {
                    m.ph += dist / gaitOf(f).stride * PI * 2
                    val k = 1 - exp(-dt * 8)
                    m.v += (min(1.5, dist / dt / f.def.speed) - m.v) * k
                    if (dist > 0.05) { val q = 1 - exp(-dt * 6); m.hx += (dx / dist - m.hx) * q; m.hy += (dy / dist - m.hy) * q }
                    m.face += jsSign(d0 - m.face) * min(abs(d0 - m.face), dt * 7)
                }
            }
        }
        if (tick % 120 == 0) gaits.entries.removeAll { it.value.tick != tick }
    }

    /* ------------------------------------------------------------------ drawing */

    private val towerLight = mapOf(
        TowerKind.watch to (rgb(0xff9a3a) to 120.0), TowerKind.cannon to (rgb(0xff8a2a) to 72.0), TowerKind.bell to (rgb(0x8fd0ff) to 70.0),
        TowerKind.pylon to (rgb(0xa99cff) to 150.0), TowerKind.roots to (rgb(0x7fd06a) to 50.0), TowerKind.beacon to (rgb(0xffb050) to 150.0),
    )

    /** One thing drawn in the depth-sorted pass. */
    private class Item(val z: Double, val draw: (Canvas) -> Unit)
    private val units = ArrayList<Item>()
    private val emits = ArrayList<Item>()

    /** Draw the whole map into world space (1280 by 720). The caller sets up the transform and clip. */
    fun draw(c: Canvas) {
        val b = battle
        c.save()
        if (shake > 0 && !look.reduceMotion) c.translate(((R() - 0.5) * shake).toFloat(), ((R() - 0.5) * shake).toFloat())
        // Ground.
        if (ground != null) { g.bmp.alpha = 255; c.drawBitmap(ground, null, RectF(0f, 0f, World.width.toFloat(), World.height.toFloat()), g.bmp) }
        else c.drawColor(rgb(0xe4, 0xdc, 0xcb))
        drawWaters(c)
        drawRoads(c)
        drawMapRules(c)
        drawPlots(c)
        drawRune(c)

        units.clear(); emits.clear()
        collectTowers(); collectFoes(); collectHero(); collectFixtures()
        units.sortBy { it.z }
        for (u in units) u.draw(c)
        drawParts(c, PartKind.smoke); drawParts(c, PartKind.chip)
        drawClouds(c)
        drawLight(c)
        if (!b.night) { g.bmp.alpha = (0.7 * 255).toInt(); g.blend(g.bmp, Blend.screen); c.drawBitmap(sunWash, null, RectF(0f, 0f, World.width.toFloat(), World.height.toFloat()), g.bmp); g.blend(g.bmp, Blend.normal) }
        emits.sortBy { it.z }
        for (u in emits) u.draw(c)
        drawShots(c)
        drawFx(c)
        drawParts(c, PartKind.spark)
        drawRain(c)
        drawRanges(c)
        drawCrows(c)
        c.restore()

        // The overlay does not shake.
        g.bmp.alpha = ((if (b.night) 0.7 else 0.16) * 255).toInt()
        c.drawBitmap(vignette, null, RectF(0f, 0f, World.width.toFloat(), World.height.toFloat()), g.bmp)
        val fa = if (look.reduceMotion) 0.0 else flash * 0.35
        if (fa > 0.001) { g.fill.color = if (b.status == Status.lost) rgb(255, 80, 60, fa) else rgb(255, 230, 180, fa); c.drawRect(0f, 0f, World.width.toFloat(), World.height.toFloat(), g.fill) }
        drawCoins(c)
        drawFloats(c)
    }

    private fun drawWaters(c: Canvas) {
        val b = battle; val st = b.stage
        for (w in waterLines) {
            if (w.drains) {
                val drained = w.idx < b.waters.size && b.waters[w.idx].drained
                if (drained) {
                    g.path(c, w.path, if (st.isLava) rgb(66, 54, 48, 0.88) else rgb(154, 142, 118, 0.84), w.w * 0.92)
                } else {
                    g.path(c, w.path, if (st.isLava) rgb(110, 40, 18, 0.92) else rgb(56, 112, 138, 0.86), w.w)
                    val lengths = floatArrayOf(6f, 26f, 12f, 40f); val total = lengths.sum()
                    g.path(c, w.path, if (st.isLava) rgb(255, 140, 60, 0.4) else rgb(220, 235, 245, 0.32), 1.8, lengths, (total - (T * 24 % total)).toFloat(), Blend.add)
                }
            } else {
                if (st.isLava) g.path(c, w.path, rgb(255, (110 + 30 * sin(T * 2)).toInt(), 40, 0.35), w.w * 0.55, blend = Blend.add)
                val lengths = if (st.isLava) floatArrayOf(10f, 26f, 4f, 30f) else floatArrayOf(6f, 30f, 14f, 46f)
                val total = lengths.sum()
                val speed = if (st.isLava) 18.0 else 26.0
                g.path(c, w.path, if (st.isLava) rgb(255, 220, 140, 0.35) else rgb(220, 235, 245, 0.3), if (st.isLava) 2.0 else 1.6,
                    lengths, (total - (T * speed % total)).toFloat(), Blend.add)
            }
        }
    }

    private fun drawRoads(c: Canvas) {
        val lava = battle.stage.isLava
        for (r in dynRoads) {
            if (!r.road.active) continue
            g.path(c, r.path, if (lava) rgb(46, 38, 34, 0.92) else rgb(192, 172, 138, 0.9), r.road.def.w)
            g.path(c, r.path, rgb(24, 20, 16, 0.24), 2.0, floatArrayOf(6f, 12f))
        }
    }

    private fun drawMapRules(c: Canvas) {
        val b = battle; val st = b.stage
        // Telegraphed Wave+1 breaches (dashed red-orange path and a '!' rift beacon).
        for (rw in warnRoads) {
            if (!rw.road.telegraph) continue
            g.path(c, rw.path, rgb(218, 86, 52, if (look.reduceMotion) 0.42 else 0.32 + 0.16 * sin(T * 4)), 3.0, floatArrayOf(8f, 10f), cap = Paint.Cap.BUTT)
            val p0 = rw.road.path.point(36.0)
            g.ellipseFill(c, p0.x, p0.y, 13.0, 13.0, rgb(28, 16, 14, 0.86))
            g.ellipseStroke(c, p0.x, p0.y, 13.0, 13.0, rgb(0xff8a50), 2.0)
            g.text.typeface = ArtFiles.barlow; g.text.textSize = 13f; g.text.style = Paint.Style.FILL; g.text.color = rgb(0xffe6b8)
            c.drawText("!", p0.x.toFloat(), (p0.y + 4.5).toFloat(), g.text)
        }
        // Portals, chutes and drift rifts, with a dashed arc showing where foes come out.
        for ((i, pt) in b.portals.withIndex()) {
            if (i >= portalArcs.size) break
            val col = when (pt.def.kind) { com.njarrar.towerriot.engine.PortalKind.rift -> rgb(0xff7a3a); com.njarrar.towerriot.engine.PortalKind.chute -> rgb(0xe5a444); else -> rgb(0x5ad8ff) }
            val a = if (pt.active) 0.92 else 0.35
            g.path(c, portalArcs[i], withAlpha(col, a), 1.6, floatArrayOf(5f, 7f), cap = Paint.Cap.BUTT)
            for (p in listOf(pt.fromPos, pt.toPos)) {
                g.ellipseFill(c, p.x, p.y, 16.0, 8.0, rgb(18, 22, 26, 0.8 * a))
                g.ellipseStroke(c, p.x, p.y, 16.0, 8.0, withAlpha(col, a), 2.0)
            }
            if (pt.active) {
                val pulse = 0.35 + 0.1 * sin(T * 5)
                emits.add(Item(40 + pt.fromPos.y / 100) { cc -> g.glow(cc, pt.fromPos.x, pt.fromPos.y, 16.0, col, pulse) })
                emits.add(Item(40 + pt.toPos.y / 100) { cc -> g.glow(cc, pt.toPos.x, pt.toPos.y, 16.0, col, pulse) })
            }
        }
        // Tides and lava closures.
        for ((i, s) in (st.shifts ?: emptyList()).withIndex()) {
            val on = b.shiftActive(i)
            val x = s.at.x; val y = s.at.y
            if (s.kind == "lava") {
                g.soft(c, g.soft, x, y, s.r * 2.6, s.r * 1.6, if (on) rgb(230, 110, 40) else rgb(255, 120, 40), if (on) 0.95 else 0.25, if (on) Blend.normal else Blend.add)
                if (on) g.glow(c, x, y, s.r * 1.4, rgb(0xff7a2a), 0.35 + 0.1 * sin(T * 4))
            } else if (on) {
                g.ellipseFill(c, x, y, s.r * 1.2, s.r * 0.7, rgb(70, 110, 140, 0.85))
                g.ellipseStroke(c, x, y, s.r * 1.05, s.r * 0.58, rgb(220, 240, 255, 0.45), 1.5, floatArrayOf(8f, 14f), (T * 20 % 22).toFloat())
            } else {
                for (k in 0 until 6) g.ellipseFill(c, x - 20 + k * 8, y + 10 - k * 6, 6.0, 3.5, rgb(0x4a4945))
            }
        }
        // Wrecks across a road.
        for (r in b.roads) {
            val bar = r.barrier ?: continue
            if (bar.hp > 0) {
                g.sprite(c, Sprites["wreck"], bar.x, bar.y)
                hpBar(c, bar.x, bar.y - 70, 34.0, bar.hp / bar.max, rgb(0xc89a5a))
            } else g.sprite(c, Sprites["wreck-down"], bar.x, bar.y)
        }
        // Belts: iron plates with moving chevrons.
        for (bl in beltLines) {
            g.path(c, bl.path, rgb(40, 38, 36, 0.75), bl.w * 0.8, cap = Paint.Cap.BUTT)
            g.path(c, bl.path, rgb(200, 160, 90, 0.35), bl.w * 0.6, floatArrayOf(4f, 14f), (18 - (T * 60 % 18)).toFloat(), cap = Paint.Cap.BUTT)
        }
        // Vents.
        for (v in b.vents) {
            g.ellipseFill(c, v.x, v.y, 22.0, 9.0, rgb(0x26221e))
            g.ellipseStroke(c, v.x, v.y, 22.0, 9.0, rgb(0x5a5048), 2.0)
            val warn = v.t < 1.2
            g.glow(c, v.x, v.y, 18.0, if (warn) rgb(0xff7a3a) else rgb(0xffb070), if (warn) 0.5 + 0.3 * sin(T * 20) else 0.15)
        }
        // Switches: fork, gate and belt brake levers.
        for (sw in b.switches) {
            val x = sw.def.at.x; val y = sw.def.at.y
            val active = sw.activeT > 0
            val ready = sw.cdLeft <= 0 && !active
            val col = if (active) rgb(0x5ee8c0) else if (ready) rgb(0xe6a83e) else rgb(0x7a756c)
            g.ellipseFill(c, x, y + 2, 16.0, 8.0, rgb(0x2d2924))
            g.ellipseStroke(c, x, y + 2, 16.0, 8.0, col, 1.8)
            if (sw.boosted) g.ellipseStroke(c, x, y + 2, 22.0, 11.0, rgb(255, 214, 140, 0.75), 1.4)
            val lean = if (sw.state != 0) 10.0 else -10.0
            g.setStroke(rgb(0xd8cbb4), 3.0, cap = Paint.Cap.ROUND)
            c.drawLine(x.toFloat(), y.toFloat(), (x + lean).toFloat(), (y - 14).toFloat(), g.stroke)
            g.resetStroke()
            if (sw.def.mode == SwitchMode.gate && active) {
                g.setStroke(rgb(0xd98a2b), 6.0)
                c.drawLine((x - 26).toFloat(), (y - 6).toFloat(), (x + 26).toFloat(), (y - 6).toFloat(), g.stroke)
                g.setStroke(rgb(0x1d1914), 6.0, floatArrayOf(7f, 7f))
                c.drawLine((x - 26).toFloat(), (y - 6).toFloat(), (x + 26).toFloat(), (y - 6).toFloat(), g.stroke)
                g.resetStroke()
            }
            g.ellipseFill(c, x + lean, y - 14, 4.5, 4.5, col)
            if (sw.cdLeft > 0 || active) {
                val share = if (active) sw.activeT / (sw.def.dur ?: 10.0) else 1 - sw.cdLeft / sw.def.cd
                g.setStroke(if (active) rgb(0x6ff5d0) else rgb(246, 240, 228, 0.75), 2.5)
                g.rect.set((x - 15).toFloat(), (y - 6 - 15).toFloat(), (x + 15).toFloat(), (y - 6 + 15).toFloat())
                c.drawArc(g.rect, -90f, (share * 360).toFloat(), false, g.stroke)
                g.resetStroke()
            }
        }
        // The sanctuary ring around each Keep gate.
        if (!look.still && !b.hero.dead) {
            for (gt in b.gate) {
                val near = hypot2(gt.x - b.hero.x, gt.y - b.hero.y) < b.data.hero.gateRadius
                if (!near && b.hero.hp >= b.heroMaxHp() * 0.85) continue
                val r = b.data.hero.gateRadius
                g.ellipseStroke(c, gt.x, gt.y, r, r / World.ySquash, if (near) rgb(128, 210, 110, 0.36) else rgb(235, 195, 120, 0.2), 1.6, floatArrayOf(6f, 8f))
            }
        }
    }

    /** A health bar: a dark strip with a coloured fill. */
    private fun hpBar(c: Canvas, x: Double, y: Double, width: Double, v: Double, color: Int) {
        g.fill.color = rgb(0, 0, 0, 0.75)
        c.drawRect((x - width / 2 - 1).toFloat(), y.toFloat(), (x + width / 2 + 1).toFloat(), (y + 5).toFloat(), g.fill)
        g.fill.color = color
        c.drawRect((x - width / 2).toFloat(), (y + 1).toFloat(), (x - width / 2 + width * v.coerceIn(0.0, 1.0)).toFloat(), (y + 4).toFloat(), g.fill)
    }

    private val rubbleSpecs = listOf(doubleArrayOf(-9.0, 4.0, 26.0, 16.0), doubleArrayOf(10.0, 3.0, 24.0, 14.0), doubleArrayOf(1.0, 10.0, 22.0, 16.0))

    private fun drawPlots(c: Canvas) {
        val b = battle
        val canAfford = b.stage.towers.any { b.gold >= b.costOf(it) }
        val lava = b.stage.isLava
        for ((i, p) in b.plots.withIndex()) {
            val x = p.x; val y = p.y
            val used = b.towers.any { it.plot == i }
            val gearUp = p.gear?.let { b.gearUp(it) } ?: true
            val selected = look.selPlot == i
            val hint = look.hintPlot == i && !selected
            if (p.sunk) { g.ellipseFill(c, x, y, 34.0, 14.0, rgb(40, 52, 40, 0.9)); g.ellipseStroke(c, x, y, 34.0, 14.0, rgb(150, 180, 150, 0.25), 1.0); continue }
            if (!p.unlocked) {
                g.ellipseFill(c, x, y, 32.0, 13.0, if (lava) rgb(80, 45, 30, 0.45) else rgb(65, 108, 132, 0.48))
                g.ellipseStroke(c, x, y, 32.0, 13.0, rgb(220, 235, 245, 0.32), 1.2, floatArrayOf(4f, 5f))
                continue
            }
            val rb = p.rubble
            if (rb != null) {
                val col = if (rb.kind == RubbleKind.slag) rgb(0x4a352e) else if (rb.kind == RubbleKind.crane) rgb(0x585c62) else rgb(0x645c50)
                for (s in rubbleSpecs) g.ellipseFill(c, x + s[0], y - s[1], s[2] / 2, s[3] / 2, col)
                if (selected) g.ellipseStroke(c, x, y - 2, 39.0, 16.0, rgb(255, 220, 160, 0.55), 1.4)
                val hold = rb.holdSec
                if (hold != null && p.rubbleLeft < hold) {
                    val prog = (1 - p.rubbleLeft / hold).coerceIn(0.0, 1.0)
                    g.setStroke(rgb(0x7fe698), 3.0)
                    g.rect.set((x - 20).toFloat(), (y - 10 - 20).toFloat(), (x + 20).toFloat(), (y - 10 + 20).toFloat())
                    c.drawArc(g.rect, -90f, (prog * 360).toFloat(), false, g.stroke)
                    g.resetStroke()
                }
            }
            val gear = p.gear
            if (gear != null) {
                c.save()
                c.translate(x.toFloat(), (y + 2).toFloat())
                c.scale(1f, 0.4f)
                c.rotate(Math.toDegrees(T * (if (gearUp) 0.6 else 0.15) * (if (gear == SplitId.a) 1 else -1)).toFloat())
                tmp.reset()
                for (k in 0 until 10) {
                    val a = k / 10.0 * TAU
                    tmp.moveTo((cos(a) * 34).toFloat(), (sin(a) * 34).toFloat()); tmp.lineTo((cos(a) * 42).toFloat(), (sin(a) * 42).toFloat())
                }
                tmp.addCircle(0f, 0f, 34f, Path.Direction.CW)
                g.path(c, tmp, if (gear == SplitId.a) rgb(230, 180, 90, 0.8) else rgb(170, 180, 195, 0.8), 4.0, cap = Paint.Cap.BUTT)
                c.restore()
                if (!gearUp) g.ellipseFill(c, x, y, 34.0, 14.0, rgb(10, 12, 10, 0.45))
            }
            val open = rb == null && !used
            if (!open) continue
            if (b.mods.tidePearl && p.nearWater) g.ellipseStroke(c, x, y - 1.5, 36.0, 14.5, rgb(110, 210, 225, 0.55), 1.6)
            if (hint) {
                g.ellipseStroke(c, x, y - 1.5, 46.0, 19.0, rgb(255, 248, 232, 0.95), 3.0)
                g.ellipseStroke(c, x, y - 1.5, 50.0, 21.0, rgb(40, 30, 22, 0.75), 2.0)
            }
            if (selected) g.ellipseStroke(c, x, y - 1.5, 39.0, 16.0, rgb(255, 214, 140, 0.6 + 0.3 * sin(T * 6)), 2.5)
            if (canAfford && !b.over && gearUp) g.sprite(c, Sprites["plus"], x, y - 2, alpha = if (selected || hint) 1.0 else 0.62)
        }
    }

    private fun drawRune(c: Canvas) {
        val r = battle.rune ?: return
        val col = css(battle.data.rune(r.kind).color)
        val bob = sin(T * 3) * 4
        g.soft(c, g.soft, r.x, r.y + 4, 32.0, 10.0, rgb(0), 0.5, Blend.normal)
        val hy = r.y - 26 + bob
        c.save()
        c.translate(r.x.toFloat(), hy.toFloat())
        c.rotate(Math.toDegrees(T).toFloat())
        g.fill.color = rgb(0x1a1c20)
        c.drawPath(hex, g.fill)
        g.path(c, hex, col, 2.5)
        c.restore()
        g.glow(c, r.x, hy, 34.0, col, 0.55)
    }

    /* ------------------------------------------------------------------ towers */

    private fun collectTowers() {
        val b = battle
        for (t in b.towers) {
            units.add(Item(10 + t.y / 100) { c -> drawTower(c, t) })
            if (!t.down) emits.add(Item(40 + t.y / 100) { c -> drawTowerLight(c, t) })
        }
    }

    private fun towerScale(t: Tower): Double {
        val lv = min(t.lv, battle.data.maxTowerLevel)
        return if (lv >= 5) 0.86 else 0.6 + 0.06 * (min(lv, 4) - 1)
    }

    private fun drawTower(c: Canvas, t: Tower) {
        val b = battle
        val lv = min(t.lv, b.data.maxTowerLevel)
        val fbLv = min(lv, 4)
        val splitTag = t.split?.let { "-${it.name}" } ?: ""
        val a = if (t.down) 0.42 else if (t.stunT > 0) 0.7 else 1.0
        if (t.lv >= 5) g.ellipseStroke(c, t.x, t.y, 33.0, 13.0, rgb(255, 220, 125, 0.72), 1.6)
        g.sprite(c, Sprites.get("t-${t.kind.name}-$lv$splitTag-${t.plot % 2}", "t-${t.kind.name}-$fbLv-${t.plot % 2}"), t.x, t.y, alpha = a)
        if (t.kind == TowerKind.cannon) {
            val S = towerScale(t)
            val ang = atan2(sin(t.aim) * 0.5, cos(t.aim))
            val frame = ((jsRound(t.aim / (PI * 2) * 16) % 16 + 16) % 16).toInt()
            val recoil = max(0.0, 1 - t.fired * 4) * 7 * S
            g.sprite(c, Sprites["barrel-$frame"], t.x + 4 * S - cos(ang) * recoil, t.y - 50 * S - sin(ang) * recoil, S, S, alpha = a)
        }
        if (t.round != null) {
            g.ellipseFill(c, t.x, t.y + 5, 5.2, 5.2, rgb(0x1c1814))
            g.ellipseFill(c, t.x, t.y + 5, 3.6, 3.6, when (t.round) { Rounds.ember -> rgb(0xff8a3a); Rounds.frost -> rgb(0x8fd0ff); else -> rgb(0xb9a8ff) })
        }
        if (t.down) {
            // Asleep on a lowered gear: a small moon badge.
            val bx = t.x; val by = t.y + 26
            g.ellipseFill(c, bx, by, 9.0, 9.0, rgb(24, 22, 20, 0.88))
            g.ellipseStroke(c, bx, by, 9.0, 9.0, rgb(220, 195, 150, 0.75), 1.2)
            tmp.reset()
            g.rect.set((bx - 1 - 4.5).toFloat(), (by - 4.5).toFloat(), (bx - 1 + 4.5).toFloat(), (by + 4.5).toFloat())
            tmp.arcTo(g.rect, Math.toDegrees(-0.6).toFloat(), -Math.toDegrees(PI * 2 - 1.2).toFloat())
            tmp.close()
            g.fill.color = rgb(0xe8d4a6)
            c.drawPath(tmp, g.fill)
        }
    }

    private fun drawTowerLight(c: Canvas, t: Tower) {
        val b = battle
        val lv = min(t.lv, b.data.maxTowerLevel)
        val fbLv = min(lv, 4)
        val splitTag = t.split?.let { "-${it.name}" } ?: ""
        when (t.kind) {
            TowerKind.beacon -> g.sprite(c, Sprites["te-beacon-$fbLv-${(T * 1.8 * 6).toInt() % 6}"], t.x, t.y, blend = Blend.add)
            TowerKind.roots -> {
                g.sprite(c, Sprites["te-roots-$fbLv-0"], t.x, t.y, blend = Blend.add)
                g.sprite(c, Sprites["te-roots-$fbLv-1"], t.x, t.y, alpha = max(0.0, 1 - t.fired), blend = Blend.add)
            }
            else -> g.sprite(c, Sprites.get("te-${t.kind.name}-$lv$splitTag", "te-${t.kind.name}-$fbLv"), t.x, t.y, blend = Blend.add)
        }
        val S = towerScale(t)
        if (t.split != null) g.glow(c, t.x, t.y - 120 * S, 26.0, towerLight.getValue(t.kind).first, (if (t.lv >= 5) 0.34 else 0.25) + 0.1 * sin(T * 3))
        if (t.kind == TowerKind.cannon && t.fired < 0.14) {
            val ang = atan2(sin(t.aim) * 0.5, cos(t.aim))
            g.glow(c, t.x + 4 * S + cos(ang) * 38 * S, t.y - 50 * S + sin(ang) * 38 * S, 26.0, rgb(0xffa040), 0.8 * (1 - t.fired / 0.14))
        }
    }

    /* ------------------------------------------------------------------ foes */

    private fun collectFoes() {
        for (f in battle.foes) {
            val depth = f.y + (if (f.def.isFlying) 40 else 0)
            val pose = pose(f)
            units.add(Item(10 + depth / 100) { c -> drawFoeBase(c, f, pose) })
            if (!f.under) emits.add(Item(40 + depth / 100) { c -> drawFoeEmit(c, f, pose) })
            // A Mender's beam to the ally it is mending.
            val tid = f.healTarget
            if (!f.dead && tid != null) {
                val tgt = battle.foes.firstOrNull { it.id == tid && !it.dead && !it.under }
                if (tgt != null) emits.add(Item(40 + depth / 100) { c ->
                    val ax = f.x + (if (f.dir == 0.0) 1.0 else f.dir) * 12; val ay = f.y - 16
                    val bx = tgt.x; val by = tgt.y - tgt.def.bar * 0.45
                    val pth = android.graphics.Path().apply { moveTo(ax.toFloat(), ay.toFloat()); quadTo(((ax + bx) / 2).toFloat(), (min(ay, by) - 18).toFloat(), bx.toFloat(), by.toFloat()) }
                    g.path(c, pth, rgb(150, 250, 185, 0.85), 2.4, blend = Blend.add)
                })
            }
        }
    }

    /** Where and how one foe is drawn this frame. */
    private class Pose(val x: Double, val y: Double, val bx: Double, val by: Double, val px: Double, val py: Double, val sx: Double, val sy: Double, val tilt: Double, val art: String, val tag: String, val K: Double, val wingSx: Double)

    private fun pose(f: Foe): Pose {
        val seed = seedOf(f)
        val m = gaits[f.id]
        val gt = gaitOf(f)
        val ph = m?.ph ?: seed
        val v = min(1.0, m?.v ?: 1.0)
        val fs = m?.face ?: (if (f.dir == 0.0) 1.0 else f.dir)
        val face = (if (fs == 0.0) 1.0 else jsSign(fs)) * max(0.25, abs(fs))
        val hx = m?.hx ?: 1.0; val hy = m?.hy ?: 0.0
        val hl = if (hypot(hx, hy) == 0.0) 1.0 else hypot(hx, hy)
        val lane = if (f.def.isBoss || f.def.isFlying) 0.0 else max(-8.0, min(8.0, f.off * 0.45)) + sin(T * 0.9 + seed * 3) * 2 * v
        val x = f.x - hy / hl * lane
        val y = f.y + hx / hl * lane * World.ySquash
        val strike = if (f.blocked) max(0.0, sin(T * 6 + seed)).pow(3) else 0.0
        val stepLift = abs(sin(ph)) * gt.lift * v
        val breath = sin(T * 2.2 + seed) * 0.5
        val by = y - stepLift + breath * (1 - v)
        val bx = x + strike * 5 * jsSign(face)
        val tilt = (hy / hl) * 0.16 * jsSign(face) + sin(ph) * gt.rock * v - strike * 0.12 * jsSign(face)
        val surge = sin(ph * 2) * gt.surge * v
        val legs: Double? = if (f.blocked || v < 0.05) null else ph
        val K = if (f.def.isBoss) 1.0 else 1.2
        val flying = f.def.isFlying
        val mothY = by + sin(T * 3 + seed) * 3 - max(0.0, sin(T * 13 + seed)) * 2
        var art = f.kind.name
        if (f.kind == EnemyKind.colossus && (f.slowT > 0 || f.freezeT > 0)) art = "colossusf"
        // A Glasshide with every pane broken: the moment to land the big hits.
        if (f.kind == EnemyKind.glasshide && f.panes == 0) art = "glasshide0"
        val tag = if (flying || legs == null) "s" else (((((legs % TAU) + TAU) % TAU) / TAU * 8 + 0.5).toInt() % 8).toString()
        fun flap(k: Double) = 1 - k * (0.5 + 0.5 * sin(T * 13 + seed))
        val moth = flying && f.kind != EnemyKind.queen
        val px = bx
        val py = if (moth) mothY else by
        val sx = if (moth) K * flap(0.35) else K * (1 + surge) * face
        val sy = K * (1 - surge * 0.8)
        return Pose(x, y, bx, by, px, py, sx, sy, tilt, art, tag, K, K * flap(0.15))
    }

    private fun drawFoeBase(c: Canvas, f: Foe, p: Pose) {
        val S = f.def.size
        if (f.under) {
            g.ellipseFill(c, p.x, p.y, 14 * S, 6 * S, rgb(40, 32, 24, 0.9))
            g.fill.color = rgb(40, 32, 24, 0.9)
            for (k in 0 until 4) c.drawRect((p.x - 10 + k * 6 + sin(T * 9 + k) * 2).toFloat(), (p.y - 3).toFloat(), (p.x - 7 + k * 6 + sin(T * 9 + k) * 2).toFloat(), p.y.toFloat(), g.fill)
            return
        }
        val a = if (f.hidden) 0.3 else 1.0
        if (f.kind == EnemyKind.queen) g.sprite(c, Sprites["f-queenw"], p.bx, p.by, p.wingSx, p.K, p.tilt, a)
        g.sprite(c, Sprites["f-${p.art}-${p.tag}"], p.px, p.py, p.sx, p.sy, p.tilt, a)
        // Roots holding it.
        if (f.rootT > 0) {
            tmp.reset()
            for (i in 0 until 6) {
                val an = i / 6.0 * TAU; val rx = cos(an) * 14 * S; val ry = sin(an) * 4
                tmp.moveTo((p.x + rx - 3).toFloat(), (p.y + ry).toFloat())
                tmp.lineTo((p.x + rx + cos(an) * 3).toFloat(), (p.y + ry - 12 - f.rootT * 4).toFloat())
                tmp.lineTo((p.x + rx + 3).toFloat(), (p.y + ry).toFloat())
                tmp.close()
            }
            g.fill.color = rgb(0x0d0f0a); c.drawPath(tmp, g.fill)
        }
        // Frozen shows a crystal, chilled a frost patch.
        if (f.freezeT > 0) {
            tmp.reset()
            tmp.moveTo((p.x - 14 * S).toFloat(), p.y.toFloat()); tmp.lineTo((p.x - 10 * S).toFloat(), (p.y - 22 * S).toFloat())
            tmp.lineTo(p.x.toFloat(), (p.y - 28 * S).toFloat()); tmp.lineTo((p.x + 11 * S).toFloat(), (p.y - 20 * S).toFloat())
            tmp.lineTo((p.x + 14 * S).toFloat(), p.y.toFloat()); tmp.close()
            g.fill.color = rgb(185, 232, 255, 0.55); c.drawPath(tmp, g.fill)
            g.path(c, tmp, rgb(240, 252, 255, 0.9), 1.0)
        } else if (f.slowT > 0) {
            g.ellipseFill(c, p.x, p.y - 2, 18 * S, 5 * S, rgb(190, 225, 250, 0.35))
        }
        // Fire: three tongues.
        if (f.burnT > 0) {
            tmp.reset()
            for (k in -1..1) {
                val fh = 12 + sin(T * 14 + k * 2) * 3
                val cx = p.x + k * 5
                tmp.moveTo((cx - 3).toFloat(), (p.y - 4).toFloat())
                tmp.quadTo((cx + sin(T * 9 + k) * 3).toFloat(), (p.y - 4 - fh).toFloat(), (cx + 3).toFloat(), (p.y - 4).toFloat())
                tmp.close()
            }
            g.fill.color = rgb(255, 130, 48, 0.78); c.drawPath(tmp, g.fill)
        }
        if (f.vulnT > 0) g.ellipseStroke(c, p.x, p.y - 2, 19 * S, 6.5 * S, rgb(255, 158, 64, 0.82), 1.6, floatArrayOf(4f, 3f))
    }

    private fun drawFoeEmit(c: Canvas, f: Foe, p: Pose) {
        val hidden = f.hidden
        val a = if (hidden) 0.3 else 1.0
        if (f.kind == EnemyKind.queen) g.sprite(c, Sprites["fe-queenw"], p.bx, p.by, p.wingSx, p.K, p.tilt, a, Blend.add)
        g.sprite(c, Sprites["fe-${p.art}-${p.tag}"], p.px, p.py, p.sx, p.sy, p.tilt, a, Blend.add)
        // The green glow in their seams: the one strong colour the Hollow owns.
        if (!hidden && !f.def.isFlying) g.glow(c, p.bx, p.by - f.def.bar * 0.35, (12 + 6 * f.def.size) * p.K, rgb(0x3be0b8), 0.28)
        if (!hidden) {
            when (f.kind) {
                EnemyKind.mender -> g.ellipseStroke(c, p.bx, p.by - 12, 26.0, 15.6, rgb(120, 230, 140, 0.2 + 0.1 * sin(T * 4)), 1.5, blend = Blend.add)
                EnemyKind.splitter -> g.ellipseStroke(c, p.bx, p.by - 14, 20.0, 12.0, rgb(180, 240, 200, 0.15), 1.5, blend = Blend.add)
                EnemyKind.warden -> { val r = 110 / World.ySquash * 0.6; g.ellipseStroke(c, p.bx, p.by - 24, r, r * 0.6, rgb(90, 200, 170, 0.22 + 0.08 * sin(T * 3)), 1.5, blend = Blend.add) }
                EnemyKind.tidewyrm -> g.ellipseStroke(c, p.bx, p.by, 60.0, 36.0, rgb(120, 190, 230, 0.2), 1.5, blend = Blend.add)
                EnemyKind.queen -> g.ellipseStroke(c, p.bx, p.by - 40, 80.0, 48.0, rgb(90, 230, 190, 0.25 + 0.1 * sin(T * 2)), 1.5, blend = Blend.add)
                else -> {}
            }
        }
        if (f.kind == EnemyKind.ashmoth) g.glow(c, p.bx, p.by - 60, 22.0, rgb(0xff7a3a), 0.35)
        if (!hidden && f.shielded) {
            val sr = 20 * f.def.size
            g.ellipseStroke(c, p.x, p.y - f.def.bar * 0.4, sr, sr * 0.6, rgb(90, 220, 185, 0.4 * (0.35 + 0.08 * sin(T * 5)) / 0.4), 1.8, blend = Blend.add)
        }
        if (!hidden && f.hitT > 0) g.glow(c, p.x, p.y - f.def.bar * 0.5, 16 * f.def.size, rgb(0xffffff), min(1.0, f.hitT * 2))
        // Health.
        if (!hidden && !look.still && (f.hp < f.max || f.def.isBoss)) {
            val col = if (f.def.isBoss) rgb(0xe0503a) else if (f.shielded) rgb(0x5ac8a8) else if (f.vulnT > 0) rgb(0xe88b3a) else rgb(0xc8552e)
            hpBar(c, p.x, p.y - f.def.bar * p.K, if (f.def.isBoss) 90.0 else 34.0, f.hp / f.max, col)
        }
    }

    /* ------------------------------------------------------------------ Wren */

    private val pip = Path().apply { moveTo(0f, -3.5f); lineTo(3.5f, 0f); lineTo(0f, 3.5f); lineTo(-3.5f, 0f); close() }

    private fun collectHero() {
        val b = battle; val h = b.hero
        if (h.dead) return
        units.add(Item(10 + h.y / 100) { c ->
            g.ellipseFill(c, h.x, h.y - 2, 30.0, 11.0, rgb(255, 244, 214, 0.38))
            g.ellipseStroke(c, h.x, h.y - 2, 30.0, 11.0, rgb(255, 236, 190, 0.95), 2.5)
            val face = if (h.face < 0) -1.0 else 1.0
            g.sprite(c, Sprites["wren"], h.x, h.y, face, 1.0)
            if (h.swing > 0) {
                val s0 = if (h.face > 0) -1.4 else PI + 1.4
                val s1 = if (h.face > 0) 0.3 else PI - 0.3
                val cx = h.x + h.face * 12; val cy = h.y - 30
                g.setStroke(rgb(220, 235, 250, min(1.0, h.swing * 3)), 3.0, cap = Paint.Cap.ROUND)
                g.rect.set((cx - 30).toFloat(), (cy - 30).toFloat(), (cx + 30).toFloat(), (cy + 30).toFloat())
                c.drawArc(g.rect, Math.toDegrees(s0).toFloat(), Math.toDegrees(s1 - s0).toFloat(), false, g.stroke)
                g.resetStroke()
            }
            g.fill.color = rgb(0xd49a38)
            for (i in 0 until min(4, h.items.size)) { c.save(); c.translate((h.x - 10 + i * 10).toFloat(), (h.y - 13).toFloat()); c.drawPath(pip, g.fill); c.restore() }
        })
        emits.add(Item(40 + h.y / 100) { c ->
            val face = if (h.face < 0) -1.0 else 1.0
            g.sprite(c, Sprites["wren-e"], h.x, h.y, face, 1.0, blend = Blend.add)
            val still = look.still
            if (!still) {
                hpBar(c, h.x, h.y - 98, 46.0, h.hp / b.heroMaxHp(), rgb(0x7fd06a))
                g.outlined(c, "${h.level}", h.x - 32, h.y - 94, 12.0, rgb(0xffe2a0), ArtFiles.barlow, 0.24)
                if (h.double > 0) g.ellipseStroke(c, h.x, h.y - 30, 34.0, 20.4, rgb(90, 180, 255, 0.35), 1.5, blend = Blend.add)
                if (h.haste > 0) g.ellipseStroke(c, h.x, h.y, 26.0, 15.6, rgb(255, 110, 80, 0.3), 1.5, blend = Blend.add)
                if (h.sunriseT > 0) g.glow(c, h.x, h.y - 40, 110.0, rgb(0xffd590), 0.35 + 0.1 * sin(T * 6))
                if (hypot2(h.anchorX - h.x, h.anchorY - h.y) > 20) g.ellipseStroke(c, h.anchorX, h.anchorY, 14.0, 6.0, rgb(255, 214, 140, 0.35), 1.5, floatArrayOf(3f, 6f))
            }
            moveMark?.let { m ->
                val a = m.t / 0.6
                g.ellipseStroke(c, m.x, m.y, 22 * (1.4 - a), 9 * (1.4 - a), rgb(255, 214, 140, a), 2.0)
            }
        })
    }

    /* ------------------------------------------------------------------ gates, posts and the lighthouse */

    private fun collectFixtures() {
        val b = battle; val st = b.stage
        for (gt in b.gate) {
            units.add(Item(10 + gt.y / 100) { c -> g.sprite(c, Sprites["gate"], gt.x, gt.y) })
            emits.add(Item(40 + gt.y / 100) { c -> g.sprite(c, Sprites["gate-e"], gt.x, gt.y, blend = Blend.add) })
        }
        for (p in posts) {
            units.add(Item(10 + p.y / 100) { c -> g.sprite(c, Sprites["post"], p.x, p.y) })
            emits.add(Item(40 + p.y / 100) { c ->
                g.glow(c, p.x, p.y - 34, 10.0, rgb(0xff9a3a), 0.25)
                g.fill.color = rgb(0xffd08a)
                c.drawRect((p.x - 2).toFloat(), (p.y - 37).toFloat(), (p.x + 2).toFloat(), (p.y - 31).toFloat(), g.fill)
            })
        }
        val lh = st.lighthouse
        if (lh != null) {
            emits.add(Item(40 + lh.y / 100 - 0.001) { c ->
                c.save()
                c.translate(lh.x.toFloat(), (lh.y - 110).toFloat())
                if (!look.reduceMotion) c.rotate(Math.toDegrees(T * 0.65).toFloat())
                g.fill.color = rgb(255, 230, 175, 0.16)
                g.blend(g.fill, Blend.add)
                c.drawPath(beam, g.fill)
                g.blend(g.fill, Blend.normal)
                c.restore()
            })
            emits.add(Item(40 + lh.y / 100) { c -> g.glow(c, lh.x, lh.y - 110, 62.0, rgb(0xffe6b0), 0.55) })
        }
    }

    /* ------------------------------------------------------------------ particles, clouds, light */

    private fun drawParts(c: Canvas, kind: PartKind) {
        for (p in parts) {
            if (p.kind != kind) continue
            when (kind) {
                PartKind.smoke -> { val r = p.s * (2.2 - p.life / p.max); g.soft(c, g.disc, p.x, p.y, r * 2, r * 2, p.color, p.life / p.max * 0.4, Blend.normal) }
                PartKind.chip -> { g.fill.color = withAlpha(p.color, min(1.0, p.life / p.max * 2)); c.drawRect(p.x.toFloat(), p.y.toFloat(), (p.x + p.s).toFloat(), (p.y + p.s).toFloat(), g.fill) }
                PartKind.spark -> {
                    g.fill.color = withAlpha(p.color, p.life / p.max); g.blend(g.fill, Blend.add)
                    c.drawRect(p.x.toFloat(), p.y.toFloat(), (p.x + p.s).toFloat(), (p.y + p.s).toFloat(), g.fill)
                    g.blend(g.fill, Blend.normal)
                }
            }
        }
    }

    private fun drawClouds(c: Canvas) {
        for (cl in battle.clouds) g.soft(c, g.soft, cl.x, cl.y, cl.r * 2, cl.r * 2 / World.ySquash, rgb(120, 170, 70), 0.35 * min(1.0, cl.t), Blend.normal)
    }

    private val darkBmp: Bitmap = Bitmap.createBitmap(192, 108, Bitmap.Config.ARGB_8888)
    private val darkCanvas = Canvas(darkBmp)
    private val darkPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val holePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_OUT) }
    private val darkDst = RectF(0f, 0f, World.width.toFloat(), World.height.toFloat())

    /** Lanterns, towers and Wren light the map. By day it is nearly bright; at night and in the Rift the dark closes in. */
    private fun drawLight(c: Canvas) {
        val b = battle; val st = b.stage
        val amt = if (b.hero.sunriseT > 0) 0.0 else if (b.night) 0.62 else if (st.isLava) 0.14 else 0.03
        if (amt <= 0.05) return
        val k = 192.0 / World.width
        darkBmp.eraseColor(0)
        darkPaint.shader = LinearGradient(0f, 0f, 192f, 108f, rgb(6, 9, 16, amt * 0.82), rgb(3, 4, 8, amt), Shader.TileMode.CLAMP)
        darkCanvas.drawRect(0f, 0f, 192f, 108f, darkPaint)
        val fk = 1 + sin(T * 7) * 0.03
        fun hole(x: Double, y: Double, r: Double, s: Double) {
            if (r <= 0) return
            holePaint.shader = RadialGradient((x * k).toFloat(), (y * k).toFloat(), (r * k).toFloat(),
                intArrayOf(rgb(0, 0, 0, s), rgb(0, 0, 0, s * 0.55), rgb(0, 0, 0, 0.0)), floatArrayOf(0f, 0.5f, 1f), Shader.TileMode.CLAMP)
            darkCanvas.drawCircle((x * k).toFloat(), (y * k).toFloat(), (r * k).toFloat(), holePaint)
        }
        for (t in b.towers) hole(t.x, t.y - 50, (if (t.kind == TowerKind.beacon) b.stats(t).range * 0.8 else towerLight.getValue(t.kind).second) * fk, 0.9)
        for (p in posts) hole(p.x, p.y - 34, 70 * fk, 0.75)
        if (!b.hero.dead) hole(b.hero.x - 16, b.hero.y - 10, b.heroSight() * fk, 0.95)
        for (gt in b.gate) hole(gt.x, gt.y - 120, 230 * fk, 1.0)
        st.lighthouse?.let { hole(it.x, it.y - 120, 380.0, 1.0) }
        for (f in fx) if (f.kind == FxKind.boom) hole(f.x, f.y, 140 * f.life / 0.45 + 40, 0.9)
        g.bmp.alpha = 255
        c.drawBitmap(darkBmp, null, darkDst, g.bmp)
    }

    /* ------------------------------------------------------------------ shots, effects, ranges */

    private val streakSrc = Rect(0, 0, 64, 4)

    private fun drawShots(c: Canvas) {
        if (look.still) return
        for (s in battle.shots) {
            if (s.t < 0) continue
            val u = min(1.0, s.t / s.dur)
            if (s.kind == ShotKind.bolt) {
                val x = s.x0 + (s.tx - s.x0) * u; val y = s.y0 + (s.ty - 12 - s.y0) * u
                val u0 = max(0.0, u - 0.18)
                val bx = s.x0 + (s.tx - s.x0) * u0; val by = s.y0 + (s.ty - 12 - s.y0) * u0
                val len = max(1.0, hypot(x - bx, y - by))
                val h = if (s.crit) 3.0 else 2.0
                c.save()
                c.translate(x.toFloat(), y.toFloat())
                c.rotate(Math.toDegrees(atan2(y - by, x - bx)).toFloat())
                g.bmp.colorFilter = g.tint(if (s.crit) rgb(255, 240, 200) else rgb(255, 215, 160))
                g.bmp.alpha = if (s.crit) 255 else 230
                g.blend(g.bmp, Blend.add)
                g.rect.set(-len.toFloat(), (-h / 2).toFloat(), 0f, (h / 2).toFloat())
                c.drawBitmap(g.streak, streakSrc, g.rect, g.bmp)
                g.blend(g.bmp, Blend.normal); g.bmp.colorFilter = null
                c.restore()
            } else {
                val arc = sin(u * PI) * 90
                val x = s.x0 + (s.tx - s.x0) * u; val y = s.y0 + (s.ty - s.y0) * u - arc
                g.soft(c, g.disc, x, y, 9.0, 9.0, rgb(0x0c0c0d), 1.0, Blend.normal)
                if (R() < 0.5) parts.add(Part(x, y, 0.0, -6.0, 0.7, 0.7, rgb(60, 60, 62), 3.0, PartKind.smoke))
            }
        }
    }

    /** A jagged bolt along the chain of points, as LFX.bolt draws it. */
    private fun boltPath(pts: List<Vec>, seed: Int): Path {
        val path = Path()
        if (pts.size < 2) return path
        for (i in 1 until pts.size) {
            val r = Rng(seed + i)
            val a = pts[i - 1]; val b = pts[i]
            path.moveTo(a.x.toFloat(), a.y.toFloat())
            for (j in 1 until 12) {
                val t = j / 12.0
                path.lineTo((a.x + (b.x - a.x) * t + (r.next() - 0.5) * 14).toFloat(), (a.y + (b.y - a.y) * t + (r.next() - 0.5) * 14).toFloat())
            }
            path.lineTo(b.x.toFloat(), b.y.toFloat())
        }
        return path
    }

    private fun drawFx(c: Canvas) {
        for (e in fx) {
            when (e.kind) {
                FxKind.ring -> { val a = 1 - e.r / e.max; g.ellipseStroke(c, e.x, e.y, e.r, e.r / World.ySquash * 0.6, withAlpha(e.color, 0.45 * a), 2.0, blend = Blend.add) }
                FxKind.arc -> e.bolt?.let {
                    g.path(c, it, rgb(250, 248, 255, 0.35), 4.0, blend = Blend.add)
                    g.path(c, it, rgb(250, 248, 255, 0.95), 1.2, blend = Blend.add)
                }
                FxKind.boom -> {
                    val a = e.life / e.max
                    g.glow(c, e.x, e.y - 8, 70 * (1.2 - a) + 20, rgb(0xff8a3a), 0.6 * a)
                    g.glow(c, e.x, e.y - 8, 20.0, rgb(0xffe0b0), 0.8 * a)
                }
                FxKind.slash -> {
                    val a = e.life / e.max; val k = 1.2 - a * 0.4
                    val rx = e.r * k; val ry = e.r * 0.45 * k
                    g.setStroke(rgb(220, 235, 250, a), 4.0, blend = Blend.add)
                    g.rect.set((e.x - rx).toFloat(), (e.y - 10 - ry).toFloat(), (e.x + rx).toFloat(), (e.y - 10 + ry).toFloat())
                    c.drawArc(g.rect, Math.toDegrees(T * 8).toFloat(), Math.toDegrees(4.5).toFloat(), false, g.stroke)
                    g.resetStroke()
                }
                FxKind.lantern -> {
                    val a = e.life / e.max
                    g.glow(c, e.x, e.y - 10, e.r, rgb(0xffb050), 0.5 * a)
                    g.ellipseStroke(c, e.x, e.y, e.r, e.r / World.ySquash * 0.6, rgb(255, 200, 120, a), 2.0, blend = Blend.add)
                }
                FxKind.sun -> { val a = e.life / e.max; g.glow(c, e.x, e.y - 40, 400 * (1.2 - a), rgb(0xffd590), 0.5 * a) }
                FxKind.steam -> {
                    val a = e.life / e.max
                    for (k in 0 until 5) {
                        val r = 14.0 + k * 4
                        g.soft(c, g.disc, e.x + sin(k * 2 + T) * 10, e.y - (1 - a) * 90 - k * 14, r * 2, r * 2, rgb(230, 230, 230), 0.18 * a, Blend.add)
                    }
                }
                FxKind.splash -> { val a = e.life / e.max; val k = 1.2 - a; g.ellipseStroke(c, e.x, e.y, 60 * k, 20 * k, rgb(200, 230, 255, a), 2.0, blend = Blend.add) }
            }
        }
    }

    private fun drawRain(c: Canvas) {
        if (battle.stage.weather != "rain" || look.reduceMotion || look.still) return
        g.setStroke(rgb(195, 222, 245, 0.24), 1.1, cap = Paint.Cap.ROUND)
        for (i in 0 until 65) {
            val rx = (i * 97 + T * 420) % (World.width + 120) - 60
            val ry = (i * 71 + T * 880) % (World.height + 80) - 40
            c.save(); c.translate(rx.toFloat(), ry.toFloat()); c.drawPath(rainPath, g.stroke); c.restore()
        }
        g.resetStroke()
    }

    private fun drawRanges(c: Canvas) {
        val b = battle
        fun ring(x: Double, y: Double, r: Double, col: Int) {
            g.ellipseFill(c, x, y, r, r / World.ySquash, withAlpha(col, 0.08))
            g.ellipseStroke(c, x, y, r, r / World.ySquash, withAlpha(col, 0.7), 1.5, floatArrayOf(6f, 6f))
        }
        look.selTower?.let { id -> b.tower(id)?.let { t ->
            ring(t.x, t.y, b.stats(t).range, rgb(255, 214, 140))
            if (t.kind != TowerKind.beacon) ring(t.x, t.y, Battle.TOWER_SIGHT, rgb(140, 200, 255))
        } }
        val pi = look.selPlot; val kind = look.preview
        if (pi != null && kind != null && pi < b.plots.size) {
            val p = b.plots[pi]
            val waterBonus = if (b.mods.tidePearl && p.nearWater) 0.15 else 0.0
            val modRange = 1 + (b.mods.towerRange[kind] ?: 0.0) + b.mods.rangeAll + waterBonus
            ring(p.x, p.y, b.data.tower(kind).range[0] * modRange * (if (p.high) 1.2 else 1.0), rgb(255, 214, 140))
        }
        if (look.aiming) {
            ring(b.hero.x, b.hero.y, b.data.snare.range, rgb(255, 214, 140))
            look.aimW?.let { ring(it.x, it.y, b.data.snare.radius, rgb(255, 150, 70)) }
        }
        if (look.showLeash && !b.hero.dead) {
            ring(b.hero.anchorX, b.hero.anchorY, b.data.hero.leash, rgb(255, 214, 140))
            if (b.hero.rank(SkillKey.e) > 0) ring(b.hero.x, b.hero.y, b.data.attune.radius, rgb(130, 220, 145))
        }
    }

    private class Crow(var x: Double, val y: Double, val v: Double, val n: Int)
    private val crows = ArrayList<Crow>()
    private var crowDt = 0.0

    private fun drawCrows(c: Canvas) {
        if (look.reduceMotion || look.still) { crows.clear(); return }
        val dt = crowDt
        if (R() < dt * 0.15 && crows.size < 2) {
            val l = R() < 0.5
            crows.add(Crow(if (l) -40.0 else World.width + 40, 60 + R() * 380, (if (l) 1 else -1) * (110 + R() * 50), 3 + (R() * 3).toInt()))
        }
        g.setStroke(rgb(0x141414), 2.2, cap = Paint.Cap.ROUND)
        for (cr in crows) {
            cr.x += cr.v * dt
            for (k in 0 until cr.n) {
                val x = cr.x - jsSign(cr.v) * k * 26; val y = cr.y + (k % 2) * 14 + k * 6; val w = sin(T * 14 + k) * 6
                tmp2.reset()
                tmp2.moveTo((x - 10).toFloat(), (y - w).toFloat())
                tmp2.quadTo((x - 4).toFloat(), (y - 2).toFloat(), x.toFloat(), (y + 2).toFloat())
                tmp2.quadTo((x + 4).toFloat(), (y - 2).toFloat(), (x + 10).toFloat(), (y - w).toFloat())
                c.drawPath(tmp2, g.stroke)
            }
        }
        g.resetStroke()
        crows.removeAll { it.x < -120 || it.x > World.width + 120 }
    }

    private fun drawCoins(c: Canvas) {
        for (cn in coins) g.soft(c, g.disc, cn.x, cn.y, (4.5 * abs(cos(cn.u * 12)) + 1) * 2, 9.0, rgb(0xd9962a), 1.0, Blend.normal)
    }

    private fun drawFloats(c: Canvas) {
        for (f in floats) {
            val a = min(1.0, f.life / f.max * 2.2)
            val sc = if (f.big) 1 + max(0.0, f.life / f.max - 0.75) * 2 else 1.0
            val size = (if (f.big) 24 else 15) * sc
            g.outlined(c, f.text, f.x, f.y, size, f.color, ArtFiles.cinzel, if (f.big) 0.18 else 0.2, a)
        }
    }
}
