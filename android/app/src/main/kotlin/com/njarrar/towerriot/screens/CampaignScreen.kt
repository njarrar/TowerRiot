package com.njarrar.towerriot.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.njarrar.towerriot.AppModel
import com.njarrar.towerriot.engine.EnemyKind
import com.njarrar.towerriot.engine.OathId
import com.njarrar.towerriot.engine.RegionDef
import com.njarrar.towerriot.engine.SkillKey
import com.njarrar.towerriot.engine.StageDef
import com.njarrar.towerriot.engine.StageVariant
import com.njarrar.towerriot.starRule
import com.njarrar.towerriot.ui.ArtIcon
import com.njarrar.towerriot.ui.ArtPicture
import com.njarrar.towerriot.ui.Face
import com.njarrar.towerriot.ui.Glyph
import com.njarrar.towerriot.ui.GlyphIcon
import com.njarrar.towerriot.ui.Ink
import com.njarrar.towerriot.ui.Kind
import com.njarrar.towerriot.ui.LocalUpright
import com.njarrar.towerriot.ui.PaperButton
import com.njarrar.towerriot.ui.Segments
import com.njarrar.towerriot.ui.Stars
import com.njarrar.towerriot.ui.T
import com.njarrar.towerriot.ui.TopBar
import com.njarrar.towerriot.ui.W
import com.njarrar.towerriot.ui.paperCard
import kotlin.math.max
import kotlin.math.min

private class OathDef(val id: OathId, val name: String, val desc: String)
private val OATH_DEFS = listOf(
    OathDef(OathId.twinRifts, "Twin Rifts", "Every road is live from wave 1, and every foe is 15% tougher."),
    OathDef(OathId.shiftingEarth, "Shifting Earth", "Two plots sink mid-battle and their towers refund only half. Tides, lava and steam hold roads shut for 40% less time."),
    OathDef(OathId.longNight, "Long Night", "Night never lifts. Hidden foes only show in light."),
)

private class RelicDef(val stage: Int, val name: String, val bonus: String)
private val RELIC_DEFS = listOf(
    RelicDef(5, "Mire Crown", "+10% tower damage"),
    RelicDef(10, "Tide Pearl", "+15% tower range near water"),
    RelicDef(15, "Brass Heart", "+1 Wren starting skill point"),
    RelicDef(20, "Ash Sigil", "+10% tower damage"),
)

/** The campaign: each region is a strip of its own ground with a road through it; the stages are stops on the road. */
@Composable
fun CampaignScreen(app: AppModel, focus: Int?) {
    val upright = LocalUpright.current
    val s = app.save
    var sel by remember { mutableIntStateOf(focus ?: app.nextStage) }
    var showGuide by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().safeDrawingPadding().padding(16.dp)) {
        if (upright) {
            // Back, the title and sound on one row; the two links share the row under it in equal halves.
            Column(Modifier.padding(bottom = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    PaperButton("Back", { app.screen = AppModel.Screen.Title }, tall = true)
                    Box(Modifier.weight(1f), contentAlignment = Alignment.Center) { T("The campaign", Face.title(20), maxLines = 1) }
                    SoundCorner(app)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PaperButton("Field guide", { showGuide = true }, Modifier.weight(1f), tall = true)
                    PaperButton("Skill trees: ${s.embers.free} Embers", { app.screen = AppModel.Screen.Trees }, Modifier.weight(1f), tall = true)
                }
            }
        } else {
            TopBar("The campaign", { app.screen = AppModel.Screen.Title }) {
                PaperButton("Field guide", { showGuide = true }, tall = true)
                PaperButton("Skill trees: ${s.embers.free} Embers", { app.screen = AppModel.Screen.Trees }, tall = true)
                SoundCorner(app)
            }
        }
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(vertical = 4.dp).padding(bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            T("Boss Relics:", Face.body(12, W.Bold), Ink.inkDim)
            for (rl in RELIC_DEFS) {
                val has = (s.stars[rl.stage] ?: 0) > 0
                Box(
                    Modifier.alpha(if (has) 1f else 0.72f).clip(CircleShape).background(if (has) Ink.paper else Ink.paper2)
                        .border(1.dp, if (has) Ink.inkDim else Ink.rule, CircleShape).padding(horizontal = 8.dp, vertical = 3.dp),
                ) { T("${rl.name}${if (has) " (${rl.bonus})" else " (Locked)"}", Face.body(11, if (has) W.Bold else W.Medium), if (has) Ink.ink else Ink.inkFaint, maxLines = 1) }
            }
        }
        // Upright, the chosen stage sits under the stops; sideways, beside them. Either way its Start is always in view.
        if (upright) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.weight(1f)) { Regions(app, focus, sel) { sel = it } }
                StageCard(app, sel, compact = true)
            }
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Box(Modifier.weight(1f)) { Regions(app, focus, sel) { sel = it } }
                Box(Modifier.width(320.dp).fillMaxHeight()) { StageCard(app, sel, compact = false) }
            }
        }
    }
    if (showGuide) FieldGuideSheet(app) { showGuide = false }
}

