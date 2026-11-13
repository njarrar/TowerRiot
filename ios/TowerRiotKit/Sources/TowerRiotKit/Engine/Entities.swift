import Foundation

public enum TargetMode: String, CaseIterable, Sendable { case first, strong, armored, close }
public enum DamageSource: Sendable, Equatable { case element(Element), env }

/// A road at battle time: its path, closures, wreck and belts.
public final class RoadRt {
    public struct BarrierState { public var hp: Double; public let max: Double; public let d: Double; public let x: Double; public let y: Double }
    public struct BeltState { public let from: Double; public let to: Double; public let mult: Double }

    public let def: Road
    public let path: Path
    public internal(set) var active: Bool
    public internal(set) var telegraph: Bool
    public internal(set) var spawnOpen: Bool
    public internal(set) var closed = false
    /// Distance along the road where a tide or lava closure sits, if any.
    public internal(set) var closeAt: Double?
    public internal(set) var barrier: BarrierState?
    public internal(set) var belts: [BeltState] = []

    init(def: Road, path: Path, active: Bool = true, telegraph: Bool = false, spawnOpen: Bool = true) {
        self.def = def; self.path = path; self.active = active; self.telegraph = telegraph; self.spawnOpen = spawnOpen
    }
}

public final class Foe {
    public let id: Int
    public let kind: EnemyKind
    public let def: EnemyDef
    public internal(set) var road: RoadRt
    public internal(set) var d: Double
    public internal(set) var x: Double
    public internal(set) var y: Double
    public internal(set) var dir: Double
    /// Small sideways offset so a crowd does not walk in single file.
    public internal(set) var off: Double
    public internal(set) var hp: Double
    public let max: Double
    public let speed: Double
    public internal(set) var slow = 0.0
    public internal(set) var slowT = 0.0
    public internal(set) var rootT = 0.0
    public internal(set) var staggerT = 0.0
    public internal(set) var freezeT = 0.0
    var freezeImmune = 0.0
    public internal(set) var burnT = 0.0
    var burnDps = 0.0
    public internal(set) var vulnT = 0.0
    public internal(set) var blocked = false
    public internal(set) var hidden = false
    public internal(set) var shielded = false
    /// Underground (burrower) or under the tide (Tidewyrm).
    public internal(set) var under = false
    var underT: Double
    var abilityT: Double
    public internal(set) var phase = 0
    var burstT = 0.0
    public internal(set) var hitT = 0.0
    public internal(set) var dead = false
    var warpedMask = 0
    /// Seconds left in a Cinder Hound's lunge.
    public internal(set) var lungeT = 0.0
    /// Glasshide panes left, seconds until the next grows back, and a short gap so one burst breaks one pane.
    public internal(set) var panes = 0
    var paneT = 0.0
    var paneCd = 0.0
    /// Inside a Herald's aura this tick.
    public internal(set) var warded = false

    init(id: Int, kind: EnemyKind, def: EnemyDef, road: RoadRt, d: Double, at p: Path.Point, off: Double, hp: Double, speed: Double) {
        self.id = id; self.kind = kind; self.def = def; self.road = road; self.d = d
        x = p.x; y = p.y; dir = p.dir; self.off = off; self.hp = hp; max = hp; self.speed = speed
        underT = def.traits?.burrow?[1] ?? def.traits?.dive?.every ?? 0
        abilityT = def.traits?.summon?.every ?? def.traits?.lunge?.every ?? def.traits?.stamp?.every ?? 2
        panes = def.traits?.panes?.n ?? 0
    }
}

public final class Tower {
    public let id: Int
    public let kind: TowerKind
    public let plot: Int
    public let x: Double
    public let y: Double
    public internal(set) var lv = 1
    public internal(set) var split: SplitId?
    public internal(set) var spent: Int
    var cd = 0.4
    public internal(set) var mode: TargetMode = .first
    public internal(set) var round: Rounds?
    public internal(set) var aim = 0.0
    public internal(set) var high: Bool
    /// Gear plot lowered this wave: the tower sleeps.
    public internal(set) var down = false
    /// Seconds since its last attack, for the renderer.
    public internal(set) var fired = 9.0
    var shotCount = 0
    /// Seconds left stunned by a Hollow Ram's stamp.
    public internal(set) var stunT = 0.0
    public internal(set) var dmgDealt = 0.0
    public internal(set) var kills = 0

    init(id: Int, kind: TowerKind, plot: Int, x: Double, y: Double, spent: Int, high: Bool) {
        self.id = id; self.kind = kind; self.plot = plot; self.x = x; self.y = y; self.spent = spent; self.high = high
    }
}

public struct Shot {
    public enum Kind: Sendable { case bolt, shell }
    public let id: Int
    public let kind: Kind
    public let tower: Int
    public let x0: Double, y0: Double
    public internal(set) var tx: Double, ty: Double
    public internal(set) var foe: Int
    public internal(set) var t: Double
    public let dur: Double
    let dmg: Double
    let el: Element
    let splash: Double
    let round: Rounds?
    public let crit: Bool
}

public struct Cloud { public let x: Double, y: Double, r: Double, dps: Double; public internal(set) var t: Double }

