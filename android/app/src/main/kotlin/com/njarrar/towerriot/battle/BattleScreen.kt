package com.njarrar.towerriot.battle

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.njarrar.towerriot.AppModel
import com.njarrar.towerriot.engine.Element
import com.njarrar.towerriot.engine.Rounds
import com.njarrar.towerriot.engine.SkillKey
import com.njarrar.towerriot.engine.SplitId
import com.njarrar.towerriot.engine.StageVariant
import com.njarrar.towerriot.engine.Status
import com.njarrar.towerriot.engine.TowerKind
import com.njarrar.towerriot.engine.World
import com.njarrar.towerriot.engine.jsRound
import com.njarrar.towerriot.engine.starLives
import com.njarrar.towerriot.ui.ArtIcon
import com.njarrar.towerriot.ui.ArtPicture
import com.njarrar.towerriot.ui.Face
import com.njarrar.towerriot.ui.Glyph
import com.njarrar.towerriot.ui.GlyphIcon
import com.njarrar.towerriot.ui.IconBtn
import com.njarrar.towerriot.ui.Ink
import com.njarrar.towerriot.ui.Kind
import com.njarrar.towerriot.ui.LocalUpright
import com.njarrar.towerriot.ui.Meter
import com.njarrar.towerriot.ui.PaperButton
import com.njarrar.towerriot.ui.Price
import com.njarrar.towerriot.ui.Segments
import com.njarrar.towerriot.ui.Stars
import com.njarrar.towerriot.ui.T
import com.njarrar.towerriot.ui.Tag
import com.njarrar.towerriot.ui.W
import com.njarrar.towerriot.ui.paperCard
import com.njarrar.towerriot.ui.softShadow
import kotlinx.coroutines.delay
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

/** A rectangle in dp. */
private data class Box2(val x: Float, val y: Float, val w: Float, val h: Float) {
    val maxX get() = x + w
    val maxY get() = y + h
    val midX get() = x + w / 2
}

private class Safe(val top: Float, val bottom: Float, val left: Float, val right: Float)

/**
 * The battle screen: the map, the HUD, build menus, hero controls, shop and the result card.
 * Wide screens put the HUD in columns beside the map; narrower ones put a band under it. The map keeps 16:9.
 * A phone held upright gets a strip on top, the map at full height in the middle and a deep band below;
 * the map is wider than the screen there, and a drag slides it left and right.
 */
@Composable
fun BattleScreen(app: AppModel, s: AppModel.Screen.Battle) {
    val ctl = remember { BattleController(s.id, s.variant, s.oaths, app) }
    BackHandler {
        when {
            ctl.result != null -> ctl.exit()
            ctl.exitAsk -> ctl.keepFighting()
            ctl.menu != null -> ctl.closeMenu()
            ctl.shopOpen -> ctl.shopOpen = false
            else -> ctl.requestExit()
        }
    }
    LaunchedEffect(ctl) {
        var last = 0L
        while (true) {
            withFrameNanos { t ->
                val dt = if (last == 0L) 0.0 else min(0.05, max(0.0, (t - last) / 1e9))
                last = t
                ctl.frame(dt)
            }
        }
    }
    val density = LocalDensity.current
    val dir = LocalLayoutDirection.current
    val pv = WindowInsets.safeDrawing.asPaddingValues()
    val safe = Safe(pv.calculateTopPadding().value, pv.calculateBottomPadding().value, pv.calculateLeftPadding(dir).value, pv.calculateRightPadding(dir).value)
    BoxWithConstraints(Modifier.fillMaxSize().background(Ink.paper3)) {
        val w = maxWidth.value; val h = maxHeight.value
        val upright = h > w * 1.15f && w < 760
        val sideRoom = (w - safe.left - safe.right - h * 16 / 9) / 2
        val side = !upright && sideRoom >= 64
        val band = if (h < 480) 74f else 92f
        val top = if (upright) safe.top + 56 else 0f
        val map: Box2 = when {
            upright -> {
                // At least about two fifths of the map in view, so towers and foes stay big enough to tap.
                val mh = max(180f, min(h - top - 210 - safe.bottom, (w / (World.width * 0.42) * World.height).toFloat()))
                Box2(0f, top, w, mh)
            }
            side -> { val mw = h * 16 / 9; Box2((w - mw) / 2, 0f, mw, h) }
            else -> { val mh = min(h - band - safe.bottom, w * 9 / 16); val mw = mh * 16 / 9; Box2((w - mw) / 2, 0f, mw, mh) }
        }
        val scale = map.h / World.height.toFloat()
        ctl.density = density.density.toDouble()
        ctl.setView((scale * density.density).toDouble(), min(World.width / 2, (map.w / scale / 2).toDouble()))
        // Read so the map slides when it pans.
        val centre = ctl.viewCentre.let { ctl.centre() }
        val full = if (upright) Box2((map.midX - centre * scale).toFloat(), map.y, (World.width * scale).toFloat(), map.h) else map

        // The map.
        Box(
            Modifier.offset(map.x.dp, map.y.dp).size(map.w.dp, map.h.dp).clipToBounds()
                .pointerInput(ctl) {
                    val slop = 10.dp.toPx(); val tapSlop = 18.dp.toPx()
                    awaitEachGesture {
                        val down = awaitFirstDown(requireUnconsumed = false)
                        fun world(p: Offset): Pair<Double, Double> {
                            val k = map.h / World.height.toFloat() * density.density
                            val left = (full.x - map.x) * density.density
                            return ((p.x - left) / k).toDouble() to (p.y / k).toDouble()
                        }
                        val w0 = world(down.position)
                        ctl.touchDown(down.position.x, down.position.y, w0.first, w0.second)
                        var id = down.id
                        while (true) {
                            val ev = awaitPointerEvent()
                            val c = ev.changes.firstOrNull { it.id == id } ?: ev.changes.first().also { id = it.id }
                            val wp = world(c.position)
                            if (!c.pressed) { ctl.touchUp(c.position.x, c.position.y, wp.first, wp.second, tapSlop); break }
                            if (c.positionChanged()) ctl.touchMove(c.position.x, c.position.y, wp.first, wp.second, slop)
                        }
                    }
                },
        ) {
            Canvas(Modifier.offset((full.x - map.x).dp, 0.dp).size(full.w.dp, full.h.dp)) {
                ctl.frameNo
                val k = size.height / World.height.toFloat()
                drawIntoCanvas { c ->
                    val nc = c.nativeCanvas
                    nc.save()
                    nc.scale(k, k)
                    ctl.scene.draw(nc)
                    nc.restore()
                }
            }
        }
        Hud(ctl, map, full, side, upright, safe, w, h)
    }
}