@Composable
private fun Regions(app: AppModel, focus: Int?, sel: Int, pick: (Int) -> Unit) {
    val state = rememberLazyListState()
    LaunchedEffect(Unit) {
        // Open on the stage you came for: on a phone the cleared regions above would push it off screen.
        state.scrollToItem(app.data.stage(focus ?: app.nextStage).region)
    }
    LazyColumn(state = state, verticalArrangement = Arrangement.spacedBy(14.dp)) {
        itemsIndexed(app.data.regions) { ri, r -> RegionStrip(app, r, ri, sel, pick) }
    }
}

/** Ground, road and road edge colours per region, as the web campaign paints them. */
private class Look(val g1: Color, val g2: Color, val road: Color, val edge: Color)
private val LOOKS = listOf(
    Look(Color(0xFF7F9E58), Color(0xFF95B06A), Color(0xFFE1D3B0), Color(0xFFB9A77F)),
    Look(Color(0xFFCDBD8F), Color(0xFFDCCEA4), Color(0xFF9D8862), Color(0xFF85714F)),
    Look(Color(0xFF8C8D86), Color(0xFFA3A39B), Color(0xFFD2C6AA), Color(0xFFA89C82)),
    Look(Color(0xFF4F3A33), Color(0xFF67463A), Color(0xFF2A2220), Color(0xFFC8572A)),
)
/** Route curves per region, as the web campaign draws them, so the four regions do not look stamped from one mould. */
private val REGION_YS = listOf(
    listOf(0.68f, 0.36f, 0.62f, 0.30f, 0.50f),
    listOf(0.34f, 0.66f, 0.38f, 0.68f, 0.44f),
    listOf(0.64f, 0.62f, 0.30f, 0.32f, 0.54f),
    listOf(0.70f, 0.48f, 0.28f, 0.58f, 0.34f),
)

