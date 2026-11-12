import Foundation

/// Player progress. Same shape as the web save, so the two are easy to compare.
public struct Save: Codable, Equatable, Sendable {
    public struct Settings: Codable, Equatable, Sendable {
        public var sound = true
        public var reduceMotion = false
        /// Spend Wren's skill points for her. Nil means the default: on in the first region, off after.
        public var autoSkills: Bool?
        /// Show damage numbers over foes.
        public var dmgNumbers = false
        public var tapGroundMove = false
        public var tapAimW = false
        public var autoNext = false
        public var leftHandHud = false
        public init() {}
        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            sound = (try? c.decode(Bool.self, forKey: .sound)) ?? true
            reduceMotion = (try? c.decode(Bool.self, forKey: .reduceMotion)) ?? false
            autoSkills = try? c.decode(Bool.self, forKey: .autoSkills)
            dmgNumbers = (try? c.decode(Bool.self, forKey: .dmgNumbers)) ?? false
            tapGroundMove = (try? c.decode(Bool.self, forKey: .tapGroundMove)) ?? false
            tapAimW = (try? c.decode(Bool.self, forKey: .tapAimW)) ?? false
            autoNext = (try? c.decode(Bool.self, forKey: .autoNext)) ?? false
            leftHandHud = (try? c.decode(Bool.self, forKey: .leftHandHud)) ?? false
        }
    }

    /// Version 2: the trees were rebalanced (new costs, new prerequisites, three nodes replaced).
    public static let currentVersion = 2

    public var version = Save.currentVersion
    /// Best stars per stage id (Standard).
    public var stars: [Int: Int] = [:]
    /// Best stars per stage id in Replay Variant B (`alt`).
    public var altStars: [Int: Int] = [:]
    /// Best stars earned with at least one Challenge Oath active.
    public var oathStars: [Int: Int] = [:]
    /// Unlocked Oath badges keyed by `"\(stageId):\(oath.rawValue)"`.
    public var oathsCleared: [String: Bool] = [:]
    /// Bought tree nodes.
    public var nodes: [String] = []
    public var settings = Settings()
    public var seenIntro = false
    /// True after an older save had its tree nodes refunded, until the player has seen the note on the trees screen.
    public var treesRefunded = false

    public init() {}

    /// JSON object keys are strings; accept "3": 2 as stage 3 with two stars. Two keys that name the
    /// same stage ("1" and "01") keep the better result instead of trapping.
    private static func starMap(_ raw: [String: Int]) -> [Int: Int] {
        let pairs: [(Int, Int)] = raw.compactMap { k, v in Int(k).map { ($0, max(0, min(3, v))) } }
        return Dictionary(pairs, uniquingKeysWith: { a, b in max(a, b) })
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let old = (try? c.decode(Int.self, forKey: .version)) != Save.currentVersion
        version = Save.currentVersion
        stars = Save.starMap((try? c.decode([String: Int].self, forKey: .stars)) ?? [:])
        altStars = Save.starMap((try? c.decode([String: Int].self, forKey: .altStars)) ?? [:])
        oathStars = Save.starMap((try? c.decode([String: Int].self, forKey: .oathStars)) ?? [:])
        oathsCleared = (try? c.decode([String: Bool].self, forKey: .oathsCleared)) ?? [:]
        let known = GameData.shared.nodes
        let rawNodes = try? c.decode([String].self, forKey: .nodes)
        // An older save bought its nodes at the old prices: refund them all rather than leave the player in debt.
        nodes = old ? [] : (rawNodes ?? []).filter { known[$0] != nil }
        settings = (try? c.decode(Settings.self, forKey: .settings)) ?? Settings()
        seenIntro = (try? c.decode(Bool.self, forKey: .seenIntro)) ?? false
        let hadNodes = !(rawNodes ?? []).isEmpty
        treesRefunded = old ? hadNodes : ((try? c.decode(Bool.self, forKey: .treesRefunded)) ?? false)
        pruneNodes()
    }

    /// Drop nodes a save cannot hold: a missing prerequisite, both of an either-or pair, or more than its Embers pay for.
    private mutating func pruneNodes() {
        let known = GameData.shared.nodes
        var changed = true
        while changed {
            changed = false
            var keep: [String] = []
            for id in nodes {
                var ok = false
                if let n = known[id], !keep.contains(id) {
                    let reqOk = (n.req ?? "").isEmpty || nodes.contains(n.req!)
                    let exclHit = !(n.excl ?? "").isEmpty && keep.contains(n.excl!)
                    ok = reqOk && !exclHit
                }
                if ok { keep.append(id) } else { changed = true }
            }
            nodes = keep
            if !changed && !nodes.isEmpty && embers.free < 0 { nodes.removeLast(); changed = true }
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(version, forKey: .version)
        try c.encode(Dictionary(uniqueKeysWithValues: stars.map { (String($0.key), $0.value) }), forKey: .stars)
        try c.encode(Dictionary(uniqueKeysWithValues: altStars.map { (String($0.key), $0.value) }), forKey: .altStars)
        try c.encode(Dictionary(uniqueKeysWithValues: oathStars.map { (String($0.key), $0.value) }), forKey: .oathStars)
        try c.encode(oathsCleared, forKey: .oathsCleared)
        try c.encode(nodes, forKey: .nodes)
        try c.encode(settings, forKey: .settings)
        try c.encode(seenIntro, forKey: .seenIntro)
        try c.encode(treesRefunded, forKey: .treesRefunded)
    }

    private enum CodingKeys: String, CodingKey { case version, stars, altStars, oathStars, oathsCleared, nodes, settings, seenIntro, treesRefunded }

    // MARK: progress

    /// Highest stage id cleared in a row from stage 1.
    public var cleared: Int {
        var n = 0
        for st in GameData.shared.stages { if (stars[st.id] ?? 0) > 0 { n = st.id } else { break } }
        return n
    }

    public func isUnlocked(_ id: Int) -> Bool { id <= cleared + 1 }
    public var totalStars: Int { stars.values.reduce(0, +) }
    public var totalAltStars: Int { altStars.values.reduce(0, +) }

    /// Embers: 1 per star + 2 per standard clear + 1 per Variant B clear + 1 per Oath clear, minus what trees cost.
    public var embers: (earned: Int, spent: Int, free: Int) {
        let std = totalStars + 2 * stars.values.filter { $0 > 0 }.count
        let alt = altStars.values.filter { $0 > 0 }.count
        let oath = oathStars.values.filter { $0 > 0 }.count
        let earned = std + alt + oath
        let spent = nodes.reduce(0) { $0 + (GameData.shared.nodes[$1]?.cost ?? 0) }
        return (earned, spent, earned - spent)
    }

    public func canBuyNode(_ id: String) -> Bool {
        let data = GameData.shared
        guard let n = data.nodes[id], !nodes.contains(id), let tree = data.tree(of: n) else { return false }
        let cl = cleared
        if tree.after > cl || (n.after ?? 0) > cl { return false }
        if let req = n.req, !req.isEmpty, !nodes.contains(req) { return false }
        if let excl = n.excl, !excl.isEmpty, nodes.contains(excl) { return false }
        return embers.free >= n.cost
    }

    @discardableResult
    public mutating func buyNode(_ id: String) -> Bool {
        guard canBuyNode(id) else { return false }
        nodes.append(id)
        return true
    }

    /// Refund every node. Free, so players can try other builds.
    public mutating func resetTrees() { nodes = [] }

    /// Record a result; keeps the best stars across standard / Variant B / Oaths. Returns Embers newly earned.
    @discardableResult
    public mutating func record(stage: Int, stars got: Int, variant: StageVariant = .standard, oaths: [OathId] = []) -> Int {
        let before = embers.earned
        if variant == .alt {
            altStars[stage] = max(altStars[stage] ?? 0, got)
        } else {
            stars[stage] = max(stars[stage] ?? 0, got)
        }
        if !oaths.isEmpty {
            oathStars[stage] = max(oathStars[stage] ?? 0, got)
            for o in oaths { oathsCleared["\(stage):\(o.rawValue)"] = true }
        }
        return embers.earned - before
    }

    public var mods: Mods { Mods(nodes: nodes, cleared: cleared) }
}

/// Where saves live. The app uses a file in Application Support; tests use memory.
public protocol SaveStore {
    func load() -> Data?
    func store(_ data: Data)
}

public final class FileSaveStore: SaveStore {
    public let url: URL
    public init(url: URL) { self.url = url }

    /// `Application Support/TowerRiot/save.json`, created on first write.
    public static func standard() -> FileSaveStore {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        return FileSaveStore(url: base.appendingPathComponent("TowerRiot", isDirectory: true).appendingPathComponent("save.json"))
    }

    public func load() -> Data? { try? Data(contentsOf: url) }

    public func store(_ data: Data) {
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: url, options: .atomic)
    }
}

public extension Save {
    /// A broken or missing save starts fresh; the game always runs.
    static func load(from store: SaveStore) -> Save {
        guard let d = store.load(), let s = try? JSONDecoder().decode(Save.self, from: d) else { return Save() }
        return s
    }

    func write(to store: SaveStore) {
        let enc = JSONEncoder()
        enc.outputFormatting = [.sortedKeys]
        if let d = try? enc.encode(self) { store.store(d) }
    }
}
