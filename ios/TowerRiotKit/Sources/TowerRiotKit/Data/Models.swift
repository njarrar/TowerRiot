import Foundation

// The game's data, decoded from Resources/game-data.json.
// That file is made from the web game's TypeScript data (see tests/native-data.test.ts),
// so both games always share the same towers, foes, stages and trees.

public enum TowerKind: String, Codable, CaseIterable, Sendable { case watch, cannon, bell, pylon, roots, beacon }
public enum Element: String, Codable, CaseIterable, Sendable { case pierce, fire, frost, storm, nature, hero }
public enum Rounds: String, Codable, CaseIterable, Sendable { case ember, frost, storm }
public enum SplitId: String, Codable, Sendable { case a, b }
public enum SkillKey: String, Codable, CaseIterable, Sendable { case q, w, e, r }
public enum ItemId: String, Codable, CaseIterable, Sendable { case boots, blade, ring, plate, cleave, lantern, dawnspear, emberspear, dawnmantle, seconddawn }
public enum RuneKind: String, Codable, CaseIterable, Sendable { case haste, double, regen, bounty }
public enum OathId: String, Codable, CaseIterable, Hashable, Sendable { case twinRifts, shiftingEarth, longNight }
public enum StageVariant: String, Codable, CaseIterable, Sendable { case standard, alt }

public struct RubbleDef: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable { case ruin, crane, boulder, slag }
    public let kind: Kind
    public let cost: Int
    /// Optional seconds for Wren standing within 48 px to clear this plot for free (0 gold).
    public let holdSec: Double?
    public init(kind: Kind, cost: Int, holdSec: Double? = nil) { self.kind = kind; self.cost = cost; self.holdSec = holdSec }
}

public enum EnemyKind: String, Codable, CaseIterable, Sendable {
    case grub, skitter, shell, moth, warden, mender, shade, splitter, sapper, burrower, ashmoth, elite
    case husk, hound, glasshide, veilmoth, ram, herald
    case mireking, tidewyrm, colossus, queen
}

public struct SplitDef: Codable, Sendable {
    public let id: SplitId
    public let name: String
    public let desc: String
    public let cost: Double
    public let masteryCost: Double
    public let masteryName: String
    public let masteryDesc: String
    public let dmgMul: Double
    public let rangeMul: Double
    public let rateMul: Double
    public let crit: Double?
    public let shells: Int?
    public let jumpsDelta: Int?
    public let jumpsOverride: Int?
    public let splashMul: Double?
}

public struct TowerDef: Codable, Sendable {
    public let kind: TowerKind
    public let name: String
    public let blurb: String
    public let element: Element
    /// Cost to build (index 0) and to reach level 2 and 3.
    public let cost: [Double]
    public let dmg: [Double]
    public let range: [Double]
    /// Seconds between attacks.
    public let rate: [Double]
    public let hitsFlying: Bool
    public let splits: [SplitDef]
}

public struct Traits: Codable, Sendable {
    public struct Split: Codable, Sendable { public let kind: EnemyKind; public let n: Int }
    public struct Summon: Codable, Sendable { public let kind: EnemyKind; public let n: Int; public let every: Double }
    public struct Dive: Codable, Sendable { public let every: Double; public let dur: Double }
    public struct Lunge: Codable, Sendable { public let every: Double; public let dur: Double; public let mult: Double }
    public struct Panes: Codable, Sendable { public let n: Int; public let regrow: Double }
    public struct Stamp: Codable, Sendable { public let every: Double; public let r: Double; public let stun: Double }
    public struct Aura: Codable, Sendable { public let r: Double; public let cut: Double }
    public let shield: Double?
    public let heal: Double?
    public let stealth: Bool?
    public let splitInto: Split?
    public let sapper: Bool?
    /// Seconds underground, then seconds on the surface.
    public let burrow: [Double]?
    public let armor: Double?
    public let plated: Double?
    public let summon: Summon?
    public let dive: Dive?
    /// Every `every` seconds it runs at `mult` speed for `dur` seconds, unless slowed, held or frozen.
    public let lunge: Lunge?
    /// Glass panes: each hit breaks one pane and does no harm. A lost pane grows back after `regrow` seconds.
    public let panes: Panes?
    /// Every `every` seconds it stamps: towers within `r` px stop for `stun` seconds, unless it is held.
    public let stamp: Stamp?
    /// Only Wren's lantern, a Beacon, the lighthouse or Sunrise reveal it.
    public let veil: Bool?
    /// Foes within `r` px take `cut` less damage from the element used most this wave.
    public let aura: Aura?
    public let phases: [Double]?
    public let boss: Bool?
}

