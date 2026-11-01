import XCTest
@testable import TowerRiotKit

final class EngineTests: XCTestCase {
    let data = GameData.shared

    func testRngMatchesTheWebSequence() {
        // First values of mulberry32(1234), taken from the web game.
        var r = Rng(seed: 1234)
        let got = (0..<3).map { _ in r.next() }
        XCTAssertEqual(got[0], 0.07329497812315822, accuracy: 0)
        XCTAssertEqual(got[1], 0.7034119898453355, accuracy: 0)
        XCTAssertEqual(got[2], 0.9028560190927237, accuracy: 0)
    }

    func testJsRoundRoundsHalvesUp() {
        XCTAssertEqual(jsRound(2.5), 3)
        XCTAssertEqual(jsRound(-2.5), -2)
        XCTAssertEqual(jsRound(-2.6), -3)
    }

    func testTwentyStagesInOrder() {
        XCTAssertEqual(data.stages.map(\.id), Array(1...20))
    }

    func testPlotsSitOffRoadsAndWater() {
        for st in data.stages {
            let roads = st.roads.map { ($0, Path(id: $0.id, pts: smooth($0.ctrl))) }
            let waters = st.waters.map { ($0, Path(id: "w", pts: smooth($0.ctrl))) }
            for (i, pl) in st.plots.enumerated() {
                for (r, p) in roads { XCTAssertGreaterThanOrEqual(p.distance(toX: pl.at.x, y: pl.at.y), r.w / 2 + 24, "stage \(st.id) plot \(i) on road \(r.id)") }
                for (w, p) in waters { XCTAssertGreaterThanOrEqual(p.distance(toX: pl.at.x, y: pl.at.y), w.w / 2 + 22, "stage \(st.id) plot \(i) in water") }
            }
        }
    }

    func testStarRule() {
        XCTAssertEqual(starLives(20).three, 18)
        XCTAssertEqual(starLives(20).two, 10)
    }

    func testBuildUpgradeSell() {
        let b = Battle(stage: data.stage(1))
        let gold = b.gold
        let t = b.build(plot: 0, kind: .watch)!
        XCTAssertEqual(b.gold, gold - 70)
        XCTAssertNil(b.build(plot: 0, kind: .cannon), "a plot holds one tower")
        XCTAssertTrue(b.upgrade(t.id))
        XCTAssertEqual(t.lv, 2)
        XCTAssertTrue(b.sell(t.id))
        XCTAssertEqual(b.gold, gold - 130 + Int(Double(130) * 0.7))
    }

    func testSaveRoundTripsAndDropsUnknownNodes() throws {
        let json = #"{"version":1,"stars":{"1":3,"2":1},"nodes":["tw-bolts","nope"],"settings":{"sound":false},"seenIntro":true}"#
        let s = try JSONDecoder().decode(Save.self, from: Data(json.utf8))
        XCTAssertEqual(s.stars, [1: 3, 2: 1])
        XCTAssertEqual(s.nodes, ["tw-bolts"])
        XCTAssertFalse(s.settings.sound)
        XCTAssertNil(s.settings.autoSkills)
        XCTAssertEqual(s.cleared, 2)
        XCTAssertEqual(s.embers.free, 4 + 4 - 2)
        let again = try JSONDecoder().decode(Save.self, from: JSONEncoder().encode(s))
        XCTAssertEqual(again, s)
    }
}

/// The Swift engine must play exactly the same game as the web engine.
final class BotParityTests: XCTestCase {
    func testEveryStageMatchesTheWebBot() throws {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "bot-results", withExtension: "json"))
        let web = try JSONDecoder().decode([Bot.Result].self, from: Data(contentsOf: url))
        XCTAssertEqual(web.count, 20)
        for w in web {
            let (_, r) = Bot.play(w.stage, mods: Bot.typicalMods(w.stage))
            XCTAssertEqual(r, w, "stage \(w.stage)")
            XCTAssertTrue(r.won, "the bot should win stage \(w.stage)")
        }
    }
}
