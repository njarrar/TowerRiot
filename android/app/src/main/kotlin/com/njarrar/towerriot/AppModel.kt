package com.njarrar.towerriot

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.SnapshotStateList
import com.njarrar.towerriot.engine.GameData
import com.njarrar.towerriot.engine.OathId
import com.njarrar.towerriot.engine.Save
import com.njarrar.towerriot.engine.StageVariant
import com.njarrar.towerriot.engine.starLives
import com.njarrar.towerriot.sound.Sound
import java.io.File
import kotlin.math.min

/** Screens and flow: title, campaign map, skill trees, settings and the battle. A port of src/ui/app.ts. */
class AppModel(context: Context) {
    sealed class Screen {
        data object Title : Screen()
        data class Campaign(val focus: Int?) : Screen()
        data object Trees : Screen()
        data object Settings : Screen()
        data class Battle(val id: Int, val variant: StageVariant, val oaths: List<OathId>, val run: Int) : Screen()
    }

    var screen by mutableStateOf<Screen>(Screen.Title)
    var treeTab by mutableIntStateOf(0)
    val variantByStage = mutableStateMapOf<Int, StageVariant>()
    val selectedOaths = SnapshotStateList<OathId>()
    private var battleRun = 0
    val sound = Sound()
    val data = GameData.shared
    private val file = File(context.filesDir, "save.json")
    private val _save: Save = Save.load(file)
    /** Bumped on every change to the save, so screens that read it redraw. */
    private var rev by mutableIntStateOf(0)
    val save: Save get() { rev; return _save }

    init { sound.enabled = _save.settings.sound }

    /** Set by the battle screen: pauses a running fight when the app leaves the screen. */
    var backgroundHook: (() -> Unit)? = null
    fun onBackground() { backgroundHook?.invoke() }

    private fun persist() { Save.write(_save, file); rev += 1 }

    /** Sound on or off, from any screen. The choice lives in the save, so it holds next time. */
    fun toggleSound(): Boolean {
        _save.settings.sound = !_save.settings.sound
        applySettings()
        if (_save.settings.sound) sound.play(Sound.Sfx.click)
        return _save.settings.sound
    }

    fun setSetting(change: (Save.Settings) -> Unit) { change(_save.settings); applySettings() }

    private fun applySettings() { sound.enabled = _save.settings.sound; persist() }

    fun buyNode(id: String) { if (_save.buyNode(id)) { persist(); sound.play(Sound.Sfx.level) } }

    fun resetTrees() { _save.resetTrees(); persist() }

    /** The note about rebalanced trees has been read: do not show it again. */
    fun clearTreesRefunded() {
        if (!_save.treesRefunded) return
        _save.treesRefunded = false
        persist()
    }

    fun eraseProgress() {
        val fresh = Save()
        _save.stars.clear(); _save.altStars.clear(); _save.oathStars.clear(); _save.oathsCleared.clear(); _save.nodes.clear()
        _save.settings = fresh.settings; _save.seenIntro = false; _save.treesRefunded = false
        persist()
        sound.enabled = _save.settings.sound
        screen = Screen.Title
    }

    /** Record a win. Returns the Embers it earned. */
    fun record(stage: Int, stars: Int, variant: StageVariant = StageVariant.standard, oaths: List<OathId> = emptyList()): Int {
        val got = _save.record(stage, stars, variant, oaths)
        _save.seenIntro = true
        persist()
        return got
    }

    fun play(id: Int, variant: StageVariant? = null, oaths: List<OathId>? = null) {
        val v = variant ?: variantByStage[id] ?: StageVariant.standard
        val o = oaths ?: selectedOaths.toList()
        battleRun += 1
        screen = Screen.Battle(id, v, o, battleRun)
    }

    /** The stage after the last one cleared, for Continue. */
    val nextStage: Int get() = min(20, save.cleared + 1)

    /** Auto skill points start unset: on in the first region, off after it. */
    fun autoSkills(stage: Int): Boolean = _save.settings.autoSkills ?: (data.stage(stage).region == 0)
}

/** How stars are won, in words: lives kept out of the lives you start with. */
fun starRule(start: Int): String {
    val (three, two) = starLives(start)
    val lose = start - three
    return "3 if you lose $lose ${if (lose == 1) "life" else "lives"} or fewer, 2 if you keep $two of $start."
}
