import Foundation

/// Every fixed number in the game, loaded once from the bundled JSON.
public struct GameData: Sendable {
    public let towers: [TowerKind: TowerDef]
    public let towerOrder: [TowerKind]
    /// Damage bonus a beacon gives to towers in its light, by level.
    public let beaconBuff: [Double]
    public let enemies: [EnemyKind: EnemyDef]
    public let hero: HeroDef
    public let skills: [SkillKey: SkillDef]
    public let sweep: SweepDef
    public let snare: SnareDef
    public let attune: AttuneDef
    public let sunrise: SunriseDef
    public let items: [ItemId: ItemDef]
    public let itemOrder: [ItemId]
    public let itemSlots: Int
    public let sellItem: Double
    public let runes: [RuneKind: RuneDef]
    public let runeOrder: [RuneKind]
    public let runeFirst: Double
    public let runeEvery: Double
    public let trees: [TreeDef]
    public let nodes: [String: TreeNode]
    public let regions: [RegionDef]
    public let stages: [StageDef]

    private struct File: Decodable {
        let towers: [TowerDef]
        let beaconBuff: [Double]
        let enemies: [EnemyDef]
        let hero: HeroDef
        let skills: [SkillDef]
        let sweep: SweepDef, snare: SnareDef, attune: AttuneDef, sunrise: SunriseDef
        let items: [ItemDef]
        let itemSlots: Int
        let sellItem: Double
        let runes: [RuneDef]
        let runeFirst: Double, runeEvery: Double
        let trees: [TreeDef]
        let regions: [RegionDef]
        let stages: [StageDef]
    }

    public init(json: Data) throws {
        let f = try JSONDecoder().decode(File.self, from: json)
        towers = Dictionary(uniqueKeysWithValues: f.towers.map { ($0.kind, $0) })
        towerOrder = f.towers.map(\.kind)
        beaconBuff = f.beaconBuff
        enemies = Dictionary(uniqueKeysWithValues: f.enemies.map { ($0.kind, $0) })
        hero = f.hero
        skills = Dictionary(uniqueKeysWithValues: f.skills.map { ($0.key, $0) })
        sweep = f.sweep; snare = f.snare; attune = f.attune; sunrise = f.sunrise
        items = Dictionary(uniqueKeysWithValues: f.items.map { ($0.id, $0) })
        itemOrder = f.items.map(\.id)
        itemSlots = f.itemSlots
        sellItem = f.sellItem
        runes = Dictionary(uniqueKeysWithValues: f.runes.map { ($0.kind, $0) })
        runeOrder = f.runes.map(\.kind)
        runeFirst = f.runeFirst; runeEvery = f.runeEvery
        trees = f.trees
        nodes = Dictionary(uniqueKeysWithValues: f.trees.flatMap(\.nodes).map { ($0.id, $0) })
        regions = f.regions
        stages = f.stages
    }

    /// The data that ships with the game.
    public static let shared: GameData = {
        guard let url = Bundle.module.url(forResource: "game-data", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let game = try? GameData(json: data) else {
            fatalError("game-data.json is missing or broken. Run npm run native:data.")
        }
        return game
    }()

    public func tower(_ k: TowerKind) -> TowerDef { towers[k]! }
    public func enemy(_ k: EnemyKind) -> EnemyDef { enemies[k]! }
    public func skill(_ k: SkillKey) -> SkillDef { skills[k]! }
    public func item(_ k: ItemId) -> ItemDef { items[k]! }
    public func rune(_ k: RuneKind) -> RuneDef { runes[k]! }
    public func stage(_ id: Int) -> StageDef { stages.first { $0.id == id }! }
    public func tree(of node: TreeNode) -> TreeDef? { trees.first { $0.nodes.contains { $0.id == node.id } } }
}

/// Health scale per stage so later stages hit harder. The Ashen Rift (16 to 20) climbs twice as fast.
public func hpScale(_ stage: Int) -> Double { 1 + Double(stage - 1) * 0.06 + Double(max(0, stage - 15)) * 0.1 }
/// Gold per kill grows a little so later stages can afford their towers.
public func goldScale(_ stage: Int) -> Double { 1.4 + Double(stage - 1) * 0.05 }
/// Armor scales slower than health.
public func armorScale(_ stage: Int) -> Double { 1 }
