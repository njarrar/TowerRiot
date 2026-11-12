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

    func testTwentyStagesAndVariantsInOrder() {
        XCTAssertEqual(data.stages.map(\.id), Array(1...20))
        XCTAssertEqual(Set(data.stages.map(\.name)).count, 20)
        XCTAssertEqual(Set(data.stages.compactMap(\.alt?.name)).count, 20)
    }

    func testPlotsSitOffRoadsAndActiveWater() {
        for raw in data.stages {
            for variant in [StageVariant.standard, .alt] {
                let st = raw.resolved(variant: variant)
                let roads = st.roads.map { ($0, Path(id: $0.id, pts: smooth($0.ctrl))) }
                let waters = st.waters.map { ($0, Path(id: "w", pts: smooth($0.ctrl))) }
                for (i, pl) in st.plots.enumerated() {
                    XCTAssertGreaterThanOrEqual(pl.at.x, 40, "stage \(st.id) [\(variant)] plot \(i) x")
                    XCTAssertLessThanOrEqual(pl.at.x, 1245, "stage \(st.id) [\(variant)] plot \(i) x")
                    XCTAssertGreaterThanOrEqual(pl.at.y, 115, "stage \(st.id) [\(variant)] plot \(i) y under top HUD")
                    XCTAssertLessThanOrEqual(pl.at.y, 690, "stage \(st.id) [\(variant)] plot \(i) y")
                    for (r, p) in roads { XCTAssertGreaterThanOrEqual(p.distance(toX: pl.at.x, y: pl.at.y), r.w / 2 + 24, "stage \(st.id) plot \(i) on road \(r.id)") }
                    let plotWave = pl.openAtWave ?? 1
                    for (w, p) in waters {
                        if let dw = w.drainAtWave, dw <= plotWave { continue }
                        XCTAssertGreaterThanOrEqual(p.distance(toX: pl.at.x, y: pl.at.y), w.w / 2 + 22, "stage \(st.id) plot \(i) in water")
                    }
                    var minEll = Double.infinity
                    for (_, p) in roads {
                        var d = 0.0
                        while d <= p.tot {
                            let pt = p.point(at: d)
                            minEll = min(minEll, ell(pt.x - pl.at.x, pt.y - pl.at.y))
                            d += 12
                        }
                    }
                    let maxEll = (st.high.map { inPolygon(pl.at, $0) } ?? false) ? 225.0 : 190.0
                    XCTAssertLessThanOrEqual(minEll, maxEll, "stage \(st.id) plot \(i) cannot reach any road")
                }
                for r in st.roads {
                    let g = r.ctrl.last!
                    XCTAssertTrue(g.x >= 40 && g.x <= 1250 && g.y >= 60 && g.y <= 690, "stage \(st.id) [\(variant)] gate off screen")
                }
            }
        }
    }

    func testStarRule() {
        XCTAssertEqual(starLives(20).three, 18)
        XCTAssertEqual(starLives(20).two, 10)
    }

    func testBuildUpgradeMasteryAndSell() {
        let b = Battle(stage: data.stage(9), mods: Mods(nodes: [], cleared: 8))
        b.setGold(5000)
        let t = b.build(plot: 0, kind: .watch)!
        XCTAssertNil(b.build(plot: 0, kind: .cannon), "a plot holds one tower")
        XCTAssertTrue(b.upgrade(t.id))
        XCTAssertTrue(b.upgrade(t.id))
        XCTAssertEqual(t.lv, 3)
        XCTAssertTrue(b.splitTower(t.id, .a))
        XCTAssertEqual(t.lv, 4)
        let mCost = b.upgradeCost(t)
        XCTAssertNotNil(mCost)
        XCTAssertTrue(b.upgrade(t.id))
        XCTAssertEqual(t.lv, data.maxTowerLevel)
        XCTAssertNil(b.upgradeCost(t))
        XCTAssertFalse(b.upgrade(t.id))
        let before = b.gold
        XCTAssertTrue(b.sell(t.id))
        XCTAssertEqual(b.gold, before + b.sellValue(t))
    }

    func testCourierSurchargeAndZeroCooldownShave() {
        let b = Battle(stage: data.stage(1))
        b.setGold(500)
        XCTAssertEqual(b.itemCost(.boots), Int(data.item(.boots).cost))
        XCTAssertTrue(b.learn(.q))
        XCTAssertTrue(b.callWave())
        b.step(0.5)
        b.moveHero(x: 300, y: 300)
        b.step(0.5)
        XCTAssertEqual(b.itemCost(.boots), Int(jsRound(data.item(.boots).cost * (1 + data.courierSurcharge))))
        XCTAssertTrue(b.castQ())
        var guardLeft = 400
        while b.nextIn == nil && !b.over && guardLeft > 0 { b.step(0.5); guardLeft -= 1 }
        XCTAssertNotNil(b.nextIn, "the first wave should finish spawning")
        // Make sure Q is cooling down, then call the next wave early: the cooldown must not move at all.
        if b.skillReady(.q) { XCTAssertTrue(b.castQ()) }
        let cdBefore = b.hero.cooldown(.q)
        XCTAssertGreaterThan(cdBefore, 0)
        let goldBefore = b.gold
        XCTAssertTrue(b.callWave())
        XCTAssertEqual(b.hero.cooldown(.q), cdBefore, "an early call pays gold and never shaves cooldowns")
        XCTAssertGreaterThan(b.gold, goldBefore, "an early call pays bonus gold")
    }

    func testOathsAndPaidRubbleClear() {
        let b = Battle(stage: data.stage(2), mods: Mods(), seed: 7, variant: .alt, oaths: [.longNight])
        XCTAssertTrue(b.night)
        let s1 = Battle(stage: data.stage(1))
        if let rIdx = s1.plots.firstIndex(where: { $0.rubble != nil }) {
            let cost = s1.plots[rIdx].rubble!.cost, before = s1.gold
            XCTAssertTrue(s1.canClearPlot(rIdx))
            XCTAssertTrue(s1.clearPlot(rIdx))
            XCTAssertNil(s1.plots[rIdx].rubble)
            XCTAssertEqual(s1.gold, before - cost)
        } else {
            XCTFail("stage 1 should start with a rubble plot")
        }
    }

    /// A gate switch closes its road for `dur` seconds: ground walkers short of the boom wait there,
    /// and the switch only starts to cool down once the gate has opened again.
    func testGateSwitchHoldsWalkersAtTheBoom() throws {
        let stageId = try XCTUnwrap(data.stages.first(where: { st in (st.switches ?? []).contains { $0.mode == .gate } })?.id)
        let held = Battle(stage: data.stage(stageId)), free = Battle(stage: data.stage(stageId))
        let si = try XCTUnwrap(held.switches.firstIndex(where: { $0.def.mode == .gate }))
        let roadId = try XCTUnwrap(held.switches[si].def.closesB?.first)
        let dur = held.switches[si].def.dur ?? 10, cd = held.switches[si].def.cd
        XCTAssertGreaterThan(dur, 3)
        var walkers: [Foe] = []
        var hold = 0.0
        for b in [held, free] {
            let road = try XCTUnwrap(b.roads.first(where: { $0.def.id == roadId }))
            hold = try XCTUnwrap(road.closeAt, "a gate switch gives its road a hold point")
            // Keep Wren out of it: she is sent to a far corner, and a walking hero never blocks.
            let p = road.path.point(at: hold)
            b.moveHero(x: p.x < 640 ? 1260 : 20, y: p.y < 360 ? 705 : 85)
            walkers.append(b.spawn(.grub, at: (road, hold - 45)))
        }
        XCTAssertTrue(held.toggleSwitch(si))
        XCTAssertFalse(held.toggleSwitch(si), "a gate cannot be flipped again while it is shut")
        XCTAssertTrue(held.roads.first(where: { $0.def.id == roadId })!.closed)
        XCTAssertFalse(free.roads.first(where: { $0.def.id == roadId })!.closed)
        for b in [held, free] { for _ in 0..<4 { b.step(0.5) } }
        XCTAssertFalse(walkers[0].dead)
        XCTAssertEqual(walkers[0].d, hold - 40, accuracy: 1e-9, "the walker waits 40 px short of the boom")
        XCTAssertGreaterThan(walkers[1].d, hold, "with the gate open the same walker is past the boom by now")
        XCTAssertEqual(held.switches[si].cdLeft, cd, accuracy: 1e-9, "the cooldown waits for the gate to open")
        // Let the gate time out: the road opens, the walker moves on and the cooldown starts.
        var t = 2.0
        while held.switches[si].activeT > 0 && t < dur + 5 { held.step(0.5); t += 0.5 }
        XCTAssertEqual(held.switches[si].activeT, 0)
        XCTAssertEqual(held.switches[si].state, 0)
        held.step(1)
        XCTAssertFalse(held.roads.first(where: { $0.def.id == roadId })!.closed)
        XCTAssertTrue(walkers[0].dead || walkers[0].d > hold - 40, "the walker is let through once the gate opens")
        XCTAssertLessThan(held.switches[si].cdLeft, cd)
    }

    /// At its health phase a boss breaks a new road open, exactly once, and calls its brood if it has one.
    func testBossHealthPhaseOpensItsRoad() throws {
        for (stageId, roadId, bossKind) in [(5, "inner", EnemyKind.mireking), (15, "mid_cut", EnemyKind.colossus), (20, "causeway", EnemyKind.queen)] {
            let b = Battle(stage: data.stage(stageId))
            let road = try XCTUnwrap(b.roads.first(where: { $0.def.id == roadId }), "stage \(stageId) road \(roadId)")
            XCTAssertFalse(road.active, "stage \(stageId): \(roadId) starts shut")
            XCTAssertNotNil(road.def.openOnPhase)
            let boss = b.spawn(bossKind)
            let breakAt = try XCTUnwrap(boss.def.traits?.phases?.first, "\(bossKind) has a health phase")
            if bossKind != .queen { XCTAssertEqual(breakAt, 0.5, "\(bossKind) breaks at half health") }
            for _ in 0..<30 { b.step(1.0 / 30) }
            XCTAssertFalse(road.active, "stage \(stageId): \(roadId) stays shut while the boss is healthy")
            XCTAssertEqual(boss.phase, 0)
            boss.hp = boss.max * (breakAt - 0.01)
            let before = b.foes.count
            _ = b.drain()
            b.step(1.0 / 30)
            XCTAssertEqual(boss.phase, 1, "stage \(stageId)")
            XCTAssertTrue(road.active && road.spawnOpen, "stage \(stageId): \(roadId) opens on the boss phase")
            let events = b.drain()
            let opened = events.filter { if case .riftOpen(let r) = $0 { return r == roadId }; return false }.count
            XCTAssertEqual(opened, 1, "stage \(stageId): one riftOpen event, even though a terraform names the road too")
            let phased = events.filter { if case .phase = $0 { return true }; return false }.count
            XCTAssertEqual(phased, 1)
            if boss.def.traits?.summon != nil {
                XCTAssertEqual(b.foes.count, before + 6, "stage \(stageId): the boss calls six of its brood")
            } else {
                XCTAssertEqual(b.foes.count, before, "stage \(stageId): a boss with no brood calls nothing")
            }
            // New foes from the boss's rift may now take the new road.
            XCTAssertTrue(b.spawns.contains { $0.roads.contains { $0 === road } })
        }
    }

    /// When a burn runs out its strength is forgotten, so a later, weaker burn is not topped up by the old one.
    func testBurnEndsCleanly() throws {
        let b = Battle(stage: data.stage(1))
        b.moveHero(x: 1260, y: 85)
        let f = b.spawn(.elite)
        f.burnT = 0.2
        f.burnDps = 30
        let hp = f.hp
        b.step(0.1)
        XCTAssertGreaterThan(f.burnT, 0)
        XCTAssertEqual(f.burnDps, 30)
        XCTAssertLessThan(f.hp, hp, "the burn hurts while it lasts")
        b.step(0.5)
        XCTAssertEqual(f.burnT, 0)
        XCTAssertEqual(f.burnDps, 0, "the burn's strength resets when it ends")
        let after = f.hp
        b.step(0.5)
        XCTAssertEqual(f.hp, after, "nothing burns once it is over")
    }

    /// Stage 10: at half health the Tidewyrm seals the north pass (a phase terraform that closes a road).
    func testTidewyrmSealsTheNorthPass() throws {
        let b = Battle(stage: data.stage(10))
        let north = try XCTUnwrap(b.roads.first(where: { $0.def.id == "north" }))
        XCTAssertTrue(north.spawnOpen)
        let boss = b.spawn(.tidewyrm)
        boss.hp = boss.max * 0.49
        b.step(0.5)
        XCTAssertEqual(boss.phase, 1)
        XCTAssertFalse(north.spawnOpen)
    }

    /// When the last foe of the last wave takes the last life, the battle is lost: no win is announced first.
    func testLastLifeOnTheLastFoeIsALoss() {
        func play(lives: Int) -> (battle: Battle, won: Int, lost: Int) {
            var mods = Mods()
            mods.lives = lives - data.stage(1).lives
            let b = Battle(stage: data.stage(1), mods: mods, seed: 11)
            XCTAssertEqual(b.startLives, lives)
            // No towers, and Wren is parked in a far corner: every foe walks in.
            b.moveHero(x: 1260, y: 85)
            var won = 0, lost = 0
            b.callWave()
            var guardLeft = 6000
            while !b.over && guardLeft > 0 {
                if b.nextIn != nil { b.callWave() }
                b.step(0.5)
                for e in b.drain() {
                    if case .won = e { won += 1 }
                    if case .lost = e { lost += 1 }
                }
                guardLeft -= 1
            }
            return (b, won, lost)
        }
        // First with lives to spare, to count how many lives the whole stage takes.
        let dry = play(lives: 100_000)
        XCTAssertEqual(dry.battle.status, .won)
        XCTAssertEqual(dry.battle.kills, 0, "nothing should die in this set-up")
        let total = dry.battle.leaks
        XCTAssertGreaterThan(total, 1)
        // Then with exactly that many: the very last foe takes the very last life.
        let edge = play(lives: total)
        XCTAssertEqual(edge.battle.leaks, total)
        XCTAssertEqual(edge.battle.lives, 0)
        XCTAssertEqual(edge.battle.status, .lost)
        XCTAssertEqual(edge.won, 0, "no win is announced when the Keep falls on the last foe")
        XCTAssertEqual(edge.lost, 1)
        // One life more and the same battle is a win.
        let spare = play(lives: total + 1)
        XCTAssertEqual(spare.battle.status, .won)
        XCTAssertEqual(spare.battle.lives, 1)
    }

    /// A tower on a sinking plot is refunded in full, but only half (rounded like the web game) under Shifting Earth.
    func testSinkingPlotRefund() throws {
        for (stageId, oaths) in [(9, [OathId.shiftingEarth]), (17, [OathId]())] {
            var mods = Mods()
            mods.lives = 100_000
            let b = Battle(stage: data.stage(stageId), mods: mods, oaths: oaths)
            let pi = try XCTUnwrap(b.stage.plots.firstIndex(where: { $0.sinkAt != nil && ($0.openAtWave ?? 1) <= 1 && $0.rubble == nil }),
                                   "stage \(stageId) \(oaths) has a plot that sinks")
            if oaths.isEmpty {
                XCTAssertNotNil(data.stage(stageId).plots[pi].sinkAt)
            } else {
                XCTAssertNil(data.stage(stageId).plots[pi].sinkAt, "the oath is what sinks this plot")
            }
            b.setGold(5000)
            // A beacon never attacks, so the only gold that moves is accounted for below.
            let t = try XCTUnwrap(b.build(plot: pi, kind: .beacon))
            XCTAssertTrue(b.upgrade(t.id))
            let spent = t.spent
            XCTAssertGreaterThan(spent, 0)
            XCTAssertTrue(b.callWave())
            _ = b.drain()
            var refund: Int?
            var guardLeft = 60_000
            while refund == nil && !b.over && guardLeft > 0 {
                let before = b.gold
                if b.nextIn != nil { b.callWave() }
                b.step(1.0 / 30)
                var other = 0
                var sunk = false
                for e in b.drain() {
                    switch e {
                    case .early(let g): other += g
                    case .wave(let n, _): if n > 1 { other += 15 + n * 3 }
                    case .kill(_, _, _, let g, _): other += g
                    case .rune(let kind, let picked): if kind == .bounty && picked { other += 30 + b.wave * 6 }
                    case .sink(let plot): if plot == pi { sunk = true }
                    default: break
                    }
                }
                if sunk { refund = b.gold - before - other }
                guardLeft -= 1
            }
            let want = oaths.contains(.shiftingEarth) ? Int(jsRound(Double(spent) * StageDef.shiftingEarthRefund)) : spent
            XCTAssertEqual(refund, want, "stage \(stageId) \(oaths): refund for \(spent) gold spent")
            XCTAssertTrue(b.plots[pi].sunk)
            XCTAssertNil(b.tower(t.id))
        }
        XCTAssertEqual(StageDef.shiftingEarthRefund, 0.5)
    }

    /// Stage 12: the spur opens on wave 5 behind a fork switch that starts set against it.
    /// The switch flips by itself, so the spur is used without the player touching anything.
    func testForkSwitchFlipsOntoARoadThatOpens() throws {
        var mods = Mods()
        mods.lives = 100_000
        let b = Battle(stage: data.stage(12), mods: mods)
        let spur = try XCTUnwrap(b.roads.first(where: { $0.def.id == "spur" }))
        let main = try XCTUnwrap(b.roads.first(where: { $0.def.id == "main" }))
        let si = try XCTUnwrap(b.switches.firstIndex(where: { $0.def.mode == .fork }))
        let openWave = try XCTUnwrap(spur.def.openAtWave)
        XCTAssertGreaterThan(openWave, 1)
        XCTAssertEqual(b.switches[si].state, 0)
        XCTAssertTrue((b.switches[si].def.closesA ?? []).contains("spur"))
        XCTAssertTrue(b.callWave())
        var guardLeft = 4000
        while b.wave < openWave && !b.over && guardLeft > 0 {
            XCTAssertFalse(b.foes.contains { $0.road === spur }, "nothing walks the spur before it opens")
            b.step(0.5)
            if b.nextIn != nil { b.callWave() }
            guardLeft -= 1
        }
        XCTAssertEqual(b.wave, openWave)
        XCTAssertTrue(spur.active && spur.spawnOpen)
        XCTAssertEqual(b.switches[si].state, 1, "the fork flipped onto the new road by itself")
        XCTAssertFalse(spur.closed)
        XCTAssertTrue(main.closed)
        for _ in 0..<6 { b.step(0.5) }
        XCTAssertTrue(b.foes.contains { $0.road === spur }, "wave \(openWave) foes take the spur")
    }

    /// Wren salvages rubble for free by standing beside it, but only while a battle is running.
    func testRubbleDoesNotClearDuringPrep() throws {
        let b = Battle(stage: data.stage(1))
        let pi = try XCTUnwrap(b.plots.firstIndex(where: { ($0.rubble?.holdSec ?? 0) > 0 }))
        let holdSec = try XCTUnwrap(b.plots[pi].rubble?.holdSec)
        b.moveHero(x: b.plots[pi].x + 30, y: b.plots[pi].y)
        var walked = 0.0
        while (b.hero.moving || walked == 0) && walked < 60 { b.step(0.5); walked += 0.5 }
        XCTAssertFalse(b.hero.moving)
        XCTAssertLessThanOrEqual(hypot2(b.plots[pi].x - b.hero.x, b.plots[pi].y - b.hero.y), 48)
        for _ in 0..<Int(holdSec * 2 + 6) { b.step(0.5) }
        XCTAssertEqual(b.status, .prep)
        XCTAssertNotNil(b.plots[pi].rubble, "rubble is not salvaged before the first wave")
        XCTAssertEqual(b.plots[pi].rubbleLeft, holdSec)
        let gold = b.gold
        XCTAssertTrue(b.callWave())
        _ = b.drain()
        var freed = false
        var waited = 0.0
        while !freed && waited < holdSec + 1.5 {
            b.step(0.5); waited += 0.5
            freed = b.drain().contains { if case .clearPlot(let plot, let free) = $0 { return plot == pi && free }; return false }
        }
        XCTAssertTrue(freed, "standing beside the rubble during a wave clears it for free")
        XCTAssertNil(b.plots[pi].rubble)
        XCTAssertGreaterThanOrEqual(b.gold, gold, "salvage costs no gold")
    }

    /// What the sim acts on in a stage, as one string. The same idea as `stageSignature` in the web game.
    private func signature(_ st: StageDef) throws -> String {
        let enc = JSONEncoder()
        enc.outputFormatting = [.sortedKeys]
        func json<T: Encodable>(_ v: T) throws -> String { String(decoding: try enc.encode(v), as: UTF8.self) }
        let parts: [String] = [
            try json(st.roads), try json(st.plots), try json(st.waves), try json(st.shifts ?? []), try json(st.portals ?? []),
            "\(st.night ?? false)", st.weather ?? "-", "\(st.adaptEvery ?? -1)", "\(st.hpMul ?? 1)",
        ]
        return parts.joined(separator: "|")
    }

    func testVariantBAndEveryOathChangeEveryStage() throws {
        func foeCount(_ s: StageDef) -> Int {
            var n = 0
            for w in s.waves { for g in w.groups { n += g.n } }
            return n
        }
        for raw in data.stages {
            let std = raw.resolved()
            let sig = try signature(std)
            XCTAssertEqual(try signature(raw), sig, "stage \(raw.id): the standard layout is the stage as written")
            XCTAssertNotEqual(try signature(raw.resolved(variant: .alt)), sig, "stage \(raw.id) Variant B")

            let twin = raw.resolved(oaths: [.twinRifts])
            XCTAssertEqual((twin.hpMul ?? 1) / (std.hpMul ?? 1), StageDef.twinRiftsHp, accuracy: 1e-9, "stage \(raw.id) Twin Rifts toughens foes")
            XCTAssertGreaterThan(StageDef.twinRiftsHp, 1)
            XCTAssertTrue(twin.roads.allSatisfy { $0.openOnPhase != nil || ($0.openAtWave ?? 1) == 1 }, "stage \(raw.id) Twin Rifts opens every road but a boss-phase one")
            XCTAssertEqual(twin.plots.map(\.openAtWave), std.plots.map(\.openAtWave), "stage \(raw.id) Twin Rifts leaves plots alone")
            XCTAssertGreaterThanOrEqual(foeCount(twin), foeCount(std), "stage \(raw.id) Twin Rifts only ever adds splinter groups")

            let shift = raw.resolved(oaths: [.shiftingEarth])
            let added = shift.plots.indices.filter { shift.plots[$0].sinkAt != nil && std.plots[$0].sinkAt == nil }
            XCTAssertEqual(added.count, 2, "stage \(raw.id) Shifting Earth sinks two plots")
            if added.count == 2 {
                XCTAssertNotEqual(shift.plots[added[0]].sinkAt, shift.plots[added[1]].sinkAt)
                for i in added {
                    let at = shift.plots[i].sinkAt!
                    XCTAssertTrue(at >= 2 && at <= raw.waves.count, "stage \(raw.id) plot \(i) sinks on wave \(at)")
                }
            }
            for (i, s) in (std.shifts ?? []).enumerated() {
                XCTAssertLessThan(shift.shifts![i].dur, s.dur, "stage \(raw.id) Shifting Earth cuts closure \(i) short")
                XCTAssertEqual(shift.shifts![i].every, s.every)
                XCTAssertEqual(shift.shifts![i].start, s.start)
            }

            XCTAssertEqual(raw.resolved(oaths: [.longNight]).night, true, "stage \(raw.id) Long Night")
            let dark = Battle(stage: raw, oaths: [.longNight])
            XCTAssertTrue(dark.night, "stage \(raw.id) Long Night starts dark")
            dark.callWave()
            for _ in 0..<4 { dark.step(0.5) }
            XCTAssertTrue(dark.night, "stage \(raw.id) Long Night stays dark")
            XCTAssertFalse(Battle(stage: raw).night, "stage \(raw.id) starts in daylight without the oath")
        }
    }

    /// A road that a variant or oath opens early is sent foes from the wave it opens on.
    func testEarlyRiftsAreFed() {
        var checked = 0
        for raw in data.stages {
            for (variant, oaths) in [(StageVariant.alt, [OathId]()), (StageVariant.standard, [OathId.twinRifts])] {
                let st = raw.resolved(variant: variant, oaths: oaths)
                for r in st.roads {
                    guard let was = raw.roads.first(where: { $0.id == r.id }) else { continue }
                    let opens = r.openAtWave ?? 1
                    if r.openOnPhase != nil || opens >= (was.openAtWave ?? 1) { continue }
                    // Untagged stages share one rift, and a rift that was already live is already fed.
                    if !raw.waves.contains(where: { $0.groups.contains { $0.spawn == r.spawn } }) { continue }
                    let liveBefore = raw.roads.filter { $0.spawn == r.spawn && $0.openOnPhase == nil }.map { $0.openAtWave ?? 1 }.min() ?? Int.max
                    if liveBefore <= opens { continue }
                    let first = st.waves.firstIndex(where: { $0.groups.contains { $0.spawn == r.spawn } }) ?? Int.max - 1
                    XCTAssertLessThanOrEqual(first + 1, opens, "stage \(raw.id) \(variant) \(oaths): road \(r.id) opens on wave \(opens)")
                    checked += 1
                }
            }
        }
        XCTAssertGreaterThan(checked, 0)
    }

    // MARK: saves

    private final class MemoryStore: SaveStore {
        var data: Data?
        init(_ json: String? = nil) { data = json.map { Data($0.utf8) } }
        func load() -> Data? { data }
        func store(_ d: Data) { data = d }
    }

    /// A finished campaign with three stars everywhere, as the `stars` object of a save.
    private var perfectStars: String { "{" + (1...20).map { "\"\($0)\":3" }.joined(separator: ",") + "}" }

    func testSaveRoundTripsAndDropsUnknownNodes() throws {
        let first = try XCTUnwrap(data.trees[0].nodes.first(where: { ($0.req ?? "").isEmpty && ($0.after ?? 0) == 0 }))
        let json = "{\"version\":2,\"stars\":{\"1\":3,\"2\":1},\"altStars\":{\"1\":2},\"oathStars\":{\"1\":3},\"oathsCleared\":{\"1:longNight\":true},\"nodes\":[\"\(first.id)\",\"nope\"],\"settings\":{\"sound\":false,\"autoNext\":true,\"leftHandHud\":true},\"seenIntro\":true}"
        let s = try JSONDecoder().decode(Save.self, from: Data(json.utf8))
        XCTAssertEqual(s.version, 2)
        XCTAssertEqual(s.stars, [1: 3, 2: 1])
        XCTAssertEqual(s.altStars, [1: 2])
        XCTAssertEqual(s.oathStars, [1: 3])
        XCTAssertEqual(s.oathsCleared, ["1:longNight": true])
        XCTAssertEqual(s.nodes, [first.id])
        XCTAssertFalse(s.treesRefunded)
        XCTAssertFalse(s.settings.sound)
        XCTAssertTrue(s.settings.autoNext)
        XCTAssertTrue(s.settings.leftHandHud)
        XCTAssertNil(s.settings.autoSkills)
        XCTAssertEqual(s.cleared, 2)
        // 4 stars + 2 for each of two clears + 1 Variant B clear + 1 Oath clear, minus the node.
        XCTAssertEqual(s.embers.free, 4 + 4 + 1 + 1 - first.cost)
        let again = try JSONDecoder().decode(Save.self, from: JSONEncoder().encode(s))
        XCTAssertEqual(again, s)
        // Two keys for one stage keep the better result instead of crashing.
        let twice = try JSONDecoder().decode(Save.self, from: Data("{\"version\":2,\"stars\":{\"1\":1,\"01\":3}}".utf8))
        XCTAssertEqual(twice.stars, [1: 3])
    }

    func testOldSaveHasItsTreeNodesRefunded() throws {
        // A version-1 save that owned every node of the first tree, bought at the old prices.
        let owned = data.trees[0].nodes.map { "\"\($0.id)\"" }.joined(separator: ",")
        let old = "{\"version\":1,\"stars\":\(perfectStars),\"nodes\":[\(owned)],\"settings\":{\"sound\":false},\"seenIntro\":true}"
        let s = Save.load(from: MemoryStore(old))
        XCTAssertEqual(s.version, Save.currentVersion)
        XCTAssertEqual(s.nodes, [])
        XCTAssertTrue(s.treesRefunded)
        XCTAssertEqual(s.stars[20], 3)
        XCTAssertFalse(s.settings.sound)
        XCTAssertTrue(s.seenIntro)
        XCTAssertEqual(s.embers.spent, 0)
        XCTAssertEqual(s.embers.free, s.embers.earned)

        // The flag survives a write and a load until the app clears it.
        let store = MemoryStore()
        s.write(to: store)
        XCTAssertTrue(Save.load(from: store).treesRefunded)

        // A save with no version at all is an old save too.
        let unversioned = Save.load(from: MemoryStore("{\"stars\":{\"1\":3},\"nodes\":[\(owned)]}"))
        XCTAssertEqual(unversioned.nodes, [])
        XCTAssertTrue(unversioned.treesRefunded)

        // An old save that owned no nodes has nothing to flag.
        XCTAssertFalse(Save.load(from: MemoryStore("{\"version\":1,\"stars\":{\"1\":3},\"nodes\":[]}")).treesRefunded)
        // A missing or broken save starts fresh.
        XCTAssertEqual(Save.load(from: MemoryStore()), Save())
        XCTAssertEqual(Save.load(from: MemoryStore("{not json")), Save())
        XCTAssertFalse(Save().treesRefunded)
    }

    func testCurrentSaveKeepsItsNodes() throws {
        var s = Save()
        for id in 1...20 { s.stars[id] = 3 }
        let first = try XCTUnwrap(data.trees[0].nodes.first(where: { ($0.req ?? "").isEmpty && ($0.after ?? 0) == 0 }))
        XCTAssertTrue(s.buyNode(first.id))
        let store = MemoryStore()
        s.write(to: store)
        let back = Save.load(from: store)
        XCTAssertEqual(back.nodes, [first.id])
        XCTAssertFalse(back.treesRefunded)
        XCTAssertEqual(back, s)
        let raw = String(decoding: try XCTUnwrap(store.data), as: UTF8.self)
        XCTAssertTrue(raw.contains("\"version\":\(Save.currentVersion)"))
    }

    func testSaveNeverOwesEmbersOrHoldsANodeWithoutItsPrerequisite() throws {
        let all = data.trees.flatMap(\.nodes)
        let everything = all.map { "\"\($0.id)\"" }.joined(separator: ",")
        // Current version, one star in total, yet it claims every node: it is cut back to what it can pay for.
        let s = Save.load(from: MemoryStore("{\"version\":2,\"stars\":{\"1\":1},\"nodes\":[\(everything)]}"))
        XCTAssertGreaterThanOrEqual(s.embers.free, 0)
        XCTAssertEqual(Set(s.nodes).count, s.nodes.count)
        for id in s.nodes {
            let n = try XCTUnwrap(data.nodes[id])
            if let req = n.req, !req.isEmpty { XCTAssertTrue(s.nodes.contains(req), "\(id) needs \(req)") }
            if let excl = n.excl, !excl.isEmpty { XCTAssertFalse(s.nodes.contains(excl), "\(id) excludes \(excl)") }
        }
        // A node whose prerequisite is missing is dropped even when the Embers are there.
        let needsReq = try XCTUnwrap(all.first(where: { !($0.req ?? "").isEmpty }))
        let rich = Save.load(from: MemoryStore("{\"version\":2,\"stars\":\(perfectStars),\"nodes\":[\"\(needsReq.id)\"]}"))
        XCTAssertEqual(rich.nodes, [])
    }

    func testEmbersForVariantAndOathClears() {
        var s = Save()
        XCTAssertEqual(s.record(stage: 1, stars: 3), 5) // 3 stars + 2 for the clear
        XCTAssertEqual(s.record(stage: 1, stars: 3), 0)
        XCTAssertEqual(s.record(stage: 1, stars: 2, variant: .alt), 1)
        XCTAssertEqual(s.record(stage: 1, stars: 3, variant: .alt), 0)
        XCTAssertEqual(s.record(stage: 1, stars: 1, oaths: [.longNight]), 1)
        XCTAssertEqual(s.record(stage: 1, stars: 3, oaths: [.twinRifts, .shiftingEarth]), 0)
        XCTAssertEqual(s.oathsCleared["1:twinRifts"], true)
    }

    func testBossRelics() {
        XCTAssertEqual(Mods(nodes: [], cleared: 4).dmgAll, 0)
        XCTAssertEqual(Mods(nodes: [], cleared: 5).dmgAll, 0.1)
        XCTAssertEqual(Mods(nodes: [], cleared: 19).dmgAll, 0.1)
        XCTAssertEqual(Mods(nodes: [], cleared: 20).dmgAll, 0.2)
        XCTAssertTrue(Mods(nodes: [], cleared: 10).tidePearl)
        XCTAssertEqual(Mods(nodes: [], cleared: 15).heroSkillPoints, 1)
        // Every tree node folds into Mods without hitting the unknown-key assertion.
        _ = Mods(nodes: data.trees.flatMap(\.nodes).map(\.id), cleared: 20)
    }
}

