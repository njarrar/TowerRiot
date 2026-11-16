package com.njarrar.towerriot.battle

import android.graphics.Bitmap
import android.graphics.BlendMode
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.PorterDuffColorFilter
import android.graphics.PorterDuffXfermode
import android.graphics.RadialGradient
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import android.os.Build
import com.njarrar.towerriot.art.ArtFrame
import com.njarrar.towerriot.engine.World

/** Colour helpers: 0xRRGGBB with an alpha, or 0-255 parts. */
fun rgb(hex: Int, a: Double = 1.0): Int = Color.argb((a.coerceIn(0.0, 1.0) * 255).toInt(), (hex shr 16) and 0xff, (hex shr 8) and 0xff, hex and 0xff)
fun rgb(r: Int, g: Int, b: Int, a: Double = 1.0): Int = Color.argb((a.coerceIn(0.0, 1.0) * 255).toInt(), r.coerceIn(0, 255), g.coerceIn(0, 255), b.coerceIn(0, 255))
fun withAlpha(c: Int, a: Double): Int = (c and 0x00ffffff) or ((a.coerceIn(0.0, 1.0) * 255).toInt() shl 24)
fun css(s: String): Int = try { rgb(s.trimStart('#').toInt(16)) } catch (_: Exception) { Color.WHITE }

enum class Blend { normal, add, screen }

