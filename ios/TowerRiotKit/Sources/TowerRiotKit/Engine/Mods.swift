import Foundation

/// Every campaign bonus that changes a battle, folded into plain numbers.
public struct Mods: Sendable {
    public var towerDmg: [TowerKind: Double] = [:]
    public var towerRange: [TowerKind: Double] = [:]
    public var dmgAll = 0.0
    public var rangeAll = 0.0
    public var blast = 0.0
    public var slow = 0.0
    public var jumps = 0
    public var hold = 0.0
    public var costMul = 0.0
    public var rounds: [Rounds] = []
    public var shatter = false
    public var overload = false
    public var rateAll = 0.0
    public var heroLevel = 0
    public var heroSkillPoints = 0
    public var sweep = 0.0
    public var snare = 0.0
    public var attune = 0.0
    public var sunrise = 0.0
    public var lastHit = 0.0
    public var lives = 0
    public var gold = 0
    public var sell = 0.0
    public var early = 0.0
    public var ironGate = false
    public var interest = 0.0
    /// Towers, hero skills and shop items open so far.
    public var splits = true
    public var skillW = true
    public var skillR = true
    public var shopAfter = 99

    public init() {}

    /// Fold bought tree nodes and campaign progress into one Mods value.
    public init(nodes: [String], cleared: Int, data: GameData = .shared) {
        for id in nodes {
            guard let n = data.nodes[id] else { continue }
            let e = n.effect, v = e.v ?? 0
            switch e.k {
            case "towerDmg": if let t = e.tower { towerDmg[t, default: 0] += v }
            case "towerRange": if let t = e.tower { towerRange[t, default: 0] += v }
            case "round": if let r = e.round, !rounds.contains(r) { rounds.append(r) }
            case "shatter": shatter = true
            case "overload": overload = true
            case "ironGate": ironGate = true
            case "costMul": costMul += v
            case "heroLevel": heroLevel += Int(v)
            case "blast": blast += v
            case "slow": slow += v
            case "jumps": jumps += Int(v)
            case "hold": hold += v
            case "rateAll": rateAll += v
            case "sweep": sweep += v
            case "snare": snare += v
            case "attune": attune += v
            case "sunrise": sunrise += v
            case "lastHit": lastHit += v
            case "lives": lives += Int(v)
            case "gold": gold += Int(v)
            case "sell": sell += v
            case "early": early += v
            case "interest": interest += v
            default: break
            }
        }
        // Relics from the four bosses.
        if cleared >= 5 { dmgAll += 0.1 }
        if cleared >= 10 { rangeAll += 0.08 }
        if cleared >= 15 { heroSkillPoints += 1 }
        skillW = cleared >= 1
        skillR = cleared >= 7
        splits = cleared >= 8
        shopAfter = cleared
    }
}