public struct EnemyDef: Codable, Sendable {
    public let kind: EnemyKind
    public let name: String
    public let hp: Double
    public let speed: Double
    public let gold: Double
    public let leak: Int
    public let flying: Bool?
    public let takes: [String: Double]?
    public let dps: Double
    public let bar: Double
    public let size: Double
    public let traits: Traits?
    public let blurb: String
    /// The towers that beat it, for the field guide and the first time it shows up.
    public let answer: String

    public var isFlying: Bool { flying ?? false }
    public var isBoss: Bool { traits?.boss ?? false }
}

public struct HeroDef: Codable, Sendable {
    public let maxLevel: Int
    public let hp: Double, hpPerLevel: Double
    public let dmg: Double, dmgPerLevel: Double
    public let atkRate: Double
    public let reach: Double, leash: Double, aggro: Double
    public let speed: Double
    public let regen: Double
    public let gateRegen: Double, gateRadius: Double
    public let blocks: Int
    public let sight: Double
    public let xpRadius: Double
    /// Share of XP she still gets from kills outside that radius.
    public let xpFar: Double
    public let lastHit: Double
    public let respawnBase: Double
    public let respawnPerLevel: Double

    public func respawn(level: Int) -> Double { respawnBase + Double(level) * respawnPerLevel }
}

/// XP needed to go from `level` to `level + 1`.
public func xpToNext(_ level: Int) -> Double { 50 + 30 * Double(level) }

public struct SkillDef: Codable, Sendable {
    public let key: SkillKey
    public let name: String
    public let desc: String
    public let maxRank: Int
    public let cd: [Double]
    /// Hero level needed for each rank (index rank - 1).
    public let needLevel: [Int]
}

public struct SweepDef: Codable, Sendable { public let dmg: [Double]; public let radius: Double }
public struct SnareDef: Codable, Sendable { public let hold: [Double]; public let dmg: [Double]; public let radius: Double; public let range: Double; public let burnSec: Double; public let burnDpsMul: Double }
public struct AttuneDef: Codable, Sendable { public let rate: [Double]; public let radius: Double }
public struct SunriseDef: Codable, Sendable { public let dur: [Double] }

public struct ItemDef: Codable, Sendable {
    public let id: ItemId
    public let name: String
    public let cost: Double
    public let desc: String
    /// Stage you must clear before the shop sells it.
    public let after: Int
    public let speed: Double?, dmg: Double?, regen: Double?, hp: Double?, armor: Double?, atkSpeed: Double?
    public let cleave: Double?, sight: Double?, sunder: Double?, auraDmg: Double?, revive: Bool?
}

public struct RuneDef: Codable, Sendable { public let kind: RuneKind; public let name: String; public let desc: String; public let dur: Double; public let color: String }

public struct Effect: Codable, Sendable {
    public let k: String
    public let tower: TowerKind?
    public let round: Rounds?
    public let v: Double?
}

public struct TreeNode: Codable, Sendable {
    public let id: String
    public let name: String
    public let desc: String
    public let cost: Int
    public let req: String?
    public let after: Int?
    public let excl: String?
    public let effect: Effect
}
public struct TreeDef: Codable, Sendable { public let id: String; public let name: String; public let blurb: String; public let after: Int; public let nodes: [TreeNode] }
public struct RegionDef: Codable, Sendable { public let name: String; public let rule: String; public let color: String }

public struct Road: Codable, Sendable {
    public let id: String
    public let spawn: String
    public var ctrl: [Vec]
    public let w: Double
    public var openAtWave: Int?
    public var closeAtWave: Int?
    public var openOnPhase: Int?
}

public struct Plot: Codable, Sendable {
    public let at: Vec
    public var gear: SplitId?
    public var sinkAt: Int?
    public var openAtWave: Int?
    public var rubble: RubbleDef?
}

