import Foundation

/// A point in world space. The world is 1280 by 720 with y pointing down, the same as the web game.
public struct Vec: Equatable, Codable, Sendable {
    public var x: Double
    public var y: Double
    public init(_ x: Double, _ y: Double) { self.x = x; self.y = y }

    // Stored as [x, y] in the game data.
    public init(from decoder: Decoder) throws {
        var c = try decoder.unkeyedContainer()
        x = try c.decode(Double.self)
        y = try c.decode(Double.self)
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.unkeyedContainer()
        try c.encode(x)
        try c.encode(y)
    }
}

public enum World {
    public static let width = 1280.0
    public static let height = 720.0
    /// The game is drawn in a 3/4 view: ranges are ellipses, squashed by this factor on y.
    public static let ySquash = 1.25
}

/// The same answer as JavaScript's `Math.hypot`, bit for bit, so the engine plays exactly like the web build.
@inline(__always)
public func hypot2(_ a: Double, _ b: Double) -> Double {
    let x = abs(a), y = abs(b)
    let m = max(x, y)
    if m == 0 { return 0 }
    if m == .infinity { return .infinity }
    var sum = 0.0, comp = 0.0
    for v in [x, y] {
        let n = v / m
        let summand = n * n - comp
        let pre = sum + summand
        comp = (pre - sum) - summand
        sum = pre
    }
    return sum.squareRoot() * m
}

/// Distance in the 3/4 view, where ranges are ellipses.
@inline(__always)
public func ell(_ dx: Double, _ dy: Double) -> Double { hypot2(dx, dy * World.ySquash) }

/// JavaScript's `Math.round`: halves round up, toward positive infinity.
@inline(__always)
public func jsRound(_ v: Double) -> Double {
    let f = v.rounded(.down)
    return v - f >= 0.5 ? f + 1 : f
}

/// JavaScript's `Math.sign` for finite numbers.
@inline(__always)
public func jsSign(_ v: Double) -> Double { v > 0 ? 1 : v < 0 ? -1 : 0 }

@inline(__always)
public func clamp(_ v: Double, _ lo: Double, _ hi: Double) -> Double { max(lo, min(hi, v)) }

/// Small seeded random source (mulberry32), the same sequence as the web game.
public struct Rng: Sendable {
    private var a: UInt32
    public init(seed: Int) { a = UInt32(truncatingIfNeeded: seed) }
    public mutating func next() -> Double {
        a = a &+ 0x6d2b79f5
        var t = a
        t = (t ^ (t >> 15)) &* (t | 1)
        t ^= t &+ ((t ^ (t >> 7)) &* (t | 61))
        return Double(t ^ (t >> 14)) / 4294967296
    }
}

/// Stable sort, like JavaScript's `Array.prototype.sort`.
public extension Array {
    func stableSorted(by less: (Element, Element) -> Bool) -> [Element] {
        enumerated().sorted { l, r in
            if less(l.element, r.element) { return true }
            if less(r.element, l.element) { return false }
            return l.offset < r.offset
        }.map(\.element)
    }
}
