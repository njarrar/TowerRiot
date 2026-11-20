package com.njarrar.towerriot.engine

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/** A point in world space. The world is 1280 by 720 with y pointing down, the same as the web game. */
@Serializable(with = VecSerializer::class)
data class Vec(val x: Double, val y: Double)

/** Stored as [x, y] in the game data. */
object VecSerializer : KSerializer<Vec> {
    private val list = ListSerializer(Double.serializer())
    override val descriptor: SerialDescriptor = list.descriptor
    override fun serialize(encoder: Encoder, value: Vec) = list.serialize(encoder, listOf(value.x, value.y))
    override fun deserialize(decoder: Decoder): Vec {
        val l = list.deserialize(decoder)
        return Vec(l[0], l[1])
    }
}

object World {
    const val width = 1280.0
    const val height = 720.0
    /** The game is drawn in a 3/4 view: ranges are ellipses, squashed by this factor on y. */
    const val ySquash = 1.25
}

/** The same answer as JavaScript's `Math.hypot`, bit for bit, so the engine plays exactly like the web build. */
fun hypot2(a: Double, b: Double): Double {
    val x = abs(a)
    val y = abs(b)
    val m = max(x, y)
    if (m == 0.0) return 0.0
    if (m == Double.POSITIVE_INFINITY) return Double.POSITIVE_INFINITY
    var sum = 0.0
    var comp = 0.0
    for (v in doubleArrayOf(x, y)) {
        val n = v / m
        val summand = n * n - comp
        val pre = sum + summand
        comp = (pre - sum) - summand
        sum = pre
    }
    return sqrt(sum) * m
}

/** Distance in the 3/4 view, where ranges are ellipses. */
fun ell(dx: Double, dy: Double): Double = hypot2(dx, dy * World.ySquash)

/** JavaScript's `Math.round`: halves round up, toward positive infinity. */
fun jsRound(v: Double): Double {
    val f = floor(v)
    return if (v - f >= 0.5) f + 1 else f
}

/** JavaScript's `Math.sign` for finite numbers. */
fun jsSign(v: Double): Double = if (v > 0) 1.0 else if (v < 0) -1.0 else 0.0

fun clamp(v: Double, lo: Double, hi: Double): Double = max(lo, min(hi, v))

/** Small seeded random source (mulberry32), the same sequence as the web game. */
class Rng(seed: Int) {
    private var a: Int = seed

    fun next(): Double {
        a += 0x6d2b79f5
        var t = a
        t = (t xor (t ushr 15)) * (t or 1)
        t = t xor (t + (t xor (t ushr 7)) * (t or 61))
        val r = t xor (t ushr 14)
        return (r.toLong() and 0xffffffffL).toDouble() / 4294967296.0
    }
}