public struct Water: Codable, Sendable {
    public let id: String?
    public let ctrl: [Vec]
    public let w: Double
    public var drainAtWave: Int?
}

/// A timed rule that closes roads: a tide over a ford, lava over a pass.
public struct Shift: Codable, Sendable {
    public let kind: String
    public let closes: [String]
    public var every: Double
    public var start: Double
    public var dur: Double
    public let at: Vec
    public let r: Double
    public let label: String
}
public struct Barrier: Codable, Sendable { public let road: String; public let at: Double; public let hp: Double }
public struct Belt: Codable, Sendable { public let road: String; public let from: Double; public let to: Double; public let mult: Double }
public struct Vent: Codable, Sendable { public let road: String; public let at: Double; public let every: Double; public let dmg: Double }

public struct SwitchDef: Codable, Sendable {
    public enum Mode: String, Codable, Sendable { case fork, gate, belt }
    public let id: String
    public let label: String
    public let at: Vec
    public let mode: Mode
    public let closesA: [String]?
    public let closesB: [String]?
    public let dur: Double?
    public let cd: Double
    public let targetRoad: String?
    public let beltMult: Double?
}

public struct TerraformDef: Codable, Sendable {
    public enum Kind: String, Codable, Sendable { case drain, flood, quakelow, raisehigh, overdrivebelts }
    public let atWave: Int?
    public let atPhase: Int?
    public let kind: Kind
    public let label: String
    public let waters: [String]?
    public let openRoads: [String]?
    public let closeRoads: [String]?
    public let openPlots: [Int]?
    public let sinkPlots: [Int]?
    public let highPoly: [Vec]?
}

public struct PortalDef: Codable, Sendable {
    public enum Kind: String, Codable, Sendable { case tunnel, rift, chute }
    public let id: String
    public let kind: Kind
    public let fromRoad: String
    public let fromAt: Double
    public let toRoad: String
    public let toAt: Double
    public var openAtWave: Int?
    public let everyNth: Int?
    public let groundOnly: Bool?
}

public struct StageAlt: Codable, Sendable {
    public struct RubblePlot: Codable, Sendable {
        public let plot: Int
        public let kind: RubbleDef.Kind
        public let cost: Int
        public let holdSec: Double?
    }
    public let name: String
    public let twist: String
    public let reverseRoads: [String]?
    public let openAtWave: [String: Int]?
    public let rubblePlots: [RubblePlot]?
    public let sinkPlots: [Int]?
    public let swapGears: Bool?
    public let heroStart: Vec?
    public let night: Bool?
    public let weather: String?
    public let adaptEvery: Int?
    /// Every portal opens on this wave instead of its own.
    public let portalOpenAtWave: Int?
    /// Tides, lava and steam cycle this much faster or slower (0.8 = every 40 s instead of 50 s).
    public let shiftEveryMul: Double?
    /// Foe health for this layout, on top of the stage's own `hpMul`.
    public let hpMul: Double?
}

public struct Group: Codable, Sendable { public let kind: EnemyKind; public let n: Int; public let gap: Double; public let spawn: String?; public let delay: Double }
public struct WaveDef: Codable, Sendable { public let hint: String; public let groups: [Group] }

public struct StageDef: Codable, Sendable {
    public let id: Int
    public let name: String
    public let region: Int
    public var twist: String
    public let newFoe: String
    public let unlocks: String
    public let startGold: Int
    public let lives: Int
    public let towers: [TowerKind]
    public var roads: [Road]
    public var waters: [Water]
    public let lava: Bool?
    public let high: [Vec]?
    public var plots: [Plot]
    /// Each bridge is [x, y, angle, half length].
    public let bridges: [[Double]]
    /// Where runes appear.
    public let rune: Vec
    public var heroStart: Vec
    public var shifts: [Shift]?
    public let barriers: [Barrier]?
    public let belts: [Belt]?
    public let vents: [Vent]?
    public let switches: [SwitchDef]?
    public let terraforms: [TerraformDef]?
    public var portals: [PortalDef]?
    public let alt: StageAlt?
    public var weather: String?
    /// Night falls on even waves (or all waves under longNight).
    public var night: Bool?
    /// A fixed lighthouse that lights a wide circle.
    public let lighthouse: Vec?
    /// Extra foe health for this stage, on top of the usual climb.
    public var hpMul: Double?
    public var adaptEvery: Int?
    public var waves: [WaveDef]