@Composable
private fun Hud(ctl: BattleController, map: Box2, full: Box2, side: Boolean, upright: Boolean, safe: Safe, w: Float, h: Float) {
    ctl.tick
    val b = ctl.battle
    fun toView(x: Double, y: Double) = Offset((full.x + x / World.width * full.w).toFloat(), (full.y + y / World.height * full.h).toFloat())
    Box(Modifier.fillMaxSize()) {
        when {
            upright -> {
                // Top strip, under the camera: lives, gold, wave, speed and pause.
                Row(
                    Modifier.size(w.dp, map.y.dp).background(Ink.paper).bottomRule()
                        .padding(start = (8 + safe.left).dp, end = (8 + safe.right).dp, bottom = 6.dp),
                    verticalAlignment = Alignment.Bottom,
                ) {
                    if (ctl.leftHandHud) { ControlsView(ctl, compact = true); Spacer(Modifier.weight(1f)); StatsView(ctl, false, Part.Core) }
                    else { StatsView(ctl, false, Part.Core); Spacer(Modifier.weight(1f)); ControlsView(ctl, compact = true) }
                }
                // Band below the map: Wren and the call button, then the skills.
                Column(
                    Modifier.offset(0.dp, map.maxY.dp).size(w.dp, (h - map.maxY).dp).background(Ink.paper).topRule()
                        .padding(start = 10.dp, end = 10.dp, top = 10.dp, bottom = (10 + safe.bottom).dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                        if (ctl.leftHandHud) { CallView(ctl, true); Spacer(Modifier.weight(1f)); HeroCard(ctl) }
                        else { HeroCard(ctl); Spacer(Modifier.weight(1f)); CallView(ctl, true) }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { SkillsView(ctl, false); AutoTile(ctl) }
                }
                EdgeMarks(ctl, map, full)
                // The Hollow's adapt and resist pills, only while they matter, on the map's foot.
                Row(Modifier.offset(8.dp, (map.maxY - 36).dp).width((w - 16).dp), horizontalArrangement = if (ctl.leftHandHud) Arrangement.End else Arrangement.Start) {
                    StatsView(ctl, false, Part.Extras)
                }
            }
            side -> {
                val leftW = max(0f, map.x - safe.left)
                val rightW = max(0f, w - map.maxX - safe.right)
                val statsCol: @Composable ColumnScope.() -> Unit = { StatsView(ctl, true); Spacer(Modifier.weight(1f)); HeroCard(ctl) }
                val ctlCol: @Composable ColumnScope.() -> Unit = { ControlsView(ctl); SkillsView(ctl, true); Spacer(Modifier.weight(1f)); CallView(ctl, true) }
                Column(Modifier.offset(safe.left.dp, 0.dp).size(leftW.dp, h.dp).padding(horizontal = 8.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp), horizontalAlignment = Alignment.Start,
                    content = if (ctl.leftHandHud) ctlCol else statsCol)
                Column(Modifier.offset(map.maxX.dp, 0.dp).size(rightW.dp, h.dp).padding(horizontal = 8.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp), horizontalAlignment = Alignment.End,
                    content = if (ctl.leftHandHud) statsCol else ctlCol)
            }
            else -> {
                Row(
                    Modifier.offset(0.dp, map.maxY.dp).size(w.dp, (h - map.maxY).dp).background(Ink.paper).topRule()
                        .padding(start = (10 + safe.left).dp, end = (10 + safe.right).dp, top = 6.dp, bottom = 6.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    if (ctl.leftHandHud) { CallView(ctl, false); Spacer(Modifier.weight(1f)); SkillsView(ctl, false); HeroCard(ctl) }
                    else { HeroCard(ctl); SkillsView(ctl, false); Spacer(Modifier.weight(1f)); CallView(ctl, false) }
                }
                // Over the map's top edge: lives and gold on one side, the controls on the other.
                val padL = max(0f, safe.left - map.x); val padR = max(0f, safe.right - (w - map.maxX))
                val rowW = max(0f, map.w - 16 - padL - padR)
                Row(Modifier.offset((map.x + 8 + padL).dp, (map.y + 8).dp).width(rowW.dp), horizontalArrangement = if (ctl.leftHandHud) Arrangement.End else Arrangement.Start) { StatsView(ctl, false) }
                Row(Modifier.offset((map.x + 8 + padL).dp, (map.y + 8).dp).width(rowW.dp), horizontalArrangement = if (ctl.leftHandHud) Arrangement.Start else Arrangement.End) { ControlsView(ctl) }
            }
        }

        val hp = ctl.hintPlot
        if (hp != null && ctl.menu == null && hp < b.plots.size) {
            val p = b.plots[hp]; val pt = toView(p.x, p.y - 24)
            Box(Modifier.offset((pt.x - 100).dp, (pt.y - 16 - 14).dp).width(200.dp), contentAlignment = Alignment.Center) {
                Box(Modifier.clip(CircleShape).background(Ink.accent).padding(horizontal = 10.dp, vertical = 5.dp)) {
                    T("Build here", Face.body(14, W.Heavy), Ink.accentInk, maxLines = 1)
                }
            }
        }
        ctl.banner?.let { bn ->
            Box(Modifier.offset(map.x.dp, (if (bn.low) map.maxY - 86 else map.y + 56).dp).width(map.w.dp), contentAlignment = Alignment.TopCenter) { BannerView(bn) }
        }
        ctl.menu?.let { MenuCard(ctl, it, ::toView, map, w, h) }
        if (ctl.shopOpen) {
            val shopW = min(340f, map.w - 16)
            Box(Modifier.offset((if (ctl.leftHandHud) map.x + 8 else map.maxX - shopW - 8).dp, (map.y + 8).dp).width(shopW.dp).heightIn(max = (map.h - 16).dp)) { ShopView(ctl) }
        }
        if (b.paused && !ctl.exitAsk && ctl.result == null) {
            // Under the controls when they sit over the map, so pausing never covers them.
            Box(Modifier.offset(map.x.dp, (map.y + if (upright || side) 10 else 60).dp).width(map.w.dp), contentAlignment = Alignment.TopCenter) { PauseStrip(ctl) }
        }
        if (ctl.exitAsk) ExitCard(ctl)
        ctl.result?.let { ResultCard(ctl, it) }
    }
}

private fun Modifier.bottomRule() = rule(bottom = true)
private fun Modifier.topRule() = rule(bottom = false)
private fun Modifier.rule(bottom: Boolean): Modifier = this.drawBehind {
    val y = if (bottom) size.height - 0.5.dp.toPx() else 0.5.dp.toPx()
    drawLine(Ink.rule, Offset(0f, y), Offset(size.width, y), 1.dp.toPx())
}

/** When the map runs past the screen's sides: a soft shade at an edge with more map beyond it,
 * and a red notch on that edge for each foe out of view, at its height on the map. */
@Composable
private fun EdgeMarks(ctl: BattleController, map: Box2, full: Box2) {
    ctl.frameNo
    val b = ctl.battle
    val k = full.w / World.width.toFloat()
    val x0 = (map.x - full.x) / k; val x1 = (map.maxX - full.x) / k
    Canvas(Modifier.offset(map.x.dp, map.y.dp).size(map.w.dp, map.h.dp)) {
        val px = size.width / map.w
        for (s in listOf(-1, 1)) {
            val more = if (s < 0) full.x < map.x - 1 else full.maxX > map.maxX + 1
            if (!more) continue
            val ex = if (s < 0) 0f else size.width
            val gw = 18 * px
            val brush = Brush.horizontalGradient(
                if (s < 0) listOf(Ink.ink.copy(alpha = 0.28f), Ink.ink.copy(alpha = 0f)) else listOf(Ink.ink.copy(alpha = 0f), Ink.ink.copy(alpha = 0.28f)),
                startX = if (s < 0) 0f else ex - gw, endX = if (s < 0) gw else ex,
            )
            drawRect(brush, Offset(if (s < 0) 0f else ex - gw, 0f), androidx.compose.ui.geometry.Size(gw, size.height))
            for (f in b.foes) {
                if (f.dead || !(if (s < 0) f.x < x0 else f.x > x1)) continue
                val y = max(8f, min(map.h - 8, (f.y * k).toFloat())) * px
                val p = Path()
                if (s < 0) { val l = ex + 2 * px; p.moveTo(l + 10 * px, y - 7 * px); p.lineTo(l, y); p.lineTo(l + 10 * px, y + 7 * px) }
                else { val l = ex - 12 * px; p.moveTo(l, y - 7 * px); p.lineTo(l + 10 * px, y); p.lineTo(l, y + 7 * px) }
                p.close()
                drawPath(p, Ink.life)
            }
        }
    }
}

/* ------------------------------------------------------------------ stats and controls */

private enum class Part { All, Core, Extras }

@Composable
private fun Pill(content: @Composable () -> Unit) {
    val upright = LocalUpright.current
    Row(
        Modifier.clip(CircleShape).background(Ink.paperGlass).border(1.dp, Ink.rule, CircleShape)
            .padding(horizontal = if (upright) 7.dp else 9.dp, vertical = 5.dp),
        horizontalArrangement = Arrangement.spacedBy(5.dp), verticalAlignment = Alignment.CenterVertically,
    ) { content() }
}

@Composable
private fun StatsView(ctl: BattleController, vertical: Boolean, part: Part = Part.All) {
    val b = ctl.battle
    val share = b.lives.toDouble() / b.startLives
    val held = if (share >= 0.9) 3 else if (share >= 0.5) 2 else 1
    val adapt = b.adaptationShare()
    val res = Element.entries.mapNotNull { e -> val v = b.resist(e); if (v > 0 && e != Element.hero) e to v else null }
    val items: @Composable () -> Unit = {
        if (part != Part.Extras) {
            Box(Modifier.semantics { contentDescription = "Lives ${b.lives}. Keep ${starLives(b.startLives).first} for 3 stars." }) {
                Pill {
                    GlyphIcon(Glyph.Heart, 13.dp, Ink.life)
                    T("${b.lives}", Face.body(16, W.Heavy))
                    Row { for (i in 0 until 3) T("★", Face.body(11), if (i < held) Ink.gold else Ink.ruleStrong) }
                }
            }
            Pill { Price(b.gold, 16) }
            Pill {
                GlyphIcon(Glyph.Flag, 12.dp, Ink.inkDim)
                T("${max(1, b.wave)}/${b.totalWaves}", Face.body(16, W.Heavy))
            }
        }
        if (part != Part.Core) {
            // Only on stages where the Hollow can adapt, and only once one element leads.
            val el = adapt.top
            if (el != null && adapt.share >= 0.28 && (b.stage.region > 0 || b.stage.adaptEvery != null)) {
                val hot = adapt.share > adapt.threshold
                Pill {
                    ArtIcon("el-${el.name}", 14.dp, if (hot) Ink.hollow else Ink.inkDim)
                    T("${jsRound(adapt.share * 100).toInt()}%/42%", Face.body(12, W.Heavy), if (hot) Ink.hollow else Ink.inkDim)
                }
            }
            for ((e, v) in res) {
                Pill {
                    ArtIcon("el-${e.name}", 14.dp, Ink.hollow)
                    if (vertical) T(Words.elementTitle[e] ?: "", Face.body(12, W.Bold), Ink.inkDim)
                    T("${Math.round(v * 100)}%", Face.body(13, W.Heavy), Ink.hollow)
                }
            }
        }
    }
    if (vertical) Column(verticalArrangement = Arrangement.spacedBy(6.dp), horizontalAlignment = Alignment.Start) { items() }
    else Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) { items() }
}

@Composable
private fun SquareText(text: String, size: Dp, on: Boolean, label: String, radius: Dp = 5.dp, onClick: () -> Unit, content: @Composable () -> Unit = { T(text, Face.body(16, W.Heavy), if (on) Ink.accentInk else Ink.ink, maxLines = 1) }) {
    val shape = RoundedCornerShape(radius)
    Box(
        Modifier.size(size).clip(shape).background(if (on) Ink.accent else Ink.paperGlass, shape).border(1.dp, if (on) Ink.accentLo else Ink.ruleStrong, shape)
            .clickable(role = Role.Button, onClick = onClick).semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { content() }
}

@Composable
private fun ControlsView(ctl: BattleController, compact: Boolean = false) {
    val b = ctl.battle
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        if (!compact) {
            SquareText("Auto", 44.dp, ctl.autoNext, "Auto-call next wave", onClick = { ctl.toggleAutoNext() }) {
                T("Auto", Face.body(12, W.Heavy), if (ctl.autoNext) Ink.accentInk else Ink.inkDim, maxLines = 1)
            }
            IconBtn(if (ctl.soundOn) "sound" else "mute", if (ctl.soundOn) "Mute sound" else "Turn sound on", dim = !ctl.soundOn) { ctl.toggleSound() }
        }
        SquareText("${b.speed.toInt()}x", 44.dp, false, "Game speed", onClick = { ctl.cycleSpeed() })
        IconBtn(if (b.paused) "play" else "pause", if (b.paused) "Resume" else "Pause", active = b.paused) { ctl.togglePause() }
    }
}

/** Auto-call as a tile beside the skills, for the upright band. */
@Composable
private fun AutoTile(ctl: BattleController) {
    SquareText("Auto", 58.dp, ctl.autoNext, "Auto-call next wave", 7.dp, { ctl.toggleAutoNext() }) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            val c = if (ctl.autoNext) Ink.accentInk else Ink.inkDim
            T("Auto", Face.body(13, W.Heavy), c)
            T(if (ctl.autoNext) "on" else "off", Face.body(10, W.Bold), c.copy(alpha = 0.85f))
        }
    }
}

