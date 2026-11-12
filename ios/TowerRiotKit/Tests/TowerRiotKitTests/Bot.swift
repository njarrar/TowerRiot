import Foundation
@testable import TowerRiotKit

/// A plain, greedy player, the same as the web game's `tests/bot.ts`, step for step.
enum Bot {
    struct Result: Decodable, Equatable {
        let stage: Int, won: Bool, lives: Int, waves: Int, level: Int, gold: Int, towers: Int, kills: Int, clock: Double
    }

    static func play(_ id: Int, mods: Mods, seed: Int = 7, maxSeconds: Double = 1500, variant: StageVariant = .standard, oaths: [OathId] = []) -> (Battle, Result) {
        let data = GameData.shared
        let b = Battle(stage: data.stage(id), mods: mods, seed: seed, variant: variant, oaths: oaths)
        // Spread out: each pick favours plots that cover road no earlier pick covers.
        var samples: [Vec] = []
        for r in b.roads {
            var d = 0.0
            while d < r.path.tot { let q = r.path.point(at: d); samples.append(Vec(q.x, q.y)); d += 20 }
        }
        var seen = [Double](repeating: 0, count: samples.count)
        var order: [Int] = []
        var left = Array(b.plots.indices)
        while !left.isEmpty {
            var bi = 0, bs = -1.0
            for (k, pi) in left.enumerated() {
                let p = b.plots[pi]
                var sc = 0.0
                for (j, q) in samples.enumerated() where ell(q.x - p.x, q.y - p.y) < 210 { sc += 1 / (1 + seen[j]) }
                if sc > bs { bs = sc; bi = k }
            }
            let pi = left.remove(at: bi)
            order.append(pi)
            let p = b.plots[pi]
            for (j, q) in samples.enumerated() where ell(q.x - p.x, q.y - p.y) < 210 { seen[j] += 1 }
        }
        let st = b.stage
        let shades = st.waves.contains { $0.groups.contains { $0.kind == .shade } }
        var air = 0, all = 0
        for w in st.waves { for g in w.groups { all += g.n; if data.enemy(g.kind).isFlying { air += g.n } } }
        let airy = Double(air) / Double(max(1, all)) > 0.18
        let base: [TowerKind] = airy
            ? [.watch, .pylon, .cannon, .beacon, .watch, .bell, .pylon, .watch, .cannon, .pylon, .watch, .roots]
            : shades
            ? [.watch, .cannon, .beacon, .bell, .pylon, .watch, .cannon, .roots, .pylon, .watch, .cannon, .pylon]
            : [.watch, .cannon, .bell, .pylon, .watch, .cannon, .roots, .beacon, .pylon, .watch, .cannon, .pylon]
        let rota = base.filter { st.towers.contains($0) }
        var built = 0
        b.callWave()
        var t = 0.0
        while t < maxSeconds && !b.over {
            b.autoLearn()
            let h = b.hero
            let near = b.foes.filter { hypot2($0.x - h.x, $0.y - h.y) < 100 }.count
            if near >= 3 { b.castQ() }
            if near >= 2, !b.foes.isEmpty {
                let f = b.foes.dropFirst().reduce(b.foes[0]) { $1.d > $0.d ? $1 : $0 }
                b.castW(x: f.x, y: f.y)
            }
            if b.foes.count > 12 { b.castR() }
            if let boss = b.foes.first(where: { $0.def.isBoss }), b.hero.focus != boss.id { b.attackFoe(boss.id) }
            if !b.switches.isEmpty && b.foes.count >= 6 {
                for si in b.switches.indices { b.toggleSwitch(si) }
            }
            for _ in 0..<6 {
                let kind = rota[built % rota.count]
                if let free = order.first(where: { i in !b.plots[i].sunk && b.plots[i].unlocked && b.plots[i].rubble == nil && !b.towers.contains { $0.plot == i } }), b.canBuild(plot: free, kind: kind) {
                    if let tw = b.build(plot: free, kind: kind), kind == .cannon { b.setMode(tw.id, .armored) }
                    built += 1
                    continue
                }
                if let rubbleIdx = order.first(where: { b.canClearPlot($0) && b.gold >= (b.plots[$0].rubble?.cost ?? 0) + 90 }), b.towers.count >= 3 {
                    b.clearPlot(rubbleIdx)
                    continue
                }
                let ups = b.towers.filter { $0.lv < 3 && b.upgradeCost($0) != nil }.stableSorted { b.upgradeCost($0)! < b.upgradeCost($1)! }
                if let up = ups.first, b.gold >= b.upgradeCost(up)! + 20 { b.upgrade(up.id); continue }
                let sp = b.mods.splits ? (b.towers.first(where: { $0.lv == 3 && $0.kind != .beacon }) ?? b.towers.first(where: { $0.lv == 3 })) : nil
                if let sp {
                    if b.gold >= b.splitCost(sp.kind, .a) + 40 {
                        b.splitTower(sp.id, sp.kind == .watch ? .b : .a); continue
                    }
                    break
                }
                if let gear = data.itemOrder.reversed().first(where: { b.canBuy($0) && b.gold >= b.itemCost($0) + 60 }) {
                    b.buy(gear); continue
                }
                let masteries = b.towers.filter { $0.lv == 4 && b.upgradeCost($0) != nil }.stableSorted { b.upgradeCost($0)! < b.upgradeCost($1)! }
                if let mastery = masteries.first, b.gold >= b.upgradeCost(mastery)! + 60 { b.upgrade(mastery.id); continue }
                break
            }
            b.step(0.5)
            _ = b.drain()
            t += 0.5
        }
        let r = Result(stage: id, won: b.status == .won, lives: b.lives, waves: b.wave, level: b.hero.level, gold: b.gold,
                       towers: b.towers.count, kills: b.kills, clock: jsRound(b.clock * 1000) / 1000)
        return (b, r)
    }

    /// Mods for a player who earned about 3.5 Embers a stage and spent them in tree order.
    static func typicalMods(_ stageId: Int) -> Mods {
        let data = GameData.shared
        let cl = stageId - 1
        var embers = Int((Double(cl) * 3.5).rounded(.down))
        var bought: [String] = []
        for tier in 0..<8 {
            for t in data.trees where t.after <= cl && tier < t.nodes.count {
                let n = t.nodes[tier]
                let reqOk = (n.req ?? "").isEmpty || bought.contains(n.req!)
                let exclOk = (n.excl ?? "").isEmpty || !bought.contains(n.excl!)
                if (n.after ?? 0) <= cl && n.cost <= embers && reqOk && exclOk {
                    bought.append(n.id)
                    embers -= n.cost
                }
            }
        }
        return Mods(nodes: bought, cleared: cl)
    }
}