    public var isLava: Bool { lava ?? false }

    /// Rift ids in the order they first appear, each with the roads that leave it.
    public var spawns: [(id: String, roads: [Road])] {
        var out: [(id: String, roads: [Road])] = []
        for r in roads {
            if let i = out.firstIndex(where: { $0.id == r.spawn }) { out[i].roads.append(r) } else { out.append((r.spawn, [r])) }
        }
        return out
    }

    private static func reverseCtrl(_ ctrl: [Vec]) -> [Vec] {
        var rev = Array(ctrl.reversed())
        if let last = rev.indices.last {
            rev[last] = Vec(clamp(rev[last].x, 85, 1195), clamp(rev[last].y, 115, 650))
        }
        return rev
    }

    /// Speed a shift cycle up or down. The phase of each shift scales with it, and a cycle never
    /// gets so short that two half-phase shifts overlap.
    private static func scaleShifts(_ shifts: [Shift], _ mul: Double) -> [Shift] {
        shifts.map { s in
            var c = s
            let every = max((s.dur * 2.1).rounded(.up), jsRound(s.every * mul))
            c.every = every
            c.start = jsRound(s.start * every / s.every)
            return c
        }
    }

    /// Twin Rifts: every foe is this much tougher. More foes would also pay more gold, which made the oath easier, not harder.
    public static let twinRiftsHp = 1.15
    /// Shifting Earth: every tide, lava flow and steam burst holds its road shut for this share of its usual time.
    public static let shiftingEarthDur = 0.6
    /// Shifting Earth: a tower on a sinking plot pays back this share of its cost, not all of it.
    public static let shiftingEarthRefund = 0.5

    /// A road that now opens before any wave is sent to its rift would stand empty.
    /// Each wave from its new opening until the first wave already aimed at that rift sends a splinter group there.
    private static func seedEarlyRifts(_ out: StageDef, _ orig: StageDef) -> [WaveDef] {
        var list: [[Group]] = out.waves.map(\.groups)
        var seeded = Set<String>()
        for r in out.roads {
            guard let was = orig.roads.first(where: { $0.id == r.id }) else { continue }
            if r.openOnPhase != nil || seeded.contains(r.spawn) { continue }
            let now = r.openAtWave ?? 1
            if now >= (was.openAtWave ?? 1) && was.openOnPhase == nil { continue }
            // Untagged stage: the rift is shared and already fed.
            guard let first = list.firstIndex(where: { groups in groups.contains { $0.spawn == r.spawn } }) else { continue }
            seeded.insert(r.spawn)
            var wi = max(0, now - 1)
            while wi < first {
                let crowds: [Group] = list[wi].filter { $0.n >= 3 }.stableSorted { $0.n > $1.n }
                if let crowd = crowds.first {
                    let n = max(2, Int((Double(crowd.n) * 0.4).rounded(.up)))
                    list[wi].append(Group(kind: crowd.kind, n: n, gap: crowd.gap, spawn: r.spawn, delay: crowd.delay + 2))
                }
                wi += 1
            }
        }
        var waves: [WaveDef] = []
        for (i, w) in out.waves.enumerated() { waves.append(WaveDef(hint: w.hint, groups: list[i])) }
        return waves
    }

    /// Shifting Earth: the two open plots closest to a road sink mid-battle (towers on them are refunded in full).
    private static func shiftingPlots(_ out: StageDef) -> [Int] {
        var bends: [Vec] = []
        for r in out.roads where r.openOnPhase == nil {
            var i = 1
            while i < r.ctrl.count - 1 { bends.append(r.ctrl[i]); i += 1 }
        }
        struct Cand { let i: Int; let pl: Plot; let d: Double }
        var all: [Cand] = []
        for (i, pl) in out.plots.enumerated() {
            var d = Double.infinity
            for b in bends { d = min(d, hypot2(b.x - pl.at.x, b.y - pl.at.y)) }
            all.append(Cand(i: i, pl: pl, d: d))
        }
        let open: [Cand] = all.filter { c in
            c.pl.sinkAt == nil && c.pl.gear == nil && c.pl.rubble == nil && (c.pl.openAtWave ?? 1) <= 1
        }
        let cand: [Cand] = open.stableSorted { l, r in l.d != r.d ? l.d < r.d : l.i < r.i }
        if cand.count < 4 { return [] }
        let a = cand[0]
        let far = cand.first { c in c.i != a.i && hypot2(c.pl.at.x - a.pl.at.x, c.pl.at.y - a.pl.at.y) >= 220 }
        let b = far ?? cand[1]
        return [a.i, b.i]
    }