/** Paints, soft textures and drawing calls the battle scene shares. One per scene, used on the UI thread. */
class Gfx {
    val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    val bmp = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
    val text = Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER }
    private val tints = HashMap<Int, PorterDuffColorFilter>()
    val rect = RectF()
    private val src = Rect()

    /** White round fades: tinted by colour when drawn. */
    val glow = radial(128, floatArrayOf(0f, 0.35f, 1f), floatArrayOf(1f, 0.45f, 0f))
    val disc = radial(64, floatArrayOf(0f, 0.92f, 1f), floatArrayOf(1f, 1f, 0f))
    val soft = radial(64, floatArrayOf(0f, 1f), floatArrayOf(1f, 0f))
    val streak: Bitmap = Bitmap.createBitmap(64, 4, Bitmap.Config.ARGB_8888).also { b ->
        val p = Paint().apply { shader = LinearGradient(0f, 0f, 64f, 0f, Color.TRANSPARENT, Color.WHITE, Shader.TileMode.CLAMP) }
        Canvas(b).drawRect(0f, 0f, 64f, 4f, p)
    }

    private fun radial(px: Int, stops: FloatArray, alphas: FloatArray): Bitmap {
        val b = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888)
        val colors = IntArray(stops.size) { Color.argb((alphas[it] * 255).toInt(), 255, 255, 255) }
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { shader = RadialGradient(px / 2f, px / 2f, px / 2f, colors, stops, Shader.TileMode.CLAMP) }
        Canvas(b).drawRect(0f, 0f, px.toFloat(), px.toFloat(), p)
        return b
    }

    fun tint(color: Int): PorterDuffColorFilter {
        val key = color or 0xff000000.toInt()
        return tints.getOrPut(key) { PorterDuffColorFilter(key, PorterDuff.Mode.SRC_IN) }
    }

    fun blend(p: Paint, b: Blend) {
        if (Build.VERSION.SDK_INT >= 29) {
            p.blendMode = when (b) { Blend.normal -> null; Blend.add -> BlendMode.PLUS; Blend.screen -> BlendMode.SCREEN }
        } else {
            p.xfermode = when (b) { Blend.normal -> null; Blend.add -> PorterDuffXfermode(PorterDuff.Mode.ADD); Blend.screen -> PorterDuffXfermode(PorterDuff.Mode.SCREEN) }
        }
    }

    /** A painted frame with its origin at (x, y): scaled, then turned clockwise by `rot` radians. */
    fun sprite(c: Canvas, f: ArtFrame?, x: Double, y: Double, sx: Double = 1.0, sy: Double = 1.0, rot: Double = 0.0, alpha: Double = 1.0, blend: Blend = Blend.normal) {
        if (f == null || alpha <= 0.001) return
        c.save()
        c.translate(x.toFloat(), y.toFloat())
        if (rot != 0.0) c.rotate(Math.toDegrees(rot).toFloat())
        if (sx != 1.0 || sy != 1.0) c.scale(sx.toFloat(), sy.toFloat())
        bmp.alpha = (alpha.coerceIn(0.0, 1.0) * 255).toInt()
        bmp.colorFilter = null
        blend(bmp, blend)
        c.drawBitmap(f.page, f.src, f.dst, bmp)
        blend(bmp, Blend.normal)
        c.restore()
    }

    /** A soft round texture, tinted, centred on (x, y), `w` by `h` world units. */
    fun soft(c: Canvas, tex: Bitmap, x: Double, y: Double, w: Double, h: Double, color: Int, alpha: Double, blend: Blend = Blend.add) {
        if (alpha <= 0.001 || w <= 0 || h <= 0) return
        bmp.colorFilter = tint(color)
        bmp.alpha = (alpha.coerceIn(0.0, 1.0) * 255).toInt()
        blend(bmp, blend)
        rect.set((x - w / 2).toFloat(), (y - h / 2).toFloat(), (x + w / 2).toFloat(), (y + h / 2).toFloat())
        src.set(0, 0, tex.width, tex.height)
        c.drawBitmap(tex, src, rect, bmp)
        bmp.colorFilter = null
        blend(bmp, Blend.normal)
    }

    /** A glow sprite as the iOS scene's glowSprite: radius `r`, added light. */
    fun glow(c: Canvas, x: Double, y: Double, r: Double, color: Int, alpha: Double) = soft(c, glow, x, y, r * 2, r * 2, color, alpha, Blend.add)

    fun ellipseFill(c: Canvas, x: Double, y: Double, rx: Double, ry: Double, color: Int, blend: Blend = Blend.normal) {
        fill.color = color
        blend(fill, blend)
        rect.set((x - rx).toFloat(), (y - ry).toFloat(), (x + rx).toFloat(), (y + ry).toFloat())
        c.drawOval(rect, fill)
        blend(fill, Blend.normal)
    }

    fun ellipseStroke(c: Canvas, x: Double, y: Double, rx: Double, ry: Double, color: Int, width: Double, dash: FloatArray? = null, phase: Float = 0f, blend: Blend = Blend.normal) {
        setStroke(color, width, dash, phase, blend)
        rect.set((x - rx).toFloat(), (y - ry).toFloat(), (x + rx).toFloat(), (y + ry).toFloat())
        c.drawOval(rect, stroke)
        resetStroke()
    }

    fun setStroke(color: Int, width: Double, dash: FloatArray? = null, phase: Float = 0f, blend: Blend = Blend.normal, cap: Paint.Cap = Paint.Cap.BUTT) {
        stroke.color = color
        stroke.strokeWidth = width.toFloat()
        stroke.pathEffect = dash?.let { DashPathEffect(it, phase) }
        stroke.strokeCap = cap
        stroke.strokeJoin = Paint.Join.ROUND
        blend(stroke, blend)
    }

    fun resetStroke() {
        stroke.pathEffect = null
        blend(stroke, Blend.normal)
    }

    fun path(c: Canvas, p: Path, color: Int, width: Double, dash: FloatArray? = null, phase: Float = 0f, blend: Blend = Blend.normal, cap: Paint.Cap = Paint.Cap.ROUND) {
        setStroke(color, width, dash, phase, blend, cap)
        c.drawPath(p, stroke)
        resetStroke()
    }

    /** Text with a dark outline, centred on x, sitting on the baseline at y. */
    fun outlined(c: Canvas, s: String, x: Double, y: Double, size: Double, color: Int, face: android.graphics.Typeface, outline: Double, alpha: Double = 1.0) {
        text.typeface = face
        text.textSize = size.toFloat()
        text.style = Paint.Style.STROKE
        text.strokeWidth = (size * outline).toFloat()
        text.strokeJoin = Paint.Join.ROUND
        text.color = rgb(0, 0, 0, 0.8 * alpha)
        c.drawText(s, x.toFloat(), y.toFloat(), text)
        text.style = Paint.Style.FILL
        text.color = withAlpha(color, alpha)
        c.drawText(s, x.toFloat(), y.toFloat(), text)
    }

    companion object {
        /** A picture covering the world, drawn at a small size and stretched: the vignette and the low sun. */
        fun worldWash(draw: (Canvas, Float) -> Unit): Bitmap {
            val b = Bitmap.createBitmap(320, 180, Bitmap.Config.ARGB_8888)
            val k = 320f / World.width.toFloat()
            draw(Canvas(b), k)
            return b
        }

        fun vignette(): Bitmap = worldWash { c, k ->
            val W = World.width.toFloat(); val H = World.height.toFloat()
            // The web draws a radial fade from an inner circle; this keeps the same reach.
            val inner = H * 0.3f * k
            val outer = W * 0.75f * k
            val p = Paint().apply {
                shader = RadialGradient(W / 2 * k, H * 0.53f * k, outer, intArrayOf(Color.TRANSPARENT, Color.TRANSPARENT, Color.BLACK), floatArrayOf(0f, inner / outer, 1f), Shader.TileMode.CLAMP)
            }
            c.drawRect(0f, 0f, 320f, 180f, p)
        }

        fun sun(r: Int, g: Int, b: Int, a: Double): Bitmap = worldWash { c, k ->
            val W = World.width.toFloat()
            val cx = W * 0.92f * k; val cy = -60f * k
            val outer = W * 1.1f * k
            val start = 40f * k
            val p = Paint().apply {
                shader = RadialGradient(cx, cy, outer, intArrayOf(rgb(r, g, b, a), rgb(r, g, b, a), rgb(255, 225, 160, 0.0)), floatArrayOf(0f, start / outer, 1f), Shader.TileMode.CLAMP)
            }
            c.drawRect(0f, 0f, 320f, 180f, p)
        }
    }
}
