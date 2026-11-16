package com.njarrar.towerriot.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.njarrar.towerriot.R
import com.njarrar.towerriot.art.ArtFiles

/** The morning look, from the colour tokens at the top of src/styles.css.
 *  Pale limestone paper, dark iron ink, one rust accent, gold only for stars and coin. */
object Ink {
    val paper = Color(0xFFF7F3EB)
    val paper2 = Color(0xFFEEE7DB)
    val paper3 = Color(0xFFE1D8C9)
    val paperGlass = Color(0xEBF7F3EB)
    val rule = Color(0xFFC9BFB2)
    val ruleStrong = Color(0xFFA39688)
    val ink = Color(0xFF261D16)
    val inkDim = Color(0xFF554B42)
    val inkFaint = Color(0xFF645C53)
    val accent = Color(0xFFA43D29)
    val accentLo = Color(0xFF8C2F1F)
    val accentInk = Color(0xFFF8F5EE)
    val gold = Color(0xFFDE9D16)
    val goldDeep = Color(0xFFAA6A00)
    val life = Color(0xFFCC3430)
    val good = Color(0xFF357A3A)
    val hollow = Color(0xFF11846E)
    val skyTop = Color(0xFFBCDDF1)
    val skyLow = Color(0xFFF8EDD8)
    val shadow = Color(0x2E261D16)
    val scrim = Color(0x73261D16)
}

/** Cinzel for the logo, screen titles, stage names and battle banners. Barlow for everything else. */
object Face {
    val cinzel = FontFamily(Font(R.font.cinzel_bold, FontWeight.Bold), Font(R.font.cinzel_extrabold, FontWeight.ExtraBold))
    val barlow = FontFamily(
        Font(R.font.barlow_medium, FontWeight.Medium), Font(R.font.barlow_semibold, FontWeight.SemiBold),
        Font(R.font.barlow_bold, FontWeight.Bold), Font(R.font.barlow_extrabold, FontWeight.ExtraBold),
    )

    fun title(size: Int, heavy: Boolean = false) = TextStyle(fontFamily = cinzel, fontWeight = if (heavy) FontWeight.ExtraBold else FontWeight.Bold, fontSize = size.sp)
    fun body(size: Int, weight: W = W.Medium) = TextStyle(fontFamily = barlow, fontWeight = weight.fw, fontSize = size.sp, lineHeight = (size * 1.3).sp)
}

enum class W(val fw: FontWeight) { Medium(FontWeight.Medium), SemiBold(FontWeight.SemiBold), Bold(FontWeight.Bold), Heavy(FontWeight.ExtraBold) }

/** A phone held upright: menus stack instead of sitting side by side, and the battle map slides sideways. */
val LocalUpright = staticCompositionLocalOf { false }

@Composable
fun ProvideUpright(upright: Boolean, content: @Composable () -> Unit) = CompositionLocalProvider(LocalUpright provides upright, content = content)

/** Plain text in the game's faces. */
@Composable
fun T(
    text: String, style: TextStyle, color: Color = Ink.ink, modifier: Modifier = Modifier, maxLines: Int = Int.MAX_VALUE,
    align: TextAlign? = null,
) = Text(text, modifier = modifier, style = style, color = color, maxLines = maxLines, overflow = TextOverflow.Ellipsis, textAlign = align)

enum class Kind { Plain, Primary, Danger, DangerSolid }