/* ------------------------------------------------------------------ Wren */

@Composable
private fun HeroCard(ctl: BattleController) {
    val b = ctl.battle; val hero = b.hero
    Column(
        Modifier.alpha(if (hero.dead) 0.7f else 1f).width(196.dp).paperCard(Ink.paperGlass).padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.padding(0.dp).size(34.dp).clickable(role = Role.Button) { ctl.toggleLeash() }.semantics { contentDescription = "Toggle Wren leash ring" },
            ) {
                Box(Modifier.size(34.dp).clip(CircleShape).background(if (ctl.showLeash) Ink.accent else Ink.ink)) { ArtPicture("icon-hero", 34.dp) }
                Box(
                    Modifier.offset(20.dp, 20.dp).size(18.dp).clip(CircleShape).background(if (ctl.levelFlash) Ink.accent else Ink.ink),
                    contentAlignment = Alignment.Center,
                ) { T("${hero.level}", Face.body(11, W.Heavy), Ink.paper, maxLines = 1) }
            }
            T("Wren", Face.body(15, W.Heavy))
            if (hero.points > 0) T("${hero.points} pt${if (hero.points > 1) "s" else ""}", Face.body(12, W.Heavy), Ink.accent, maxLines = 1)
            else if (hero.dead) T("Back in ${ceil(hero.respawnT).toInt()}", Face.body(12, W.Bold), Ink.inkDim, maxLines = 1)
        }
        Meter(hero.hp / b.heroMaxHp(), Ink.good, 5.dp)
        Meter(if (hero.level >= 16) 1.0 else hero.xp / b.xpNeeded(), Ink.gold.copy(alpha = 0.85f), 3.dp)
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
            for (i in 0 until ctl.data.itemSlots) {
                val id = hero.items.getOrNull(i)
                val shape = RoundedCornerShape(3.dp)
                Box(
                    Modifier.size(22.dp).clip(shape).background(if (id == null) Ink.paper2 else Ink.paper).border(1.dp, if (id == null) Ink.rule else Ink.inkDim, shape),
                    contentAlignment = Alignment.Center,
                ) {
                    if (id != null) T(ctl.data.item(id).name.split(" ").joinToString("") { it.take(1) }, Face.body(10, W.Heavy), maxLines = 1)
                }
            }
            PaperButton({ ctl.shopOpen = !ctl.shopOpen }, kind = if (b.nearGate()) Kind.Primary else Kind.Plain) { fg ->
                T("Shop", Face.body(13, W.Bold), fg, maxLines = 1)
            }
        }
    }
}