    /// Apply Replay Variant B (`alt`) and Challenge Oaths deterministically (zero RNG).
    public func resolved(variant: StageVariant = .standard, oaths: [OathId] = []) -> StageDef {
        var out = self
        if variant == .alt, let a = alt {
            out.twist = "\(a.name): \(a.twist)"
            if let rev = a.reverseRoads, !rev.isEmpty {
                let set = Set(rev)
                out.roads = out.roads.map { r in
                    guard set.contains(r.id) else { return r }
                    var copy = r; copy.ctrl = Self.reverseCtrl(r.ctrl); return copy
                }
            }
            if let openMap = a.openAtWave {
                // A road given a wave to open on no longer waits for a boss phase.
                out.roads = out.roads.map { r in
                    guard let w = openMap[r.id] else { return r }
                    var copy = r; copy.openOnPhase = nil; copy.openAtWave = w; return copy
                }
            }
            if let rps = a.rubblePlots {
                for rp in rps where rp.plot >= 0 && rp.plot < out.plots.count {
                    out.plots[rp.plot].rubble = RubbleDef(kind: rp.kind, cost: rp.cost, holdSec: rp.holdSec)
                }
            }
            if let sp = a.sinkPlots {
                for idx in sp where idx >= 0 && idx < out.plots.count {
                    out.plots[idx].sinkAt = out.plots[idx].sinkAt ?? 5
                }
            }
            if a.swapGears == true {
                out.plots = out.plots.map { p in
                    guard let g = p.gear else { return p }
                    var copy = p; copy.gear = g == .a ? .b : .a; return copy
                }
            }
            if let hs = a.heroStart { out.heroStart = hs }
            if let n = a.night { out.night = n }
            if let w = a.weather { out.weather = w }
            if let ae = a.adaptEvery { out.adaptEvery = ae }
            if let pw = a.portalOpenAtWave {
                out.portals = out.portals?.map { var pt = $0; pt.openAtWave = pw; return pt }
            }
            if let mul = a.shiftEveryMul, let sh = out.shifts, !sh.isEmpty { out.shifts = Self.scaleShifts(sh, mul) }
            if let hm = a.hpMul { out.hpMul = (hpMul ?? 1) * hm }
        }
        if oaths.contains(.twinRifts) {
            // Roads and portals wake at once. Plots keep their own schedule: early ground would be a gift, not a challenge.
            // A road a boss breaks open at a health phase still waits for the boss.
            out.roads = out.roads.map { r in
                guard r.openOnPhase == nil else { return r }
                var copy = r; copy.openAtWave = 1; return copy
            }
            out.portals = out.portals?.map { var pt = $0; pt.openAtWave = 1; return pt }
            out.hpMul = (out.hpMul ?? 1) * Self.twinRiftsHp
        }
        if oaths.contains(.shiftingEarth) {
            // A tide that holds foes at a ford is the player's friend, so the oath cuts every closure short.
            if let sh = out.shifts, !sh.isEmpty {
                out.shifts = sh.map { s in
                    var c = s
                    c.dur = max(4, jsRound(s.dur * Self.shiftingEarthDur))
                    return c
                }
            }
            let n = Double(out.waves.count)
            let first = max(2, Int(jsRound(n * 0.4)))
            let at = [first, max(first + 1, Int(jsRound(n * 0.7)))]
            for (k, pi) in Self.shiftingPlots(out).enumerated() { out.plots[pi].sinkAt = at[k] }
        }
        if oaths.contains(.longNight) { out.night = true }
        if variant == .alt || oaths.contains(.twinRifts) { out.waves = Self.seedEarlyRifts(out, self) }
        return out
    }
}