public struct PlotRt {
    public let x: Double, y: Double
    public internal(set) var high: Bool
    public internal(set) var nearWater: Bool
    public internal(set) var sunk = false
    public let gear: SplitId?
    public internal(set) var unlocked = true
    public internal(set) var rubble: RubbleDef?
    public internal(set) var rubbleLeft = 0.0
}

public struct WaterRt {
    public let id: String?
    public let w: Double
    public let path: Path
    public internal(set) var drained = false
}

public struct SwitchRt {
    public let def: SwitchDef
    public internal(set) var state = 0
    public internal(set) var activeT = 0.0
    public internal(set) var cdLeft = 0.0
    public internal(set) var boosted = false
}

public struct PortalRt {
    public let def: PortalDef
    public let fromRoad: RoadRt
    public let toRoad: RoadRt
    public let fromD: Double
    public let toD: Double
    public let fromPos: Vec
    public let toPos: Vec
    public internal(set) var active = true
    public internal(set) var count = 0
}

public struct DamageBreakdown: Equatable, Sendable {
    public var towers = 0.0, hero = 0.0, skills = 0.0, status = 0.0
}
public enum AttributionBucket { case towers, hero, skills, status }

public struct VentRt {
    public let x: Double, y: Double
    let road: RoadRt
    let d: Double
    let every: Double
    public internal(set) var t: Double
    let dmg: Double
}

public struct HeroState {
    public internal(set) var x: Double, y: Double
    public internal(set) var tx: Double, ty: Double
    public internal(set) var anchorX: Double, anchorY: Double
    public internal(set) var hp = 0.0
    public internal(set) var level: Int
    public internal(set) var xp = 0.0
    public internal(set) var points: Int
    public internal(set) var ranks: [SkillKey: Int] = [.q: 0, .w: 0, .e: 0, .r: 0]
    public internal(set) var cd: [SkillKey: Double] = [.q: 0, .w: 0, .e: 0, .r: 0]
    var atkCd = 0.0
    public internal(set) var dead = false
    public internal(set) var respawnT = 0.0
    public internal(set) var focus: Int?
    public internal(set) var items: [ItemId] = []
    var revived = false
    public internal(set) var haste = 0.0
    public internal(set) var double = 0.0
    public internal(set) var regenT = 0.0
    public internal(set) var sunriseT = 0.0
    public internal(set) var face = 1.0
    public internal(set) var swing = 0.0
    public internal(set) var moving = false

    public func rank(_ k: SkillKey) -> Int { ranks[k] ?? 0 }
    public func cooldown(_ k: SkillKey) -> Double { cd[k] ?? 0 }
}

public struct RuneState { public let kind: RuneKind; public let x: Double, y: Double; public internal(set) var ttl: Double }

public enum BattleEvent {
    case wave(n: Int, hint: String)
    case shot(tower: Int, kind: Shot.Kind)
    case pulse(tower: Int, x: Double, y: Double, r: Double)
    case arc(pts: [Vec])
    case boom(x: Double, y: Double, r: Double)
    case root(x: Double, y: Double)
    case hit(x: Double, y: Double, dmg: Double, crit: Bool, source: DamageSource)
    case kill(x: Double, y: Double, kind: EnemyKind, gold: Int, hero: Bool)
    case leak(x: Double, y: Double, lives: Int, kind: EnemyKind, hpLeft: Double)
    case adapt(el: Element, resist: Double)
    case shift(label: String, on: Bool)
    case barrier(road: String, broken: Bool)
    case vent(x: Double, y: Double)
    case build(tower: Int, x: Double, y: Double)
    case upgrade(tower: Int, x: Double, y: Double)
    case sell(tower: Int, x: Double, y: Double)
    case heroHit(x: Double, y: Double)
    case heroDown, heroUp, revive
    case level(Int)
    case skill(key: SkillKey, x: Double, y: Double)
    case rune(kind: RuneKind, picked: Bool)
    case buy(ItemId), sellItem(ItemId)
    case phase(n: Int, x: Double, y: Double)
    case dive(x: Double, y: Double, under: Bool)
    case boss(EnemyKind)
    case gear(up: SplitId)
    case sink(plot: Int)
    case night(on: Bool)
    case early(gold: Int)
    case riftWarn(road: String, wave: Int)
    case riftOpen(road: String)
    case clearPlot(plot: Int, free: Bool)
    case switchFlip(id: String, label: String, state: Int)
    case terraform(label: String)
    case warp(fromX: Double, fromY: Double, toX: Double, toY: Double, kind: PortalDef.Kind)
    case gateShock(x: Double, y: Double)
    case stamp(x: Double, y: Double, r: Double)
    case pane(x: Double, y: Double, left: Int)
    case lunge(x: Double, y: Double)
    case won(stars: Int)
    case lost
}

public enum Status: Sendable { case prep, running, won, lost }

/// Final numbers for a tower right now.
public struct TowerStats {
    public let dmg: Double, range: Double, rate: Double, crit: Double
    public let jumps: Int
    public let splash: Double
    public let shells: Int
    public let hitsFlying: Bool
    public let buffs: [String]
}