/* ------------------------------------------------------------------ skills */

@Composable
private fun SkillsView(ctl: BattleController, columns: Boolean) {
    val keys = listOf(SkillKey.q, SkillKey.w, SkillKey.e, SkillKey.r)
    if (columns) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            for (row in keys.chunked(2)) Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { for (k in row) SkillButton(ctl, k) }
        }
    } else {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { for (k in keys) SkillButton(ctl, k) }
    }
}

@Composable
private fun SkillButton(ctl: BattleController, key: SkillKey) {
    val b = ctl.battle; val hero = b.hero; val s = ctl.data.skill(key); val r = hero.rank(key)
    val locked = (key == SkillKey.w && !b.mods.skillW) || (key == SkillKey.r && !b.mods.skillR)
    val req = if (locked) "Clear stage ${if (key == SkillKey.w) 1 else 7}" else if (r == 0 && hero.level < s.needLevel[0]) "Level ${s.needLevel[0]}" else ""
    val ready = b.skillReady(key); val canLearn = b.canLearn(key)
    val cd = if (r > 0 && key != SkillKey.e) (hero.cooldown(key) / s.cd[r - 1]).coerceIn(0.0, 1.0) else 0.0
    val aiming = key == SkillKey.w && ctl.aimingW
    val shape = RoundedCornerShape(7.dp)
    Box(Modifier.size(58.dp)) {
        Box(
            Modifier.alpha(if (locked) 0.55f else 1f).size(58.dp).clip(shape).background(if (aiming) Ink.paper2 else Ink.paperGlass)
                .border(if (canLearn || aiming) 2.dp else 1.dp, if (canLearn) Ink.accent else if (aiming) Ink.ink else Ink.ruleStrong, shape)
                .clickable(role = Role.Button) { ctl.skillPress(key) }
                .semantics { contentDescription = "${s.name}. ${s.desc}" },
        ) {
            Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Box(Modifier.height(24.dp), contentAlignment = Alignment.Center) {
                    ArtIcon(if (locked) "lock" else "skill-${key.name}", 22.dp, if (r == 0) Ink.inkFaint else if (ready) Ink.ink else Ink.inkDim)
                }
                T(s.name.split(" ").last(), Face.body(11, W.Bold), maxLines = 1)
                if (req.isNotEmpty()) T(req, Face.body(9, W.Bold), Ink.inkFaint, maxLines = 1)
                else Row(Modifier.height(9.dp), horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.CenterVertically) {
                    for (i in 0 until s.maxRank) Box(Modifier.size(6.dp, 3.dp).clip(CircleShape).background(if (i < r) Ink.ink else Ink.rule))
                }
            }
            // The cooldown drains from the top as a shade.
            if (cd > 0) Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().fillMaxHeight(cd.toFloat()).background(Ink.ink.copy(alpha = 0.22f)))
        }
        if (canLearn) {
            // A learn button of its own, so tapping + spends the point even when the skill is ready. The disc is 24 dp; its target is 44.
            Box(
                Modifier.offset(30.dp, (-30).dp).size(44.dp).clickable(role = Role.Button) { ctl.learnSkill(key) }.semantics { contentDescription = "Learn ${s.name}" },
                contentAlignment = Alignment.Center,
            ) {
                Box(Modifier.size(24.dp).clip(CircleShape).background(Ink.accent), contentAlignment = Alignment.Center) { T("+", Face.body(13, W.Heavy), Ink.accentInk) }
            }
        }
    }
}