/** The game's buttons: paper with an ink rule, or rust for the one thing to act on. */
@Composable
fun PaperButton(
    onClick: () -> Unit, modifier: Modifier = Modifier, kind: Kind = Kind.Plain, big: Boolean = false, poor: Boolean = false,
    tall: Boolean = false, enabled: Boolean = true, label: String? = null, content: @Composable RowScope.(Color) -> Unit,
) {
    val src = remember { MutableInteractionSource() }
    val pressed by src.collectIsPressedAsState()
    val (bg, fg, edge) = when (kind) {
        Kind.Plain -> Triple(if (pressed) Ink.paper2 else Ink.paper, Ink.ink, Ink.ruleStrong)
        Kind.Primary -> Triple(if (pressed) Ink.accentLo else Ink.accent, Ink.accentInk, Ink.accentLo)
        Kind.Danger -> Triple(Ink.paper, Ink.life, Ink.life)
        Kind.DangerSolid -> Triple(Ink.life, Ink.accentInk, Ink.life)
    }
    val shape = RoundedCornerShape(5.dp)
    Row(
        modifier
            .offset(y = if (pressed) 1.dp else 0.dp)
            .alpha(if (enabled && !poor) 1f else 0.5f)
            .defaultMinSize(minHeight = if (tall) 44.dp else 0.dp)
            .clip(shape)
            .background(bg, shape)
            .border(1.dp, edge, shape)
            .clickable(src, null, enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics { if (label != null) contentDescription = label }
            .padding(horizontal = if (big) 24.dp else 14.dp, vertical = if (big) 12.dp else 8.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) { content(fg) }
}

/** A text button in the paper style. */
@Composable
fun PaperButton(
    text: String, onClick: () -> Unit, modifier: Modifier = Modifier, kind: Kind = Kind.Plain, big: Boolean = false,
    poor: Boolean = false, tall: Boolean = false, enabled: Boolean = true,
) = PaperButton(onClick, modifier, kind, big, poor, tall, enabled) { fg ->
    T(text, Face.body(if (big) 18 else 15, if (kind == Kind.Primary) W.Heavy else W.Bold), fg, maxLines = 1)
}

/** One of the line icons baked from the web game's SVGs, tinted with the text colour. */
@Composable
fun ArtIcon(name: String, size: Dp = 18.dp, tint: Color = Ink.ink) {
    val img = ArtFiles.image("ui-$name")
    if (img != null) Image(img, null, Modifier.size(size), colorFilter = ColorFilter.tint(tint), filterQuality = FilterQuality.High)
    else Spacer(Modifier.size(size))
}

/** A painted picture (tower, foe, Wren) baked from the web painters. */
@Composable
fun ArtPicture(name: String, size: Dp, modifier: Modifier = Modifier) {
    val img = ArtFiles.image(name)
    if (img != null) Image(img, null, modifier.size(size), filterQuality = FilterQuality.High)
    else Spacer(modifier.size(size))
}

/** A square icon button, 44 dp, for the HUD and menu corners. */
@Composable
fun IconBtn(icon: String, label: String, dim: Boolean = false, active: Boolean = false, onClick: () -> Unit) {
    val shape = RoundedCornerShape(5.dp)
    Box(
        Modifier.size(44.dp).clip(shape).background(if (active) Ink.accent else Ink.paperGlass, shape)
            .border(1.dp, if (active) Ink.accentLo else Ink.ruleStrong, shape)
            .clickable(role = Role.Button, onClick = onClick).semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { ArtIcon(icon, 20.dp, if (active) Ink.accentInk else if (dim) Ink.inkDim else Ink.ink) }
}

/** Small drawn marks the iOS app takes from SF Symbols. */
enum class Glyph { Heart, Flag, Gear, Close, Check }

@Composable
fun GlyphIcon(g: Glyph, size: Dp, color: Color) {
    Canvas(Modifier.size(size)) {
        val s = this.size.minDimension
        val stroke = Stroke(width = s * 0.12f, cap = StrokeCap.Round, join = StrokeJoin.Round)
        when (g) {
            Glyph.Heart -> {
                val p = Path().apply {
                    moveTo(s * 0.5f, s * 0.9f)
                    cubicTo(s * 0.05f, s * 0.6f, s * 0.0f, s * 0.25f, s * 0.27f, s * 0.15f)
                    cubicTo(s * 0.4f, s * 0.1f, s * 0.48f, s * 0.2f, s * 0.5f, s * 0.28f)
                    cubicTo(s * 0.52f, s * 0.2f, s * 0.6f, s * 0.1f, s * 0.73f, s * 0.15f)
                    cubicTo(s * 1.0f, s * 0.25f, s * 0.95f, s * 0.6f, s * 0.5f, s * 0.9f)
                    close()
                }
                drawPath(p, color)
            }
            Glyph.Flag -> {
                drawLine(color, Offset(s * 0.2f, s * 0.1f), Offset(s * 0.2f, s * 0.95f), s * 0.12f, StrokeCap.Round)
                val p = Path().apply { moveTo(s * 0.22f, s * 0.12f); lineTo(s * 0.85f, s * 0.12f); lineTo(s * 0.7f, s * 0.33f); lineTo(s * 0.85f, s * 0.55f); lineTo(s * 0.22f, s * 0.55f); close() }
                drawPath(p, color)
            }
            Glyph.Gear -> {
                val c = Offset(s / 2, s / 2)
                for (k in 0 until 8) {
                    val a = k / 8.0 * Math.PI * 2
                    val dx = Math.cos(a).toFloat(); val dy = Math.sin(a).toFloat()
                    drawLine(color, Offset(c.x + dx * s * 0.3f, c.y + dy * s * 0.3f), Offset(c.x + dx * s * 0.46f, c.y + dy * s * 0.46f), s * 0.14f, StrokeCap.Butt)
                }
                drawCircle(color, s * 0.3f, c, style = Stroke(s * 0.12f))
                drawCircle(color, s * 0.09f, c)
            }
            Glyph.Close -> {
                drawLine(color, Offset(s * 0.2f, s * 0.2f), Offset(s * 0.8f, s * 0.8f), s * 0.13f, StrokeCap.Round)
                drawLine(color, Offset(s * 0.8f, s * 0.2f), Offset(s * 0.2f, s * 0.8f), s * 0.13f, StrokeCap.Round)
            }
            Glyph.Check -> {
                val p = Path().apply { moveTo(s * 0.18f, s * 0.52f); lineTo(s * 0.42f, s * 0.76f); lineTo(s * 0.84f, s * 0.26f) }
                drawPath(p, color, style = stroke)
            }
        }
    }
}

/** A paper card: the panels that sit over the map and the menus. */
fun Modifier.paperCard(fill: Color = Ink.paper, radius: Dp = 7.dp): Modifier {
    val shape = RoundedCornerShape(radius)
    return this.clip(shape).background(fill, shape).border(1.dp, Ink.rule, shape)
}

fun Modifier.softShadow(radius: Dp = 10.dp, shape: Shape = RoundedCornerShape(7.dp)): Modifier =
    this.shadow(radius, shape, clip = false, ambientColor = Ink.shadow, spotColor = Ink.shadow)

/** Stars: gold when won, a pale rule colour when not. */
@Composable
fun Stars(n: Int, size: Int = 18) {
    Row(Modifier.semantics { contentDescription = "$n of 3 stars" }, horizontalArrangement = Arrangement.spacedBy((size * 0.2f).dp)) {
        for (i in 0 until 3) T("★", TextStyle(fontSize = size.sp), if (i < n) Ink.gold else Ink.ruleStrong)
    }
}

/** A coin and a number: gold is only for coin and stars. */
@Composable
fun Price(n: Int, size: Int = 14, color: Color = Ink.ink) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        Box(Modifier.size((size * 0.8f).dp).clip(CircleShape).background(Ink.gold).border(1.dp, Ink.goldDeep, CircleShape))
        T("$n", Face.body(size, W.Heavy), color, maxLines = 1)
    }
}

/** A segmented choice, as in the web game's .seg. */
@Composable
fun <K> Segments(items: List<Pair<K, String>>, selected: K, tall: Boolean = false, modifier: Modifier = Modifier, pick: (K) -> Unit) {
    Row(modifier.clip(RoundedCornerShape(5.dp)).background(Ink.paper3).padding(3.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        for ((k, label) in items) {
            val on = k == selected
            Box(
                Modifier.defaultMinSize(minHeight = if (tall) 44.dp else 0.dp).clip(RoundedCornerShape(4.dp))
                    .background(if (on) Ink.paper else Color.Transparent).clickable(role = Role.Tab) { pick(k) }
                    .padding(horizontal = if (items.size >= 4) 8.dp else 10.dp, vertical = 6.dp),
                contentAlignment = Alignment.Center,
            ) { T(label, Face.body(14, if (on) W.Heavy else W.SemiBold), if (on) Ink.ink else Ink.inkDim, maxLines = 1) }
        }
    }
}

/** A thin rounded meter. */
@Composable
fun Meter(value: Double, color: Color, height: Dp = 5.dp, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().height(height).clip(CircleShape).background(Ink.paper3)) {
        Box(Modifier.fillMaxWidth(value.coerceIn(0.0, 1.0).toFloat()).height(height).clip(CircleShape).background(color))
    }
}

/** The bar across the top of the menu screens: back, a title, and what sits on the right. */
@Composable
fun TopBar(title: String, back: () -> Unit, trailing: @Composable RowScope.() -> Unit = {}) {
    if (LocalUpright.current) {
        Column(Modifier.fillMaxWidth().padding(bottom = 10.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                PaperButton("Back", back)
                Spacer(Modifier.weight(1f))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically, content = trailing)
            }
            T(title, Face.title(20), maxLines = 1)
        }
    } else {
        Box(Modifier.fillMaxWidth().padding(bottom = 12.dp), contentAlignment = Alignment.Center) {
            T(title, Face.title(24), maxLines = 1)
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                PaperButton("Back", back)
                Spacer(Modifier.weight(1f))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically, content = trailing)
            }
        }
    }
}

/** A small rust tag, such as "New" or "Capstone". */
@Composable
fun Tag(text: String, fill: Color = Ink.accent, color: Color = Ink.accentInk) {
    Box(Modifier.clip(RoundedCornerShape(3.dp)).background(fill).padding(horizontal = 4.dp, vertical = 1.dp)) {
        T(text, Face.body(10, W.Heavy), color, maxLines = 1)
    }
}

@Composable
fun HSpace(w: Dp) = Spacer(Modifier.width(w))
