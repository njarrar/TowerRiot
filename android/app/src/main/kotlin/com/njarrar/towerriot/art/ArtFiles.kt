package com.njarrar.towerriot.art

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.core.content.res.ResourcesCompat
import com.njarrar.towerriot.R
import com.njarrar.towerriot.engine.Vec
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** The art baked from the web painters by `npm run native:art`, shared with the iOS app. All of it ships in the APK. */
object ArtFiles {
    private lateinit var ctx: Context
    private val images = HashMap<String, ImageBitmap?>()
    private val bitmaps = HashMap<String, Bitmap?>()

    fun init(context: Context) { ctx = context.applicationContext }

    private fun decode(file: String, hardware: Boolean): Bitmap? = try {
        ctx.assets.open(file).use { s ->
            val o = BitmapFactory.Options()
            o.inPreferredConfig = if (hardware) Bitmap.Config.HARDWARE else Bitmap.Config.ARGB_8888
            BitmapFactory.decodeStream(s, null, o)
        }
    } catch (_: Exception) { null }

    /** A baked PNG for the menus. */
    fun image(name: String): ImageBitmap? = images.getOrPut(name) { decode("$name.png", false)?.asImageBitmap() }

    /** A bitmap for the battle canvas, kept on the GPU where the phone allows. */
    fun bitmap(file: String): Bitmap? = bitmaps.getOrPut(file) { decode(file, true) ?: decode(file, false) }

    fun readText(file: String): String? = try { ctx.assets.open(file).bufferedReader().use { it.readText() } } catch (_: Exception) { null }

    /** The painted ground; Variant B has its own where one was baked. */
    fun ground(stage: Int, alt: Boolean = false): Bitmap? =
        (if (alt) bitmap(String.format("ground-%02d-alt.jpg", stage)) else null) ?: bitmap(String.format("ground-%02d.jpg", stage))

    fun font(id: Int): Typeface = ResourcesCompat.getFont(ctx, id) ?: Typeface.DEFAULT_BOLD
    val cinzel: Typeface by lazy { font(R.font.cinzel_extrabold) }
    val barlow: Typeface by lazy { font(R.font.barlow_extrabold) }

    /** Lantern posts and smoothed water lines for each stage, as the web scene places them. */
    class MapMeta(val posts: List<Vec>, val waters: List<Pair<Double, List<Vec>>>)

    val maps: Map<Int, MapMeta> by lazy {
        try {
            val text = readText("maps.json") ?: return@lazy emptyMap()
            val o = Json.parseToJsonElement(text).jsonObject
            o.mapNotNull { (k, v) ->
                val id = k.toIntOrNull() ?: return@mapNotNull null
                val m = v.jsonObject
                val posts = m["posts"]?.jsonArray?.map { p -> val a = p.jsonArray; Vec(a[0].jsonPrimitive.double, a[1].jsonPrimitive.double) } ?: emptyList()
                val waters = m["waters"]?.jsonArray?.map { w ->
                    val wo = w.jsonObject
                    val pts = wo["pts"]!!.jsonArray.mapNotNull { p -> val a = p.jsonArray; if (a.size >= 2) Vec(a[0].jsonPrimitive.double, a[1].jsonPrimitive.double) else null }
                    wo["w"]!!.jsonPrimitive.double to pts
                } ?: emptyList()
                id to MapMeta(posts, waters)
            }.toMap()
        } catch (_: Exception) { emptyMap() }
    }
}

/** One painted picture on the sprite sheet: where it sits on its page, its size in world units, and its origin. */
class ArtFrame(val page: Bitmap, val src: Rect, val w: Float, val h: Float, val ax: Float, val ay: Float) {
    /** Where to draw it with its origin at (0, 0). */
    val dst = RectF(-ax, -ay, -ax + w, -ay + h)
}

/** The sprite sheet: every tower, foe, Wren and map piece. */
object Sprites {
    private val frames: Map<String, ArtFrame> by lazy { try { load() } catch (_: Exception) { emptyMap() } }

    private fun load(): Map<String, ArtFrame> {
        val json = ArtFiles.readText("sprites.json") ?: return emptyMap()
        val o = Json.parseToJsonElement(json).jsonObject
        val pages = (o["pages"] as JsonArray).map { p -> ArtFiles.bitmap((p as JsonArray)[0].jsonPrimitive.content) }
        val out = HashMap<String, ArtFrame>()
        for ((name, v) in (o["frames"] as JsonObject)) {
            val f = v.jsonArray.map { it.jsonPrimitive.double }
            if (f.size != 8) continue
            val page = pages.getOrNull(f[0].toInt()) ?: continue
            val s = f[7]
            val src = Rect(f[1].toInt(), f[2].toInt(), (f[1] + f[3]).toInt(), (f[2] + f[4]).toInt())
            out[name] = ArtFrame(page, src, (f[3] / s).toFloat(), (f[4] / s).toFloat(), f[5].toFloat(), f[6].toFloat())
        }
        return out
    }

    operator fun get(name: String): ArtFrame? = frames[name]
    fun get(name: String, fallback: String): ArtFrame? = frames[name] ?: frames[fallback]
}
