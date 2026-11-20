package com.njarrar.towerriot.engine

import kotlin.math.max
import kotlin.math.min

/** Catmull-Rom smoothing of control points, `steps` samples per span. */
fun smooth(ctrl: List<Vec>, steps: Int = 12): List<Vec> {
    if (ctrl.size <= 1) return ctrl
    val out = ArrayList<Vec>()
    for (i in 0 until ctrl.size - 1) {
        val p0 = ctrl[max(0, i - 1)]
        val p1 = ctrl[i]
        val p2 = ctrl[i + 1]
        val p3 = ctrl[min(ctrl.size - 1, i + 2)]
        for (k in 0 until steps) {
            val t = k.toDouble() / steps
            val t2 = t * t
            val t3 = t2 * t
            fun axis(a: Double, b: Double, c: Double, d: Double) =
                0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
            out.add(Vec(axis(p0.x, p1.x, p2.x, p3.x), axis(p0.y, p1.y, p2.y, p3.y)))
        }
    }
    out.add(ctrl[ctrl.size - 1])
    return out
}

/** A polyline measured by distance, so a foe can sit at "d pixels along the road". */
class Path(val id: String, val pts: List<Vec>) {
    class Seg(val a: Vec, val b: Vec, val l: Double, val s: Double)
    class Point(val x: Double, val y: Double, val dir: Double)

    val segs: List<Seg>
    val tot: Double

    init {
        val list = ArrayList<Seg>()
        var t = 0.0
        for (i in 0 until max(0, pts.size - 1)) {
            val a = pts[i]
            val b = pts[i + 1]
            val l = hypot2(b.x - a.x, b.y - a.y)
            if (l == 0.0) continue
            list.add(Seg(a, b, l, t))
            t += l
        }
        segs = list
        tot = t
    }

    /** Point at distance d along the path. dir is +1 when the path heads right, -1 when it heads left. */
    fun point(d: Double): Point {
        if (segs.isEmpty()) {
            val p = pts.firstOrNull() ?: Vec(0.0, 0.0)
            return Point(p.x, p.y, 1.0)
        }
        val dd = max(0.0, min(tot, d))
        var lo = 0
        var hi = segs.size - 1
        while (lo < hi) {
            val mid = (lo + hi + 1) shr 1
            if (segs[mid].s <= dd) lo = mid else hi = mid - 1
        }
        val q = segs[lo]
        val t = if (q.l != 0.0) (dd - q.s) / q.l else 0.0
        val sign = jsSign(q.b.x - q.a.x)
        return Point(q.a.x + (q.b.x - q.a.x) * t, q.a.y + (q.b.y - q.a.y) * t, if (sign == 0.0) 1.0 else sign)
    }

    /** Shortest distance from (x, y) to the polyline. */
    fun distanceTo(x: Double, y: Double): Double {
        var best = Double.POSITIVE_INFINITY
        for (q in segs) {
            val dx = q.b.x - q.a.x
            val dy = q.b.y - q.a.y
            val t = max(0.0, min(1.0, ((x - q.a.x) * dx + (y - q.a.y) * dy) / (q.l * q.l)))
            best = min(best, hypot2(q.a.x + dx * t - x, q.a.y + dy * t - y))
        }
        return best
    }

    /** Distance along the path of the sample nearest to a point. */
    fun nearestDistance(at: Vec): Double {
        var best = Double.POSITIVE_INFINITY
        var bd = 0.0
        var d = 0.0
        while (d <= tot) {
            val q = point(d)
            val k = hypot2(q.x - at.x, q.y - at.y)
            if (k < best) { best = k; bd = d }
            d += 6
        }
        return bd
    }

    /** Every local nearest distance to a point (a road that crosses itself passes it more than once). */
    fun allNearestDistances(at: Vec): List<Double> {
        val ds = ArrayList<Double>()
        var prev = Double.POSITIVE_INFINITY; var cur = Double.POSITIVE_INFINITY; var prevD = 0.0
        var best = Double.POSITIVE_INFINITY; var bd = 0.0; var d = 0.0
        while (d <= tot) {
            val q = point(d)
            val k = hypot2(q.x - at.x, q.y - at.y)
            if (k < best) { best = k; bd = d }
            if (cur < prev && cur <= k && cur <= 55) {
                if (ds.none { kotlin.math.abs(it - prevD) < 60 }) ds.add(prevD)
            }
            prev = cur; cur = k; prevD = d
            d += 6
        }
        if (ds.isEmpty()) ds.add(bd)
        return ds
    }
}

/** Even-odd point in polygon test. */
fun inPolygon(pt: Vec, poly: List<Vec>): Boolean {
    var inside = false
    var j = poly.size - 1
    for (i in poly.indices) {
        val a = poly[i]
        val b = poly[j]
        if ((a.y > pt.y) != (b.y > pt.y) && pt.x < (b.x - a.x) * (pt.y - a.y) / (b.y - a.y) + a.x) inside = !inside
        j = i
    }
    return inside
}