/* ------------------------------------------------------------------ next wave and the call button */

@Composable
private fun CallView(ctl: BattleController, compact: Boolean) {
    val b = ctl.battle
    val canCall = !b.over && (b.status == Status.prep || (b.nextIn != null && b.wave < b.totalWaves))
    Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        val nw = if (b.over) null else b.nextWave()
        if (nw != null && (b.status == Status.prep || b.nextIn != null)) {
            val lean = b.adaptLean(); val adapts = b.adaptsAt(nw.n)
            Column(Modifier.paperCard(Ink.paperGlass).padding(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                T("Next: wave ${nw.n} of ${b.totalWaves}", Face.body(12, W.Heavy), Ink.inkDim, maxLines = 1)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    for ((kind, count) in nw.foes) {
                        Row(horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.CenterVertically) {
                            ArtPicture("icon-foe-${kind.name}", 22.dp)
                            T("$count", Face.body(13, W.Heavy))
                            if (ctl.data.enemy(kind).isFlying) ArtIcon("wing", 12.dp, Ink.inkDim)
                            if (ctl.isNewFoe(kind)) Tag("New")
                        }
                    }
                }
                if (nw.openingRoads.isNotEmpty()) {
                    val opening = nw.openingRoads.size
                    T(if (opening == 1) "A new road opens next wave" else "$opening new roads open next wave", Face.body(11, W.Heavy), Ink.accent, maxLines = 1)
                }
                if (adapts) {
                    val text = if (compact) lean?.let { "Adapts: ${Words.element[it] ?: ""}" } ?: "Adapts"
                    else lean?.let { "The Hollow adapts this wave, against your ${Words.element[it] ?: ""}." } ?: "The Hollow adapts this wave."
                    T(text, Face.body(11, W.Bold), Ink.hollow, maxLines = 1)
                }
            }
        }
        if (canCall) {
            PaperButton({ ctl.callWave() }, Modifier.widthIn(min = 130.dp), Kind.Primary) { fg ->
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    T(if (b.status == Status.prep) "Start" else "Wave ${b.wave + 1} in ${ceil(b.nextIn ?: 0.0).toInt()}s", Face.body(16, W.Heavy), fg, maxLines = 1)
                    T(if (b.status == Status.prep) "Call the first wave" else "Call now: +${b.earlyBonus} gold", Face.body(11, W.SemiBold), fg.copy(alpha = 0.9f), maxLines = 1)
                }
            }
        }
    }
}

/* ------------------------------------------------------------------ banners and cards */

@Composable
private fun BannerView(item: BattleController.BannerItem) {
    Column(
        Modifier.widthIn(max = 440.dp).paperCard(Ink.paperGlass).topInkBar(2.dp).padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        T(item.title, Face.title(18), maxLines = 1, align = TextAlign.Center)
        if (item.sub.isNotEmpty()) T(item.sub, Face.body(13, W.SemiBold), Ink.inkDim, maxLines = 2, align = TextAlign.Center)
    }
}

private fun Modifier.topInkBar(h: Dp): Modifier = this.drawWithContent {
    drawContent()
    drawRect(Ink.ink, Offset.Zero, androidx.compose.ui.geometry.Size(size.width, h.toPx()))
}