/// The Swift engine must play exactly the same game as the web engine.
final class BotParityTests: XCTestCase {
    /// One recorded run. Rows without `variant` or `oaths` are the standard stage with no oaths.
    private struct Row: Decodable {
        let result: Bot.Result
        let variant: StageVariant
        let oaths: [OathId]
        private enum Keys: String, CodingKey { case variant, oaths }
        init(from decoder: Decoder) throws {
            result = try Bot.Result(from: decoder)
            let c = try decoder.container(keyedBy: Keys.self)
            variant = try c.decodeIfPresent(StageVariant.self, forKey: .variant) ?? .standard
            oaths = try c.decodeIfPresent([OathId].self, forKey: .oaths) ?? []
        }
        var isStandard: Bool { variant == .standard && oaths.isEmpty }
        var label: String { "stage \(result.stage) \(variant.rawValue) [\(oaths.map(\.rawValue).joined(separator: ","))]" }
    }

    func testEveryStageMatchesTheWebBot() throws {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "bot-results", withExtension: "json"))
        let rows = try JSONDecoder().decode([Row].self, from: Data(contentsOf: url))
        XCTAssertEqual(rows.filter(\.isStandard).map(\.result.stage), Array(1...20), "one standard row per stage, in order")
        for row in rows {
            let w = row.result
            let (_, r) = Bot.play(w.stage, mods: Bot.typicalMods(w.stage), variant: row.variant, oaths: row.oaths)
            XCTAssertEqual(r, w, row.label)
            if row.isStandard { XCTAssertTrue(r.won, "the bot should win \(row.label)") }
        }
    }
}
