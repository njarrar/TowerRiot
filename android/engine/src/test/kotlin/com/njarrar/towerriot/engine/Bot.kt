package com.njarrar.towerriot.engine


import kotlinx.serialization.Serializable
import kotlin.math.floor
import kotlin.math.max

/** A plain, greedy player, the same as the web game's `tests/bot.ts` and the iOS bot, step for step. */
object Bot {
    @Serializable
    data class Result(
        val stage: Int, val won: Boolean, val lives: Int, val waves: Int, val level: Int,
        val gold: Int, val towers: Int, val kills: Int, val clock: Double,
    )

    fun play(
        id: Int, mods: Mods, seed: Int = 7, maxSeconds: Double = 1500.0,
        variant: StageVariant = StageVariant.standard, oaths: List<OathId> = emptyList(),
    ): Pair<Battle, Result> {
        val data = GameData.shared
        val b = Battle(data.stage(id), mods, seed, variant, oaths)
        // Spread out: each pick favours plots that cover road no earlier pick covers.
        val samples = ArrayList<Vec>()
        for (r in b.roads) {
            var d = 0.0
            while (d < r.path.tot) { val q = r.path.point(d); samples.add(Vec(q.x, q.y)); d += 20 }
        }
        val seen = DoubleArray(samples.size)
        val order = ArrayList<Int>()
        val left = ArrayList(b.plots.indices.toList())
        while (left.isNotEmpty()) {
            var bi = 0
            var bs = -1.0
            for ((k, pi) in left.withIndex()) {
                val p = b.plots[pi]
                var sc = 0.0
                for ((j, q) in samples.withIndex()) if (ell(q.x - p.x, q.y - p.y) < 210) sc += 1 / (1 + seen[j])
                if (sc > bs) { bs = sc; bi = k }
            }
            val pi = left.removeAt(bi)
            order.add(pi)
            val p = b.plots[pi]
            for ((j, q) in samples.withIndex()) if (ell(q.x - p.x, q.y - p.y) < 210) seen[j] += 1.0
        }
        val st = b.stage
        val shades = st.waves.any { w -> w.groups.any { data.enemy(it.kind).traits?.stealth == true } }
        val control = st.waves.any { w -> w.groups.any { val tr = data.enemy(it.kind).traits; tr?.lunge != null || tr?.stamp != null } }
        var air = 0
        var all = 0
        for (w in st.waves) for (g in w.groups) { all += g.n; if (data.enemy(g.kind).isFlying) air += g.n }
        val airy = air.toDouble() / max(1, all).toDouble() > 0.18
        val base = if (airy) listOf(TowerKind.watch, TowerKind.pylon, TowerKind.cannon, TowerKind.beacon, TowerKind.watch, TowerKind.bell, TowerKind.pylon, TowerKind.watch, TowerKind.cannon, TowerKind.pylon, TowerKind.watch, TowerKind.roots)
        else if (shades) listOf(TowerKind.watch, TowerKind.cannon, TowerKind.beacon, TowerKind.bell, TowerKind.pylon, TowerKind.watch, TowerKind.cannon, TowerKind.roots, TowerKind.pylon, TowerKind.watch, TowerKind.cannon, TowerKind.pylon)
        else listOf(TowerKind.watch, TowerKind.cannon, TowerKind.bell, TowerKind.pylon, TowerKind.watch, TowerKind.cannon, TowerKind.roots, TowerKind.beacon, TowerKind.pylon, TowerKind.watch, TowerKind.cannon, TowerKind.pylon)
        val rota = ((if (control) listOf(TowerKind.watch, TowerKind.bell) else emptyList()) + base).filter { it in st.towers }
        var built = 0
        b.callWave()
        var t = 0.0
        while (t < maxSeconds && !b.over) {
            b.autoLearn()
            val h = b.hero
            val near = b.foes.count { hypot2(it.x - h.x, it.y - h.y) < 100 }
            if (near >= 3) b.castQ()
            if (near >= 2 && b.foes.isNotEmpty()) {
                var f = b.foes[0]
                for (i in 1 until b.foes.size) if (b.foes[i].d > f.d) f = b.foes[i]
                b.castW(f.x, f.y)
            }
            if (b.foes.size > 12) b.castR()
            val boss = b.foes.firstOrNull { it.def.isBoss }
            if (boss != null && b.hero.focus != boss.id) b.attackFoe(boss.id)
            if (b.switches.isNotEmpty() && b.foes.size >= 6) for (si in b.switches.indices) b.toggleSwitch(si)
            for (step in 0 until 6) {
                val kind = rota[built % rota.size]
                val free = order.firstOrNull { i -> !b.plots[i].sunk && b.plots[i].unlocked && b.plots[i].rubble == null && b.towers.none { it.plot == i } }
                if (free != null && b.canBuild(free, kind)) {
                    val tw = b.build(free, kind)
                    if (tw != null && kind == TowerKind.cannon) b.setMode(tw.id, TargetMode.armored)
                    built += 1
                    continue
                }
                val rubbleIdx = order.firstOrNull { b.canClearPlot(it) && b.gold >= (b.plots[it].rubble?.cost ?: 0) + 90 }
                if (rubbleIdx != null && b.towers.size >= 3) { b.clearPlot(rubbleIdx); continue }
                val up = b.towers.filter { it.lv < 3 && b.upgradeCost(it) != null }.sortedBy { b.upgradeCost(it)!! }.firstOrNull()
                if (up != null && b.gold >= b.upgradeCost(up)!! + 20) { b.upgrade(up.id); continue }
                val sp = if (b.mods.splits) (b.towers.firstOrNull { it.lv == 3 && it.kind != TowerKind.beacon } ?: b.towers.firstOrNull { it.lv == 3 }) else null
                if (sp != null) {
                    if (b.gold >= b.splitCost(sp.kind, SplitId.a) + 40) {
                        b.splitTower(sp.id, if (sp.kind == TowerKind.watch) SplitId.b else SplitId.a); continue
                    }
                    break
                }
                val gear = data.itemOrder.reversed().firstOrNull { b.canBuy(it) && b.gold >= b.itemCost(it) + 60 }
                if (gear != null) { b.buy(gear); continue }
                val mastery = b.towers.filter { it.lv == 4 && b.upgradeCost(it) != null }.sortedBy { b.upgradeCost(it)!! }.firstOrNull()
                if (mastery != null && b.gold >= b.upgradeCost(mastery)!! + 60) { b.upgrade(mastery.id); continue }
                break
            }
            b.step(0.5)
            b.drain()
            t += 0.5
        }
        val r = Result(id, b.status == Status.won, b.lives, b.wave, b.hero.level, b.gold, b.towers.size, b.kills, jsRound(b.clock * 1000) / 1000)
        return b to r
    }

    /** Mods for a player who earned about 3.5 Embers a stage and spent them in tree order. */
    fun typicalMods(stageId: Int): Mods {
        val data = GameData.shared
        val cl = stageId - 1
        var embers = floor(cl * 3.5).toInt()
        val bought = ArrayList<String>()
        for (tier in 0 until 8) {
            for (t in data.trees) {
                if (t.after > cl || tier >= t.nodes.size) continue
                val n = t.nodes[tier]
                val reqOk = n.req.isNullOrEmpty() || n.req in bought
                val exclOk = n.excl.isNullOrEmpty() || n.excl !in bought
                if ((n.after ?: 0) <= cl && n.cost <= embers && reqOk && exclOk) { bought.add(n.id); embers -= n.cost }
            }
        }
        return Mods.from(bought, cl)
    }
}