/** The build menu on a plot, or the tower menu: upgrade, split, aim, rounds and sell. */
@Composable
private fun MenuCard(ctl: BattleController, menu: BattleController.Menu, toView: (Double, Double) -> Offset, map: Box2, w: Float, h: Float) {
    val b = ctl.battle
    val density = LocalDensity.current
    var cw by remember { mutableStateOf(300f) }
    var ch by remember { mutableStateOf(200f) }
    val anchor = when (menu) {
        is BattleController.Menu.Plot -> toView(b.plots[menu.i].x, b.plots[menu.i].y)
        is BattleController.Menu.TowerMenu -> { val t = b.tower(menu.id); toView(t?.x ?: 0.0, (t?.y ?: 0.0) - 90) }
    }
    // Keep to the map when it fits, above the spot, or below it when there is no room.
    val fits = cw <= map.w - 16
    val minL = if (fits) map.x + 8 else 8f
    val maxL = if (fits) map.maxX - cw - 8 else w - cw - 8
    var top = anchor.y - ch - 40
    if (top < map.y + 52) top = anchor.y + 34
    top = min(top, max(map.y + 52, min(h, map.maxY) - ch - 8))
    val left = max(minL, min(maxL, anchor.x - cw / 2))
    Column(
        Modifier.offset(left.dp, max(4f, top).dp)
            .onSizeChanged { with(density) { cw = it.width.toDp().value; ch = it.height.toDp().value } }
            .widthIn(max = min(520f, map.w - 16).dp)
            .softShadow()
            .paperCard()
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        when (menu) {
            is BattleController.Menu.Plot -> PlotMenu(ctl, menu.i)
            is BattleController.Menu.TowerMenu -> b.tower(menu.id)?.let { TowerMenu(ctl, it) }
        }
    }
}

@Composable
private fun PlotMenu(ctl: BattleController, pi: Int) {
    val b = ctl.battle; val p = b.plots[pi]
    val rb = p.rubble
    if (!p.unlocked) {
        T("Submerged plot", Face.body(15, W.Heavy))
        T("Opens cleanly on Wave ${b.stage.plots[pi].openAtWave ?: 5} once terrain shifts.", Face.body(12), Ink.inkDim, Modifier.widthIn(max = 320.dp))
    } else if (rb != null) {
        T("${rb.kind.name.replaceFirstChar { it.uppercase() }} obstacle", Face.body(15, W.Heavy))
        val hold = rb.holdSec
        val note = if (hold != null) "Clear now for ${rb.cost}g, or stand Wren beside it for ${hold.toInt()}s once the first wave is called to salvage it free."
        else "Pay ${rb.cost}g to clear this plot."
        T(note, Face.body(12), Ink.inkDim, Modifier.widthIn(max = 320.dp))
        val can = b.canClearPlot(pi)
        PaperButton({ ctl.act { if (b.clearPlot(pi)) ctl.closeMenu() } }, kind = Kind.Primary, poor = !can, tall = true, enabled = can) { fg ->
            T("Clear plot", Face.body(15, W.Heavy), fg); Price(rb.cost, 13, fg)
        }
    } else {
        val perks = listOfNotNull(if (p.high) "+20% high ground" else null, if (b.mods.tidePearl && p.nearWater) "+15% Tide-pearl" else null).joinToString(", ")
        val title = if (p.gear != null) "Build on a ${if (p.gear == SplitId.a) "gold" else "iron"} gear plot${if (perks.isEmpty()) "" else " ($perks)"}"
        else if (perks.isEmpty()) "Build a tower" else "Build a tower ($perks range)"
        T(title, Face.body(15, W.Heavy))
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            for (row in b.stage.towers.chunked(3)) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    for (k in row) BuildButton(ctl, pi, k)
                }
            }
        }
        ctl.armed?.let { k ->
            val d = ctl.data.tower(k)
            T("${d.name}: ${d.blurb}${if (d.hitsFlying) "" else " Cannot hit fliers."}", Face.body(12), Ink.inkDim, Modifier.widthIn(max = 320.dp))
        }
    }
}

