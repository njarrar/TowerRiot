import Foundation

/// Player progress. Same shape as the web save, so the two are easy to compare.
public struct Save: Codable, Equatable, Sendable {
    public struct Settings: Codable, Equatable, Sendable {
        public var sound = true
        public var reduceMotion = false
        public var autoSkills = false
        public init() {}
        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            sound = (try? c.decode(Bool.self, forKey: .sound)) ?? true
            reduceMotion = (try? c.decode(Bool.self, forKey: .reduceMotion)) ?? false
            autoSkills = (try? c.decode(Bool.self, forKey: .autoSkills)) ?? false
        }
    }

    public var version = 1
    /// Best stars per stage id.
    public var stars: [Int: Int] = [:]
    /// Bought tree nodes.
    public var nodes: [String] = []
    public var settings = Settings()
    public var seenIntro = false

    public init() {}

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        // JSON object keys are strings; accept "3": 2 as stage 3 with two stars.
        let raw = (try? c.decode([String: Int].self, forKey: .stars)) ?? [:]
        stars = Dictionary(uniqueKeysWithValues: raw.compactMap { k, v in Int(k).map { ($0, max(0, min(3, v))) } })
        let known = GameData.shared.nodes
        nodes = ((try? c.decode([String].self, forKey: .nodes)) ?? []).filter { known[$0] != nil }
        settings = (try? c.decode(Settings.self, forKey: .settings)) ?? Settings()
        seenIntro = (try? c.decode(Bool.self, forKey: .seenIntro)) ?? false
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(version, forKey: .version)
        try c.encode(Dictionary(uniqueKeysWithValues: stars.map { (String($0.key), $0.value) }), forKey: .stars)
        try c.encode(nodes, forKey: .nodes)
        try c.encode(settings, forKey: .settings)
        try c.encode(seenIntro, forKey: .seenIntro)
    }

    private enum CodingKeys: String, CodingKey { case version, stars, nodes, settings, seenIntro }

    // MARK: progress

    /// Highest stage id cleared in a row from stage 1.
    public var cleared: Int {
        var n = 0
        for st in GameData.shared.stages { if (stars[st.id] ?? 0) > 0 { n = st.id } else { break } }
        return n
    }

    public func isUnlocked(_ id: Int) -> Bool { id <= cleared + 1 }
    public var totalStars: Int { stars.values.reduce(0, +) }

    /// Embers: one per star plus two per stage cleared, minus what the trees cost.
    public var embers: (earned: Int, spent: Int, free: Int) {
        let earned = totalStars + 2 * stars.values.filter { $0 > 0 }.count
        let spent = nodes.reduce(0) { $0 + (GameData.shared.nodes[$1]?.cost ?? 0) }
        return (earned, spent, earned - spent)
    }

    public func canBuyNode(_ id: String) -> Bool {
        let data = GameData.shared
        guard let n = data.nodes[id], !nodes.contains(id), let tree = data.tree(of: n) else { return false }
        if tree.after > cleared { return false }
        if let req = n.req, !nodes.contains(req) { return false }
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

    /// Record a result; keeps the best stars. Returns Embers newly earned.
    @discardableResult
    public mutating func record(stage: Int, stars got: Int) -> Int {
        let before = embers.earned
        stars[stage] = max(stars[stage] ?? 0, got)
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
