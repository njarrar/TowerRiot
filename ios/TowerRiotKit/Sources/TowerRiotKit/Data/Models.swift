import Foundation

// The game's data, decoded from Resources/game-data.json.
// That file is made from the web game's TypeScript data (see tests/native-data.test.ts),
// so both games always share the same towers, foes, stages and trees.

public enum TowerKind: String, Codable, CaseIterable, Sendable { case watch, cannon, bell, pylon, roots, beacon }
public enum Element: String, Codable, CaseIterable, Sendable { case pierce, fire, frost, storm, nature, hero }
public enum Rounds: String, Codable, CaseIterable, Sendable { case ember, frost, storm }
public enum SplitId: String, Codable, Sendable { case a, b }
public enum SkillKey: String, Codable, CaseIterable, Sendable { case q, w, e, r }
public enum ItemId: String, Codable, CaseIterable, Sendable { case boots, blade, ring, plate, cleave, lantern, dawnspear, seconddawn }
public enum RuneKind: String, Codable, CaseIterable, Sendable { case haste, double, regen, bounty }

public enum EnemyKind: String, Codable, CaseIterable, Sendable {
    case grub, skitter, shell, moth, warden, mender, shade, splitter, sapper, burrower, ashmoth, elite
    case mireking, tidewyrm, colossus, queen
}

public struct SplitDef: Codable, Sendable { public let id: SplitId; public let name: String; public let desc: String; public let cost: Double }

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

    public var isFlying: Bool { flying ?? false }
    public var isBoss: Bool { traits?.boss ?? false }
}

public struct HeroDef: Codable, Sendable {
    public let maxLevel: Int
    public let hp: Double, hpPerLevel: Double
    public let dmg: Double, dmgPerLevel: Double
    public let atkRate: Double
    public let reach: Double, aggro: Double
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

    public func respawn(level: Int) -> Double { respawnBase + Double(level) }
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
public struct SnareDef: Codable, Sendable { public let hold: [Double]; public let dmg: [Double]; public let radius: Double; public let range: Double }
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
    public let cleave: Double?, sight: Double?, revive: Bool?
}

public struct RuneDef: Codable, Sendable { public let kind: RuneKind; public let name: String; public let desc: String; public let dur: Double; public let color: String }

public struct Effect: Codable, Sendable {
    public let k: String
    public let tower: TowerKind?
    public let round: Rounds?
    public let v: Double?
}

public struct TreeNode: Codable, Sendable { public let id: String; public let name: String; public let desc: String; public let cost: Int; public let req: String?; public let effect: Effect }
public struct TreeDef: Codable, Sendable { public let id: String; public let name: String; public let blurb: String; public let after: Int; public let nodes: [TreeNode] }
public struct RegionDef: Codable, Sendable { public let name: String; public let rule: String; public let color: String }

public struct Road: Codable, Sendable { public let id: String; public let spawn: String; public let ctrl: [Vec]; public let w: Double }
public struct Plot: Codable, Sendable { public let at: Vec; public let gear: SplitId?; public let sinkAt: Int? }
public struct Water: Codable, Sendable { public let ctrl: [Vec]; public let w: Double }

/// A timed rule that closes roads: a tide over a ford, lava over a pass.
public struct Shift: Codable, Sendable {
    public let kind: String
    public let closes: [String]
    public let every: Double, start: Double, dur: Double
    public let at: Vec
    public let r: Double
    public let label: String
}
public struct Barrier: Codable, Sendable { public let road: String; public let at: Double; public let hp: Double }
public struct Belt: Codable, Sendable { public let road: String; public let from: Double; public let to: Double; public let mult: Double }
public struct Vent: Codable, Sendable { public let road: String; public let at: Double; public let every: Double; public let dmg: Double }

public struct Group: Codable, Sendable { public let kind: EnemyKind; public let n: Int; public let gap: Double; public let spawn: String?; public let delay: Double }
public struct WaveDef: Codable, Sendable { public let hint: String; public let groups: [Group] }

public struct StageDef: Codable, Sendable {
    public let id: Int
    public let name: String
    public let region: Int
    public let twist: String
    public let newFoe: String
    public let unlocks: String
    public let startGold: Int
    public let lives: Int
    public let towers: [TowerKind]
    public let roads: [Road]
    public let waters: [Water]
    public let lava: Bool?
    public let high: [Vec]?
    public let plots: [Plot]
    /// Each bridge is [x, y, angle, half length].
    public let bridges: [[Double]]
    public let rune: Vec
    public let heroStart: Vec
    public let shifts: [Shift]?
    public let barriers: [Barrier]?
    public let belts: [Belt]?
    public let vents: [Vent]?
    public let weather: String?
    public let night: Bool?
    public let lighthouse: Vec?
    /// Extra foe health for this stage, on top of the usual climb.
    public let hpMul: Double?
    public let adaptEvery: Int?
    public let waves: [WaveDef]

    public var isLava: Bool { lava ?? false }

    /// Rift ids in the order they first appear, each with the roads that leave it.
    public var spawns: [(id: String, roads: [Road])] {
        var out: [(id: String, roads: [Road])] = []
        for r in roads {
            if let i = out.firstIndex(where: { $0.id == r.spawn }) { out[i].roads.append(r) } else { out.append((r.spawn, [r])) }
        }
        return out
    }
}
