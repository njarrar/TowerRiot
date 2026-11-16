package com.njarrar.towerriot.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.boundsInParent
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.njarrar.towerriot.AppModel
import com.njarrar.towerriot.engine.TreeNode
import com.njarrar.towerriot.ui.ArtIcon
import com.njarrar.towerriot.ui.Face
import com.njarrar.towerriot.ui.Glyph
import com.njarrar.towerriot.ui.GlyphIcon
import com.njarrar.towerriot.ui.Ink
import com.njarrar.towerriot.ui.Kind
import com.njarrar.towerriot.ui.LocalUpright
import com.njarrar.towerriot.ui.PaperButton
import com.njarrar.towerriot.ui.T
import com.njarrar.towerriot.ui.TopBar
import com.njarrar.towerriot.ui.W
import com.njarrar.towerriot.ui.paperCard

/** Skill trees: Embers from stars buy lasting upgrades. Refunds are free. */
@Composable
fun TreesScreen(app: AppModel) {
    val upright = LocalUpright.current
    val s = app.save; val c = s.cleared; val trees = app.data.trees
    val tab = minOf(app.treeTab, trees.size - 1); val t = trees[tab]
    val frames = remember { mutableStateMapOf<String, Rect>() }
    DisposableEffect(Unit) { onDispose { app.clearTreesRefunded() } }
    Column(Modifier.fillMaxSize().safeDrawingPadding().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        TopBar("${s.embers.free} Embers to spend", { app.screen = AppModel.Screen.Campaign(null) }) {
            PaperButton("Refund all", { app.resetTrees() })
        }
        // Shown once after an old save had its trees refunded; gone when dismissed or on leaving this screen.
        if (s.treesRefunded) {
            Row(Modifier.widthIn(max = 560.dp).paperCard(Ink.paper2).padding(start = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                T("The trees were rebalanced. Your Embers were refunded, so spend them again.", Face.body(13, W.SemiBold), modifier = Modifier.weight(1f))
                Box(Modifier.size(44.dp).clickable { app.clearTreesRefunded() }.semantics { contentDescription = "Dismiss" }, contentAlignment = Alignment.Center) {
                    GlyphIcon(Glyph.Close, 13.dp, Ink.ink)
                }
            }
        }
        T(
            "Earn Embers: one per star, two more for each stage cleared, one for a first Variant B clear of a stage, and one for a first clear of a stage with any Oath active. Refunds are free, so try other builds.",
            Face.body(13), Ink.inkFaint, Modifier.widthIn(max = 560.dp), align = TextAlign.Center,
        )
        Row(Modifier.horizontalScroll(rememberScrollState()).clip(RoundedCornerShape(5.dp)).background(Ink.paper3).padding(3.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            for ((i, tree) in trees.withIndex()) {
                val on = i == tab
                Row(
                    Modifier.clip(RoundedCornerShape(4.dp)).background(if (on) Ink.paper else Color.Transparent).clickable { app.treeTab = i; frames.clear() }
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (tree.after > c) ArtIcon("lock", 12.dp, if (on) Ink.ink else Ink.inkDim)
                    T(tree.name, Face.body(14, if (on) W.Heavy else W.SemiBold), if (on) Ink.ink else Ink.inkDim, maxLines = 1)
                }
            }
        }
        T(if (t.after > c) "Opens after stage ${t.after}." else t.blurb, Face.body(14), Ink.inkDim, align = TextAlign.Center)
        Box(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()), contentAlignment = Alignment.TopCenter) {
            val cols = if (upright) 1 else 2
            // The links between nodes are drawn behind the grid, in its own coordinates.
            Column(
                Modifier.widthIn(max = 700.dp).drawBehind {
                    for (n in t.nodes) {
                        val reqId = n.req ?: continue
                        val a = frames[reqId] ?: continue; val b = frames[n.id] ?: continue
                        val start = Offset(a.center.x, a.bottom); val end = Offset(b.center.x, b.top)
                        val my = (start.y + end.y) / 2
                        val p = Path().apply { moveTo(start.x, start.y); cubicTo(start.x, my, end.x, my, end.x, end.y) }
                        val both = n.id in s.nodes && reqId in s.nodes
                        val col = if (both) Color(0xFF261D16) else if (s.canBuyNode(n.id)) Color(0xFFA43D29) else Color(0xFFA39688).copy(alpha = 0.6f)
                        drawPath(p, col, style = Stroke(width = (if (both) 2.5f else 1.6f) * density, pathEffect = if (both) null else PathEffect.dashPathEffect(floatArrayOf(5 * density, 4 * density))))
                    }
                },
                verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                for (row in t.nodes.chunked(cols)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        for (n in row) {
                            Box(Modifier.weight(1f).onGloballyPositioned { lc ->
                                // The row sits inside the column: add the row's own offset.
                                val parent = lc.parentLayoutCoordinates
                                val inRow = lc.boundsInParent()
                                val rowOff = parent?.boundsInParent()?.topLeft ?: Offset.Zero
                                frames[n.id] = inRow.translate(rowOff)
                            }) { NodeCard(app, n) }
                        }
                        if (row.size < cols) Box(Modifier.weight(1f)) {}
                    }
                }
            }
        }
    }
}

@Composable
private fun NodeCard(app: AppModel, node: TreeNode) {
    val s = app.save; val c = s.cleared; val owned = node.id in s.nodes; val can = s.canBuyNode(node.id)
    val req = node.req?.let { app.data.nodes[it] }
    val exclNode = node.excl?.let { app.data.nodes[it] }
    val exclLocked = node.excl?.let { it in s.nodes } ?: false
    val isCapstone = node.excl != null
    val shape = RoundedCornerShape(7.dp)
    val edge = if (owned) (if (isCapstone) Ink.accentLo else Ink.ink) else if (can) (if (isCapstone) Ink.accent else Ink.inkFaint) else Ink.rule
    Column(
        Modifier.alpha(if (exclLocked) 0.62f else 1f).fillMaxWidth().clip(shape).background(if (owned || can) Ink.paper else Ink.paper2)
            .border(if (isCapstone) 1.5.dp else 1.dp, edge, shape).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            T(node.name, Face.body(16, W.Heavy))
            if (isCapstone) Box(Modifier.clip(CircleShape).background(Ink.accent.copy(alpha = 0.16f)).padding(horizontal = 7.dp, vertical = 1.dp)) {
                T("Capstone", Face.body(11, W.Heavy), Ink.accentLo)
            }
        }
        T(node.desc, Face.body(14), Ink.inkDim)
        if (req != null && !owned) T("Needs ${req.name}", Face.body(12), Ink.inkFaint)
        val after = node.after
        if (after != null && after > c && !owned) T("Opens after stage $after", Face.body(12, W.SemiBold), Ink.inkFaint)
        if (exclNode != null && !owned && !exclLocked) T("Capstone: locks ${exclNode.name}", Face.body(12), Ink.accent)
        when {
            owned -> Box(Modifier.clip(CircleShape).background(Ink.ink).padding(horizontal = 10.dp, vertical = 2.dp)) { T("Learned", Face.body(12, W.Heavy), Ink.paper) }
            exclLocked && exclNode != null -> Box(Modifier.clip(CircleShape).background(Ink.paper3).padding(horizontal = 10.dp, vertical = 2.dp)) {
                T("Locked by ${exclNode.name}", Face.body(12, W.Bold), Ink.inkFaint)
            }
            else -> PaperButton("${node.cost} Embers", { app.buyNode(node.id) }, kind = if (can) Kind.Primary else Kind.Plain, enabled = can)
        }
    }
}
