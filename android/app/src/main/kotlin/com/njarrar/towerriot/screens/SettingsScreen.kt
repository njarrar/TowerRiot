package com.njarrar.towerriot.screens

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.njarrar.towerriot.AppModel
import com.njarrar.towerriot.ui.Face
import com.njarrar.towerriot.ui.Glyph
import com.njarrar.towerriot.ui.GlyphIcon
import com.njarrar.towerriot.ui.Ink
import com.njarrar.towerriot.ui.Kind
import com.njarrar.towerriot.ui.PaperButton
import com.njarrar.towerriot.ui.T
import com.njarrar.towerriot.ui.TopBar
import com.njarrar.towerriot.ui.W
import com.njarrar.towerriot.ui.paperCard

@Composable
fun SettingsScreen(app: AppModel) {
    var askErase by remember { mutableStateOf(false) }
    val st = app.save.settings
    Column(Modifier.fillMaxSize().safeDrawingPadding().padding(16.dp)) {
        TopBar("Settings", { app.screen = AppModel.Screen.Title })
        Box(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()), contentAlignment = Alignment.TopCenter) {
            Column(Modifier.widthIn(max = 620.dp).fillMaxWidth().paperCard(radius = 9.dp).padding(18.dp)) {
                Toggle2("Sound", "Tower fire, hits and Wren. Mute it any time with the speaker button.", st.sound) { v -> app.setSetting { it.sound = v } }
                Toggle2("Calm motion", "No screen shake, screen flash, rain or crows. The lighthouse beam and breach warnings hold still.", st.reduceMotion) { v -> app.setSetting { it.reduceMotion = v } }
                // Auto skills starts unset: on for the first region, then off. Showing it ticked matches what a new player gets first.
                Toggle2("Auto skill points", "Automatically spend Wren skill points on level up (default in Mosslight Vale).", st.autoSkills ?: true) { v -> app.setSetting { it.autoSkills = v } }
                Toggle2("Damage numbers", "Show the damage of big hits over foes.", st.dmgNumbers) { v -> app.setSetting { it.dmgNumbers = v } }
                Toggle2("Tap ground moves Wren (touch)", "Allow single ground taps to pin Wren (dragging Wren always works).", st.tapGroundMove) { v -> app.setSetting { it.tapGroundMove = v } }
                Toggle2("Tap-to-aim W (accessibility)", "Aim Lantern Snare with two taps instead of touch drag-and-release.", st.tapAimW) { v -> app.setSetting { it.tapAimW = v } }
                Toggle2("Auto-call next wave", "Start the next wave automatically when the field is clear.", st.autoNext) { v -> app.setSetting { it.autoNext = v } }
                Toggle2("Left-handed HUD", "Mirror the battle HUD controls to the left side for left-thumb reach.", st.leftHandHud) { v -> app.setSetting { it.leftHandHud = v } }
                T("How to play", Face.body(17, W.Heavy), modifier = Modifier.padding(top = 18.dp, bottom = 6.dp))
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    for (line in listOf(
                        "Tap a stone plot to build (3x2 tower deck), clear rubble, or tap a switch lever to redirect roads/brakes.",
                        "Holding the phone upright? Drag the map left and right. Red notches at its edges point to foes out of view.",
                        "Drag Wren to pin her anywhere along the road (she fights inside a 90 px leash while holding 2 foes).",
                        "Wren gains XP and gold (+50% on last hits). Clear adjacent rubble free by standing Wren beside it.",
                        "Shop free at the Gate or between waves, or via +20% field courier during combat. Grab runes before they fade.",
                    )) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            T("•", Face.body(14), Ink.inkDim)
                            T(line, Face.body(14), Ink.inkDim)
                        }
                    }
                }
                // Two steps on the page itself, not a system dialog.
                Column(Modifier.padding(top = 18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (askErase) {
                        T("Erase all stars and tree picks? This cannot be undone.", Face.body(14, W.SemiBold))
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            PaperButton("Erase", { app.eraseProgress() }, kind = Kind.DangerSolid)
                            PaperButton("Cancel", { askErase = false })
                        }
                    } else {
                        PaperButton("Erase progress", { askErase = true }, kind = Kind.Danger)
                    }
                }
            }
        }
    }
}

/** A setting with a short note under it, ticked with the rust accent. */
@Composable
private fun Toggle2(label: String, note: String, on: Boolean, set: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth()
            .semantics { selected = on }
            .clickable(role = Role.Checkbox) { set(!on) }
            .drawBehind { drawLine(Ink.rule, Offset(0f, size.height - 0.5f), Offset(size.width, size.height - 0.5f), 1.dp.toPx()) }
            .padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        val shape = RoundedCornerShape(4.dp)
        Box(
            Modifier.size(22.dp).clip(shape).background(if (on) Ink.accent else Ink.paper).border(1.5.dp, if (on) Ink.accentLo else Ink.ruleStrong, shape),
            contentAlignment = Alignment.Center,
        ) { if (on) GlyphIcon(Glyph.Check, 14.dp, Ink.accentInk) }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            T(label, Face.body(15, W.Heavy))
            T(note, Face.body(13), Ink.inkFaint)
        }
    }
}