@Composable
private fun RegionStrip(app: AppModel, region: RegionDef, index: Int, sel: Int, pick: (Int) -> Unit) {
    val own = app.data.stages.filter { it.region == index }
    val sealed = !(own.firstOrNull()?.let { app.save.isUnlocked(it.id) } ?: false)
    val look = LOOKS[min(index, LOOKS.size - 1)]
    val ys = REGION_YS[min(index, REGION_YS.size - 1)]
    val shape = RoundedCornerShape(5.dp)
    Column(Modifier.fillMaxWidth().clip(shape).background(Ink.paper).border(1.dp, Ink.rule, shape)) {
        Row(Modifier.padding(start = 14.dp, end = 14.dp, top = 10.dp, bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            T(region.name, Face.title(17), if (sealed) Ink.inkDim else Ink.ink, maxLines = 1)
            T(
                if (sealed) "Stages ${own.firstOrNull()?.id ?: 0} to ${own.lastOrNull()?.id ?: 0}. Opens after stage ${(own.firstOrNull()?.id ?: 1) - 1}." else region.rule,
                Face.body(13), Ink.inkFaint, maxLines = 2,
            )
        }
        BoxWithConstraints(Modifier.fillMaxWidth().height(138.dp).alpha(if (sealed) 0.6f else 1f)) {
            val W = maxWidth.value; val H = 138f
            val stops = own.indices.map { i -> Offset((0.09f + i * (0.82f / max(1, own.size - 1))) * W, ys[i % 5] * H) }
            Canvas(Modifier.fillMaxSize()) {
                val k = density
                drawRect(Brush.linearGradient(listOf(desat(look.g2, sealed), desat(look.g1, sealed)), Offset.Zero, Offset(size.width, size.height)))
                if (stops.isEmpty()) return@Canvas
                val p = Path()
                val first = stops.first(); val last = stops.last()
                p.moveTo(-0.2f * W * k, (first.y + 0.06f * H) * k)
                p.cubicTo(0f, (first.y + 0.06f * H) * k, (first.x - 0.04f * W) * k, first.y * k, first.x * k, first.y * k)
                for (i in 1 until stops.size) {
                    val q = stops[i - 1]; val s2 = stops[i]; val mx = (q.x + s2.x) / 2
                    p.cubicTo(mx * k, q.y * k, mx * k, s2.y * k, s2.x * k, s2.y * k)
                }
                p.cubicTo(1.04f * W * k, last.y * k, 1.04f * W * k, last.y * k, 1.2f * W * k, last.y * k)
                drawPath(p, desat(look.edge, sealed), style = Stroke(15.dp.toPx(), cap = StrokeCap.Round))
                drawPath(p, desat(look.road, sealed), style = Stroke(11.dp.toPx(), cap = StrokeCap.Round))
            }
            for ((i, st) in own.withIndex()) {
                Centered(stops[i]) { StageNode(app, st, sel == st.id) { pick(st.id) } }
            }
        }
    }
}

/** Sealed regions lose most of their colour. */
private fun desat(c: Color, sealed: Boolean): Color {
    if (!sealed) return c
    val l = c.red * 0.3f + c.green * 0.59f + c.blue * 0.11f
    val k = 0.35f
    return Color(l + (c.red - l) * k, l + (c.green - l) * k, l + (c.blue - l) * k, c.alpha)
}

/** Lays its content out centred on a point (in dp), as SwiftUI's position does. */
@Composable
private fun Centered(at: Offset, content: @Composable () -> Unit) {
    Layout(content) { measurables, constraints ->
        val pl = measurables.map { it.measure(Constraints()) }
        layout(constraints.maxWidth, constraints.maxHeight) {
            for (p in pl) p.place((at.x * density - p.width / 2f).toInt(), (at.y * density - p.height / 2f).toInt())
        }
    }
}

@Composable
private fun StageNode(app: AppModel, stage: StageDef, selected: Boolean, tap: () -> Unit) {
    val open = app.save.isUnlocked(stage.id); val best = app.save.stars[stage.id] ?: 0
    val altBest = app.save.altStars[stage.id] ?: 0
    val isNext = open && best == 0; val boss = stage.id % 5 == 0
    val fill = if (!open) Ink.paper2 else if (best > 0) Ink.ink else if (isNext) Ink.accent else Ink.paper
    val fg = if (best > 0 || isNext) Ink.paper else Ink.ink
    Column(
        Modifier.clickable(role = Role.Button, onClick = tap).semantics { contentDescription = "Stage ${stage.id}, ${stage.name}${if (open) "" else ", locked"}" },
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        val outer = RoundedCornerShape(if (boss) 8.dp else 19.dp)
        Box(Modifier.border(2.dp, if (selected) Ink.ink else Color.Transparent, outer).padding(3.dp)) {
            val shape = RoundedCornerShape(if (boss) 6.dp else 16.dp)
            Box(
                Modifier.size(32.dp).clip(shape).background(fill)
                    .border(2.dp, if (best > 0) Ink.ink else if (isNext) Ink.accentLo else if (open) Ink.inkDim else Ink.ruleStrong, shape),
                contentAlignment = Alignment.Center,
            ) {
                if (open) T("${stage.id}", Face.body(15, W.Heavy), fg, maxLines = 1) else ArtIcon("lock", 14.dp, Ink.inkFaint)
            }
        }
        Box(Modifier.clip(CircleShape).background(if (selected) Ink.ink else Ink.paperGlass).padding(horizontal = 8.dp, vertical = 1.dp)) {
            T(stage.name, Face.body(12, W.Bold), if (selected) Ink.paper else if (open) Ink.ink else Ink.inkFaint, maxLines = 1)
        }
        if (best > 0 || altBest > 0) T("★".repeat(best) + if (altBest > 0) " +${altBest}B" else "", Face.body(11), Ink.gold, maxLines = 1)
    }
}

@Composable
private fun StageCard(app: AppModel, id: Int, compact: Boolean) {
    val raw = app.data.stage(id); val open = app.save.isUnlocked(id)
    val stdBest = app.save.stars[id] ?: 0; val altBest = app.save.altStars[id] ?: 0
    val variant = if (raw.alt != null && stdBest > 0) app.variantByStage[id] ?: StageVariant.standard else StageVariant.standard
    val st = raw.resolved(variant)
    val best = if (variant == StageVariant.alt) altBest else stdBest
    val newFoe = app.data.enemies.values.firstOrNull { it.name.lowercase() == raw.newFoe.lowercase() }
    val shape = RoundedCornerShape(9.dp)
    Column(Modifier.fillMaxWidth().clip(shape).background(Ink.paper2).border(1.dp, Ink.rule, shape).padding(if (compact) 14.dp else 16.dp)) {
        val variantPick: @Composable () -> Unit = {
            if (stdBest > 0 && raw.alt != null) {
                Segments(listOf(StageVariant.standard to "Standard", StageVariant.alt to "Variant B"), variant, tall = true) { v -> app.variantByStage[id] = v }
            }
        }
        if (compact) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    T(st.name, Face.title(20), maxLines = 1, modifier = Modifier.weight(1f))
                    Stars(best, 16)
                }
                T("Stage ${st.id}, ${app.data.regions[st.region].name} · ${st.waves.size} waves · ${st.startGold}g", Face.body(13, W.SemiBold), Ink.inkDim)
                T(st.twist, Face.body(13), Ink.inkDim, maxLines = 3)
                Box(Modifier.padding(top = 4.dp)) { variantPick() }
                // Oaths chosen here apply to the fight, so they are always in view when they can be picked.
                if (stdBest > 0) OathPicker(app)
            }
        } else {
            // The facts scroll if they must; Start stays pinned below them, never under the fold.
            Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                T(st.name, Face.title(26))
                T("Stage ${st.id}, ${app.data.regions[st.region].name}", Face.body(14, W.SemiBold), Ink.inkDim)
                Stars(best, 20)
                variantPick()
                T(st.twist, Face.body(14), Ink.inkDim)
                if (stdBest > 0) OathPicker(app)
                Box(Modifier.fillMaxWidth().height(1.dp).background(Ink.rule))
                Fact("New foe", newFoe?.let { "${it.name}: ${it.blurb} Answer: ${it.answer}" } ?: st.newFoe)
                Fact("Unlocks", st.unlocks)
                Row {
                    T("Towers", Face.body(13), Ink.inkFaint, Modifier.width(64.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) { for (k in st.towers) ArtPicture("icon-tower-${k.name}", 32.dp) }
                }
                Fact("Waves", "${st.waves.size}, starting gold ${st.startGold}")
                Fact("Stars", starRule(st.lives + app.save.mods.lives))
            }
        }
        if (open) {
            val oaths = if (stdBest > 0) app.selectedOaths.toList() else emptyList()
            Box(Modifier.fillMaxWidth().padding(top = 10.dp), contentAlignment = Alignment.Center) {
                PaperButton(if (best > 0) (if (variant == StageVariant.alt) "Play Variant B" else "Play again") else "Start", { app.play(id, variant, oaths) }, kind = Kind.Primary, big = true)
            }
        } else {
            T("Clear the stage before it to open this one.", Face.body(13), Ink.inkFaint, Modifier.padding(top = 10.dp))
        }
    }
}