@Composable
private fun BuildButton(ctl: BattleController, pi: Int, k: TowerKind) {
    val b = ctl.battle; val def = ctl.data.tower(k); val cost = b.costOf(k); val ok = b.canBuild(pi, k); val armed = ctl.armed == k
    val shape = RoundedCornerShape(5.dp)
    Column(
        Modifier.alpha(if (ok) 1f else 0.5f).width(96.dp).clip(shape).background(if (armed) Ink.paper2 else Ink.paper)
            .border(if (armed) 2.dp else 1.dp, if (armed) Ink.accent else Ink.rule, shape)
            .clickable(role = Role.Button) { ctl.pickBuild(k) }
            .padding(vertical = 6.dp, horizontal = 2.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        ArtPicture("icon-tower-${k.name}", 40.dp)
        T(def.name, Face.body(12, W.Heavy), maxLines = 1)
        Box(Modifier.height(24.dp), contentAlignment = Alignment.Center) {
            T(Words.role[k] ?: "", Face.body(9, W.SemiBold), Ink.inkDim, maxLines = 2, align = TextAlign.Center)
        }
        if (armed) T("Tap again to build", Face.body(10, W.Heavy), Ink.accent, maxLines = 1) else Price(cost, 13)
    }
}

@Composable
private fun TowerMenu(ctl: BattleController, t: com.njarrar.towerriot.engine.Tower) {
    val b = ctl.battle; val def = ctl.data.tower(t.kind); val s = b.stats(t)
    val spDef = t.split?.let { sp -> def.splits.firstOrNull { it.id == sp } }
    val title = if (spDef != null) { if (t.lv >= b.data.maxTowerLevel) "${spDef.masteryName} · Mastery (Lv ${t.lv})" else spDef.name } else "${def.name} · Lv ${t.lv}"
    Row(Modifier.widthIn(max = 496.dp), verticalAlignment = Alignment.CenterVertically) {
        T(title, Face.body(15, W.Heavy), maxLines = 1, modifier = Modifier.weight(1f, fill = false))
        Spacer(Modifier.width(8.dp))
        T("${Math.round(t.dmgDealt)} dmg · ${t.kills} kills", Face.body(11, W.Bold), Ink.inkFaint, maxLines = 1)
    }
    val facts = when (t.kind) {
        TowerKind.beacon -> "Range ${Math.round(s.range)}. Lights hidden foes and boosts towers in its light."
        TowerKind.bell -> "Slows all foes in range. Range ${Math.round(s.range)}."
        else -> "Damage ${Math.round(s.dmg)}, ${String.format(java.util.Locale.US, "%.1f", 1 / s.rate)}/s, range ${Math.round(s.range)}."
    }
    T(if (t.down) "This gear plot is lowered: the tower sleeps this wave." else facts, Face.body(12), Ink.inkDim, Modifier.widthIn(max = 360.dp))
    if (s.buffs.isNotEmpty()) {
        Row(Modifier.widthIn(max = 360.dp).horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            for (bf in s.buffs) {
                Box(Modifier.clip(CircleShape).background(Ink.paper2).border(1.dp, Ink.rule, CircleShape).padding(horizontal = 6.dp, vertical = 2.dp)) {
                    T(bf, Face.body(10, W.Bold), maxLines = 1)
                }
            }
        }
    }
    val rs = b.resist(def.element)
    if (rs > 0) {
        Row(Modifier.widthIn(max = 360.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            ArtIcon("el-${def.element.name}", 14.dp, Ink.hollow)
            T("The Hollow takes ${Math.round(rs * 100)}% less ${Words.element[def.element] ?: ""} damage right now. Mix in other towers.", Face.body(12, W.Bold), Ink.hollow)
        }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        val up = b.upgradeCost(t)
        if (up != null) {
            val n = b.stats(t, t.lv + 1)
            val isMastery = t.split != null && t.lv == 4
            val upLabel = if (isMastery) spDef?.masteryName ?: "Split Mastery" else "Level ${t.lv + 1}"
            val gain = if (isMastery) spDef?.masteryDesc ?: "Split Mastery"
            else if (t.kind == TowerKind.beacon || t.kind == TowerKind.bell) "Range ${Math.round(s.range)} to ${Math.round(n.range)}"
            else "Damage ${Math.round(s.dmg)} to ${Math.round(n.dmg)}, range ${Math.round(s.range)} to ${Math.round(n.range)}"
            PaperButton({ ctl.act { b.upgrade(t.id) } }, Modifier.widthIn(max = 200.dp), Kind.Primary, poor = b.gold < up) { fg ->
                Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) { T(upLabel, Face.body(15, W.Heavy), fg, maxLines = 1); Price(up, 14, fg) }
                    T(gain, Face.body(10, W.SemiBold), fg.copy(alpha = 0.9f), maxLines = 2)
                }
            }
        }
        if (t.lv == 3 && b.mods.splits) {
            for (sp in def.splits) {
                val c = b.splitCost(t.kind, sp.id)
                PaperButton({ ctl.act { b.splitTower(t.id, sp.id) } }, poor = b.gold < c) { fg ->
                    Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) { T(sp.name, Face.body(15, W.Bold), fg, maxLines = 1); Price(c, 13, fg) }
                        T(sp.desc, Face.body(10, W.SemiBold), Ink.inkDim, Modifier.widthIn(max = 150.dp), maxLines = 2)
                    }
                }
            }
        } else if (t.lv == 3) {
            T("Level 4 splits open after Storm Shelf.", Face.body(12), Ink.inkDim)
        }
    }
    if (t.kind != TowerKind.beacon && t.kind != TowerKind.bell) {
        T("Target", Face.body(11, W.Bold), Ink.inkFaint)
        Segments(Words.mode, t.mode) { md -> ctl.setMode(t, md) }
        if (b.mods.rounds.isNotEmpty()) {
            T("Rounds", Face.body(11, W.Bold), Ink.inkFaint)
            val items: List<Pair<Rounds?, String>> = listOf<Pair<Rounds?, String>>(null to "Plain") + b.mods.rounds.map { it to (Words.round[it] ?: it.name) }
            Segments(items, t.round) { v -> ctl.setRound(t, v) }
        }
    }
    // Two taps to sell, so fast play never scraps a tower by accident.
    val sellArmed = ctl.sellArmedId == t.id
    Row(
        Modifier.defaultMinSize(minHeight = 44.dp).clickable(role = Role.Button) { ctl.sellOrArm(t.id) },
        horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically,
    ) {
        val c = if (sellArmed) Ink.accent else Ink.inkDim
        T(if (sellArmed) "Tap again to sell for" else "Sell for", Face.body(13, W.Bold).copy(textDecoration = TextDecoration.Underline), c)
        Price(b.sellValue(t), 13, c)
    }
}

