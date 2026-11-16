package com.njarrar.towerriot.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.njarrar.towerriot.AppModel
import com.njarrar.towerriot.battle.BattleRenderer
import com.njarrar.towerriot.engine.Battle
import com.njarrar.towerriot.engine.World
import com.njarrar.towerriot.ui.Face
import com.njarrar.towerriot.ui.Glyph
import com.njarrar.towerriot.ui.GlyphIcon
import com.njarrar.towerriot.ui.IconBtn
import com.njarrar.towerriot.ui.Ink
import com.njarrar.towerriot.ui.Kind
import com.njarrar.towerriot.ui.LocalUpright
import com.njarrar.towerriot.ui.PaperButton
import com.njarrar.towerriot.ui.T
import com.njarrar.towerriot.ui.softShadow
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlin.math.max
import kotlin.math.min

/** Title: a still frame of a real fight on the next stage fills the screen; the menu sits on paper over its left side. */
@Composable
fun TitleScreen(app: AppModel) {
    val upright = LocalUpright.current
    var scene by remember { mutableStateOf<BattleRenderer?>(null) }
    var showGuide by remember { mutableStateOf(false) }
    val c = app.save.cleared; val next = app.nextStage
    val altTotal = app.save.totalAltStars
    LaunchedEffect(Unit) {
        delay(30)
        scene = withContext(Dispatchers.Default) { paintMap(app) }
    }
    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Ink.skyTop, Ink.skyLow)))) {
        AnimatedVisibility(scene != null, enter = fadeIn(tween(400))) {
            val s = scene
            Canvas(Modifier.fillMaxSize()) {
                if (s == null) return@Canvas
                // Fill the screen, cropping the map's edges as needed.
                val k = max(size.width / World.width.toFloat(), size.height / World.height.toFloat())
                drawIntoCanvas { cv ->
                    val nc = cv.nativeCanvas
                    nc.save()
                    nc.translate((size.width - World.width.toFloat() * k) / 2, (size.height - World.height.toFloat() * k) / 2)
                    nc.scale(k, k)
                    s.draw(nc)
                    nc.restore()
                }
            }
        }
        Row(Modifier.fillMaxSize().safeDrawingPadding(), verticalAlignment = Alignment.CenterVertically) {
            Column(
                Modifier.padding(start = if (upright) 16.dp else 40.dp, end = if (upright) 16.dp else 0.dp)
                    .softShadow(20.dp, RoundedCornerShape(3.dp))
                    .clip(RoundedCornerShape(3.dp))
                    .background(Ink.paper)
                    .border(1.dp, Ink.ruleStrong, RoundedCornerShape(3.dp))
                    .drawWithContent { drawContent(); drawRect(Ink.ink, Offset.Zero, Size(size.width, 3.dp.toPx())) }
                    .padding(24.dp),
            ) {
                T("TowerRiot", Face.title(if (upright) 44 else 54, heavy = true), maxLines = 1)
                androidx.compose.foundation.layout.Box(Modifier.padding(top = 4.dp).width(48.dp).height(4.dp).background(Ink.accent))
                T(
                    "Hold the Lantern Keep. Build towers, raise Wren from level 1 to 16 in every fight, and outthink a Hollow that learns.",
                    Face.body(16), Ink.inkDim, Modifier.widthIn(max = 340.dp).padding(vertical = 14.dp),
                )
                val play = if (c > 0) "Continue: stage $next" else "Play"
                if (upright) {
                    // Too narrow for three buttons in a row: Continue takes the width, two share the next row,
                    // and Settings is the gear in the corner.
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        PaperButton(play, { app.screen = AppModel.Screen.Campaign(null) }, Modifier.fillMaxWidth(), Kind.Primary, big = true)
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            PaperButton("Skill trees", { app.screen = AppModel.Screen.Trees }, Modifier.weight(1f), big = true)
                            PaperButton("Field guide", { showGuide = true }, Modifier.weight(1f), big = true)
                        }
                    }
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        PaperButton(play, { app.screen = AppModel.Screen.Campaign(null) }, kind = Kind.Primary, big = true)
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            PaperButton("Skill trees", { app.screen = AppModel.Screen.Trees }, big = true)
                            PaperButton("Field guide", { showGuide = true }, big = true)
                            PaperButton("Settings", { app.screen = AppModel.Screen.Settings }, big = true)
                        }
                    }
                }
                T("${app.save.totalStars} of 60 stars won${if (altTotal > 0) " · $altTotal Variant B" else ""}", Face.body(13), Ink.inkFaint, Modifier.padding(top = 12.dp))
            }
        }
        Row(Modifier.align(Alignment.TopEnd).safeDrawingPadding().padding(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (upright) SettingsCorner(app)
            SoundCorner(app)
        }
    }
    if (showGuide) FieldGuideSheet(app) { showGuide = false }
}

/** A still frame of a real fight: a few towers, Wren and the first foes on the road. */
private fun paintMap(app: AppModel): BattleRenderer {
    var st = app.data.stage(app.nextStage)
    // Rain, night and lava stages make a murky backdrop; show the first stage of that region instead.
    if (st.weather != null || st.night == true || st.isLava) st = app.data.stages.firstOrNull { it.region == st.region } ?: st
    val b = Battle(st, app.save.mods, 7)
    b.setGold(99999)
    for (i in 0 until min(4, b.plots.size)) b.build(i, st.towers[i % st.towers.size])
    b.setGold(0)
    b.callWave()
    for (i in 0 until 260) { if (b.over) break; b.step(0.05) }
    val s = BattleRenderer(b)
    s.look.still = true
    s.look.reduceMotion = true
    s.still()
    return s
}

/** The speaker in a menu corner: struck through when muted. */
@Composable
fun SoundCorner(app: AppModel) {
    val on = app.save.settings.sound
    IconBtn(if (on) "sound" else "mute", if (on) "Mute sound" else "Turn sound on", dim = !on) { app.toggleSound() }
}

/** The gear in a menu corner: opens Settings when the menu has no room for a Settings button. */
@Composable
fun SettingsCorner(app: AppModel) {
    val shape = RoundedCornerShape(5.dp)
    Box(
        Modifier.size(44.dp).clip(shape).background(Ink.paperGlass).border(1.dp, Ink.ruleStrong, shape)
            .clickable(role = Role.Button) { app.screen = AppModel.Screen.Settings }.semantics { contentDescription = "Settings" },
        contentAlignment = Alignment.Center,
    ) { GlyphIcon(Glyph.Gear, 20.dp, Ink.ink) }
}