@Composable
private fun Fact(label: String, value: String) {
    Row {
        T(label, Face.body(13), Ink.inkFaint, Modifier.width(64.dp))
        T(value, Face.body(13))
    }
}

/** Challenge Oaths: optional rules that make a cleared stage harder. A finger cannot hover, so a picked Oath spells out what it does. */
@Composable
private fun OathPicker(app: AppModel) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        T("Challenge Oaths", Face.body(12, W.Bold), Ink.inkFaint)
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            for (o in OATH_DEFS) {
                val on = o.id in app.selectedOaths
                Box(
                    Modifier.defaultMinSize(44.dp, 44.dp)
                        .clickable(role = Role.Checkbox) { if (on) app.selectedOaths.remove(o.id) else app.selectedOaths.add(o.id) }
                        .semantics { contentDescription = "${o.name}: ${o.desc}" },
                    contentAlignment = Alignment.Center,
                ) {
                    val shape = RoundedCornerShape(4.dp)
                    Box(Modifier.clip(shape).background(if (on) Ink.accent else Ink.paper).border(1.dp, if (on) Ink.accentLo else Ink.ruleStrong, shape).padding(horizontal = 7.dp, vertical = 4.dp)) {
                        T(o.name, Face.body(11, W.Bold), if (on) Ink.accentInk else Ink.ink, maxLines = 1)
                    }
                }
            }
        }
        for (o in OATH_DEFS) if (o.id in app.selectedOaths) T("${o.name}: ${o.desc}", Face.body(12), Ink.inkDim)
        T("Clear a stage with any Oath active for +1 Ember, once per stage.", Face.body(12), Ink.inkFaint)
    }
}