@Composable
private fun ShopView(ctl: BattleController) {
    val b = ctl.battle; val near = b.nearGate(); val canShop = b.canShop()
    val freeCourier = near || b.status == Status.prep || (b.nextIn != null && b.foes.isEmpty())
    Column(Modifier.softShadow().paperCard().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            T("The gate shop", Face.body(16, W.Heavy), modifier = Modifier.weight(1f))
            Box(Modifier.size(44.dp).clickable(role = Role.Button) { ctl.shopOpen = false }.semantics { contentDescription = "Close" }, contentAlignment = Alignment.Center) {
                GlyphIcon(Glyph.Close, 14.dp, Ink.ink)
            }
        }
        if (canShop) {
            val whereText = if (freeCourier) "Gate / between-wave rate (base price)." else "Field courier delivery (+20% away from Gate)."
            T("$whereText ${b.hero.items.size} of ${ctl.data.itemSlots} bag slots used.", Face.body(12), Ink.inkDim)
        } else T("Wren must be alive to equip gear.", Face.body(12), Ink.inkDim)
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            for (id in ctl.data.itemOrder.filter { ctl.data.item(it).after <= b.mods.shopAfter }) {
                val it = ctl.data.item(id); val owned = id in b.hero.items; val price = b.itemCost(id)
                val shape = RoundedCornerShape(5.dp)
                Row(Modifier.fillMaxWidth().clip(shape).background(if (owned) Ink.paper2 else Ink.paper).border(1.dp, Ink.rule, shape).padding(8.dp), verticalAlignment = Alignment.Top) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        T(it.name, Face.body(14, W.Heavy))
                        T(it.desc, Face.body(11), Ink.inkDim)
                    }
                    Spacer(Modifier.width(6.dp))
                    if (owned) {
                        PaperButton({ ctl.act { b.sellItem(id) } }, poor = !canShop, enabled = canShop) { fg -> T("Sell", Face.body(13, W.Bold), fg); Price((it.cost / 2).toInt(), 12, fg) }
                    } else {
                        val can = b.canBuy(id)
                        PaperButton({ ctl.act { b.buy(id) } }, kind = if (can) Kind.Primary else Kind.Plain, poor = !can, enabled = canShop) { fg -> Price(price, 13, fg) }
                    }
                }
            }
        }
    }
}

@Composable
private fun Veil(tapOut: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Box(Modifier.fillMaxSize().background(Ink.scrim).clickable(remember { MutableInteractionSource() }, null) { tapOut?.invoke() })
        Column(
            Modifier.padding(16.dp).widthIn(max = 440.dp).softShadow(20.dp, RoundedCornerShape(9.dp)).paperCard(radius = 9.dp).topInkBar(3.dp)
                .verticalScroll(rememberScrollState()).padding(20.dp),
            content = content,
        )
    }
}

/** The pause strip: lets the player look over towers, switches and rubble with nothing in the way. */
@Composable
private fun PauseStrip(ctl: BattleController) {
    val upright = LocalUpright.current
    Row(
        Modifier.softShadow(12.dp).paperCard(Ink.paperGlass).padding(horizontal = 12.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically,
    ) {
        T(if (upright) "Paused" else "Paused. Inspect towers & lanes", Face.body(13, W.Heavy), maxLines = 1)
        PaperButton("Resume", { ctl.togglePause() }, kind = Kind.Primary, tall = true)
        PaperButton({ ctl.requestExit() }, tall = true) { fg -> ArtIcon("leave", 15.dp, fg); T("Leave", Face.body(15, W.Bold), fg) }
        // Upright, sound lives here: the strip on top has no room for it.
        if (upright) IconBtn(if (ctl.soundOn) "sound" else "mute", if (ctl.soundOn) "Mute sound" else "Turn sound on", dim = !ctl.soundOn) { ctl.toggleSound() }
    }
}

/** An in-game card rather than a system dialog. */
@Composable
private fun ExitCard(ctl: BattleController) {
    Veil({ ctl.keepFighting() }) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            T("Leave this battle?", Face.title(22))
            T("You lose your progress in this stage. Stars you already hold stay.", Face.body(15), Ink.inkDim)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PaperButton("Keep fighting", { ctl.keepFighting() }, kind = Kind.Primary)
                PaperButton("Leave", { ctl.exit() })
            }
        }
    }
}

@Composable
private fun ResultCard(ctl: BattleController, r: BattleController.ResultInfo) {
    val b = ctl.battle; val st = b.stage
    var shown by remember { mutableIntStateOf(0) }
    LaunchedEffect(r) {
        // Stars come in one at a time, once.
        for (i in 0 until r.stars) { delay(260); shown = i + 1 }
    }
    Veil {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            T(if (r.won) "The Keep holds" else "The gate falls", Face.title(28, heavy = true), align = TextAlign.Center)
            if (r.won) Stars(shown, 40)
            T(r.text, Face.body(15), Ink.inkDim, align = TextAlign.Center)
            r.nextStar?.let { T(it, Face.body(13, W.SemiBold), Ink.inkFaint, align = TextAlign.Center) }
            r.cause?.let { (kind, lives) ->
                val d = ctl.data.enemy(kind)
                Row(Modifier.clip(RoundedCornerShape(5.dp)).background(Ink.paper2).padding(10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    ArtPicture("icon-foe-${kind.name}", 48.dp)
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        T("${d.name}${if (lives > 1 && !d.isBoss) "s" else ""} took $lives of your ${b.startLives} lives", Face.body(14, W.Heavy))
                        T("${d.blurb} Answer: ${d.answer}", Face.body(12), Ink.inkDim)
                    }
                }
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(Modifier.fillMaxWidth().height(6.dp).clip(CircleShape), horizontalArrangement = Arrangement.spacedBy(1.dp)) {
                    if (r.bdTowersPct > 0) Box(Modifier.weight(r.bdTowersPct.toFloat()).fillMaxHeight().background(Ink.accent))
                    if (r.bdHeroPct > 0) Box(Modifier.weight(r.bdHeroPct.toFloat()).fillMaxHeight().background(Ink.good))
                    Box(Modifier.weight(max(1, r.bdStatusPct).toFloat()).fillMaxHeight().background(Ink.gold))
                }
                T("Towers ${r.bdTowersPct}% · Wren ${r.bdHeroPct}%${r.mvpText?.let { " · $it" } ?: ""}", Face.body(11, W.Bold), Ink.inkDim, align = TextAlign.Center)
            }
            if (r.won && r.embers > 0) T("+${r.embers} Embers for the skill trees", Face.body(14, W.Heavy), Ink.accent)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PaperButton(if (r.won) "Play again" else "Try again", { ctl.retry() }, kind = if (r.won) Kind.Plain else Kind.Primary)
                if (r.won && st.id < 20 && ctl.variant != StageVariant.alt) PaperButton("Next stage", { ctl.next() }, kind = Kind.Primary)
                PaperButton("Map", { ctl.exit() })
            }
        }
    }
}
