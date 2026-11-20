package com.njarrar.towerriot

import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Modifier
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.njarrar.towerriot.art.ArtFiles
import com.njarrar.towerriot.battle.BattleScreen
import com.njarrar.towerriot.screens.CampaignScreen
import com.njarrar.towerriot.screens.SettingsScreen
import com.njarrar.towerriot.screens.TitleScreen
import com.njarrar.towerriot.screens.TreesScreen
import com.njarrar.towerriot.ui.Ink
import com.njarrar.towerriot.ui.ProvideUpright

class MainActivity : ComponentActivity() {
    private lateinit var app: AppModel

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ArtFiles.init(this)
        // The manifest keeps the activity through a rotation, so the fight carries on as the phone turns.
        app = AppModel(applicationContext)
        enableEdgeToEdge()
        // The screen stays on through a fight, and the map runs under a camera cutout.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (Build.VERSION.SDK_INT >= 28) {
            window.attributes = window.attributes.also { it.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES }
        }
        // A game fills the screen: the system bars slide in on a swipe and hide again.
        val bars = WindowCompat.getInsetsController(window, window.decorView)
        bars.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        bars.hide(WindowInsetsCompat.Type.systemBars())
        setContent { Root(app) }
    }

    override fun onResume() { super.onResume(); app.sound.start() }
    override fun onPause() { app.onBackground(); app.sound.stop(); super.onPause() }
}

@Composable
private fun Root(app: AppModel) {
    BoxWithConstraints(Modifier.fillMaxSize().background(Ink.paper)) {
        val upright = maxHeight > maxWidth * 1.15f && maxWidth.value < 760
        ProvideUpright(upright) {
            when (val s = app.screen) {
                is AppModel.Screen.Title -> TitleScreen(app)
                is AppModel.Screen.Campaign -> { BackHandler { app.screen = AppModel.Screen.Title }; CampaignScreen(app, s.focus) }
                is AppModel.Screen.Trees -> { BackHandler { app.screen = AppModel.Screen.Campaign(null) }; TreesScreen(app) }
                is AppModel.Screen.Settings -> { BackHandler { app.screen = AppModel.Screen.Title }; SettingsScreen(app) }
                is AppModel.Screen.Battle -> key(s.run) { BattleScreen(app, s) }
            }
        }
    }
}