private enum class GuideTab { foes, towers, items, hero }

/** Keep Field Guide: every foe, tower (with its level 4 and 5 splits), shop item and Wren's skills. */
@Composable
fun FieldGuideSheet(app: AppModel, dismiss: () -> Unit) {
    var tab by remember { mutableStateOf(GuideTab.foes) }
    Dialog(dismiss, DialogProperties(usePlatformDefaultWidth = false)) {
        Column(Modifier.fillMaxSize().background(Ink.paper).safeDrawingPadding().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                T("Keep Field Guide", Face.title(22), modifier = Modifier.weight(1f))
                Box(Modifier.size(44.dp).clickable(role = Role.Button, onClick = dismiss).semantics { contentDescription = "Close" }, contentAlignment = Alignment.Center) {
                    GlyphIcon(Glyph.Close, 14.dp, Ink.ink)
                }
            }
            Box(Modifier.horizontalScroll(rememberScrollState())) {
                Segments(
                    listOf(GuideTab.foes to "${EnemyKind.entries.size} Foes", GuideTab.towers to "6 Towers", GuideTab.items to "${app.data.itemOrder.size} Items", GuideTab.hero to "Wren & Skills"),
                    tab, tall = true,
                ) { tab = it }
            }
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                when (tab) {
                    GuideTab.foes -> for (k in EnemyKind.entries) {
                        val f = app.data.enemy(k)
                        val tags = listOfNotNull(
                            if (f.isFlying) "Flying" else "Ground", if (f.isBoss) "Boss" else null,
                            f.traits?.armor?.let { "Armor ${it.toInt()}" }, if (f.traits?.stealth == true) "Stealth" else null,
                            if (f.traits?.heal != null) "Healer" else null,
                        ).joinToString(" · ")
                        GuideRow("icon-foe-${k.name}", f.name, "$tags · ${f.hp.toInt()} HP · ${f.gold.toInt()}g · ${f.leak} life", "${f.blurb} Answer: ${f.answer}")
                    }
                    GuideTab.towers -> for (k in app.data.towerOrder) {
                        val d = app.data.tower(k)
                        val costs = d.cost.joinToString("/") { "${it.toInt()}" }
                        val splits = d.splits.joinToString(" | ") { "${it.name} -> ${it.masteryName}" }
                        GuideRow("icon-tower-${k.name}", d.name, "Costs: ${costs}g · Lv 4-5: $splits", d.blurb)
                    }
                    GuideTab.items -> for (id in app.data.itemOrder) {
                        val it = app.data.item(id)
                        GuideRow(null, "${it.name} (${it.cost.toInt()}g base, +20% courier away from Gate)", if (it.after > 0) "Opens after stage ${it.after}" else "Open from stage 1", it.desc)
                    }
                    GuideTab.hero -> {
                        val h = app.data.hero
                        GuideRow(
                            "icon-hero", "Wren: Pin & ${h.leash.toInt()} px Leash (${h.blocks} blocks, ${h.gateRadius.toInt()} px Gate)",
                            "Levels 1..${h.maxLevel} per fight · +${(h.lastHit * 100).toInt()}% gold on last hits",
                            "Auto-attacks engage foes inside a 90 px leash without dropping road hold. Stand beside rubble plots to salvage free.",
                        )
                        for (k in listOf(SkillKey.q, SkillKey.w, SkillKey.e, SkillKey.r)) {
                            val sk = app.data.skill(k)
                            GuideRow("ui-skill-${k.name}", "${k.name.uppercase()}: ${sk.name}", "Unlocks Lv ${sk.needLevel.joinToString("/")} · CD ${sk.cd.joinToString("/") { "${it.toInt()}s" }}", sk.desc)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun GuideRow(icon: String?, title: String, sub: String, desc: String) {
    Row(Modifier.fillMaxWidth().paperCard(Ink.paper2).padding(10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        if (icon != null) {
            if (icon.startsWith("ui-")) ArtIcon(icon.removePrefix("ui-"), 32.dp, Ink.ink) else ArtPicture(icon, 48.dp)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            T(title, Face.body(14, W.Heavy))
            T(sub, Face.body(11, W.Bold), Ink.inkFaint)
            T(desc, Face.body(13), Ink.inkDim)
        }
    }
}
