import Foundation

/// Catmull-Rom smoothing of control points, `steps` samples per span.
public func smooth(_ ctrl: [Vec], steps: Int = 12) -> [Vec] {
    var out: [Vec] = []
    guard ctrl.count > 1 else { return ctrl }
    for i in 0..<(ctrl.count - 1) {
        let p0 = ctrl[max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[min(ctrl.count - 1, i + 2)]
        for k in 0..<steps {
            let t = Double(k) / Double(steps), t2 = t * t, t3 = t2 * t
            func axis(_ a: Double, _ b: Double, _ c: Double, _ d: Double) -> Double {
                0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
            }
            out.append(Vec(axis(p0.x, p1.x, p2.x, p3.x), axis(p0.y, p1.y, p2.y, p3.y)))
        }
    }
    out.append(ctrl[ctrl.count - 1])
    return out
}

/// A polyline measured by distance, so a foe can sit at "d pixels along the road".
public struct Path: Sendable {
    public struct Seg: Sendable { public let a: Vec, b: Vec, l: Double, s: Double }
    public struct Point: Sendable { public let x: Double, y: Double, dir: Double }

    public let id: String
    public let pts: [Vec]
    public let segs: [Seg]
    public let tot: Double

    public init(id: String, pts: [Vec]) {
        self.id = id
        self.pts = pts
        var segs: [Seg] = []
        var tot = 0.0
        for i in 0..<max(0, pts.count - 1) {
            let a = pts[i], b = pts[i + 1], l = hypot2(b.x - a.x, b.y - a.y)
            if l == 0 { continue }
            segs.append(Seg(a: a, b: b, l: l, s: tot))
            tot += l
        }
        self.segs = segs
        self.tot = tot
    }

    /// Point at distance d along the path. dir is +1 when the path heads right, -1 when it heads left.
    public func point(at d: Double) -> Point {
        let dd = max(0, min(tot, d))
        var lo = 0, hi = segs.count - 1
        while lo < hi {
            let mid = (lo + hi + 1) >> 1
            if segs[mid].s <= dd { lo = mid } else { hi = mid - 1 }
        }
        let q = segs[lo]
        let t = q.l != 0 ? (dd - q.s) / q.l : 0
        let sign = jsSign(q.b.x - q.a.x)
        return Point(x: q.a.x + (q.b.x - q.a.x) * t, y: q.a.y + (q.b.y - q.a.y) * t, dir: sign == 0 ? 1 : sign)
    }

    /// Shortest distance from (x, y) to the polyline.
    public func distance(toX x: Double, y: Double) -> Double {
        var best = Double.infinity
        for q in segs {
            let dx = q.b.x - q.a.x, dy = q.b.y - q.a.y
            let t = max(0, min(1, ((x - q.a.x) * dx + (y - q.a.y) * dy) / (q.l * q.l)))
            best = min(best, hypot2(q.a.x + dx * t - x, q.a.y + dy * t - y))
        }
        return best
    }

    /// Distance along the path of the sample nearest to a point.
    public func nearestDistance(to at: Vec) -> Double {
        var best = Double.infinity, bd = 0.0, d = 0.0
        while d <= tot {
            let q = point(at: d)
            let k = hypot2(q.x - at.x, q.y - at.y)
            if k < best { best = k; bd = d }
            d += 6
        }
        return bd
    }
}

/// Even-odd point in polygon test.
public func inPolygon(_ pt: Vec, _ poly: [Vec]) -> Bool {
    var inside = false
    var j = poly.count - 1
    for i in 0..<poly.count {
        let a = poly[i], b = poly[j]
        if (a.y > pt.y) != (b.y > pt.y) && pt.x < (b.x - a.x) * (pt.y - a.y) / (b.y - a.y) + a.x { inside.toggle() }
        j = i
    }
    return inside
}
