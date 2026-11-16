package com.njarrar.towerriot.engine

import kotlin.math.min
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.test.fail

/** The same checks as the iOS engine tests, so the three engines stay one game. */
class EngineTest {
    private val data = GameData.shared

    @Test fun rngMatchesTheWebSequence() {
        // First values of mulberry32(1234), taken from the web game.
        val r = Rng(1234)
        assertEquals(0.07329497812315822, r.next())
        assertEquals(0.7034119898453355, r.next())
        assertEquals(0.9028560190927237, r.next())
    }

    @Test fun jsRoundRoundsHalvesUp() {
        assertEquals(3.0, jsRound(2.5))
        assertEquals(-2.0, jsRound(-2.5))
        assertEquals(-3.0, jsRound(-2.6))
    }

    @Test fun twentyStagesAndVariantsInOrder() {
        assertEquals((1..20).toList(), data.stages.map { it.id })
        assertEquals(20, data.stages.map { it.name }.toSet().size)
        assertEquals(20, data.stages.mapNotNull { it.alt?.name }.toSet().size)
    }

    @Test fun plotsSitOffRoadsAndActiveWater() {
        for (raw in data.stages) for (variant in StageVariant.entries) {
            val st = raw.resolved(variant)
            val roads = st.roads.map { it to Path(it.id, smooth(it.ctrl)) }
            val waters = st.waters.map { it to Path("w", smooth(it.ctrl)) }
            for ((i, pl) in st.plots.withIndex()) {
                val tag = "stage ${st.id} [$variant] plot $i"
                assertTrue(pl.at.x in 40.0..1245.0, "$tag x")
                assertTrue(pl.at.y in 115.0..690.0, "$tag y")
                for ((r, p) in roads) assertTrue(p.distanceTo(pl.at.x, pl.at.y) >= r.w / 2 + 24, "$tag on road ${r.id}")
                val plotWave = pl.openAtWave ?: 1
                for ((w, p) in waters) {
                    val dw = w.drainAtWave
                    if (dw != null && dw <= plotWave) continue
                    assertTrue(p.distanceTo(pl.at.x, pl.at.y) >= w.w / 2 + 22, "$tag in water")
                }
                var minEll = Double.POSITIVE_INFINITY
                for ((_, p) in roads) {
                    var d = 0.0
                    while (d <= p.tot) { val pt = p.point(d); minEll = min(minEll, ell(pt.x - pl.at.x, pt.y - pl.at.y)); d += 12 }
                }
                val maxEll = if (st.high?.let { inPolygon(pl.at, it) } == true) 225.0 else 190.0
                assertTrue(minEll <= maxEll, "$tag cannot reach any road")
            }
            for (r in st.roads) {
                val g = r.ctrl.last()
                assertTrue(g.x in 40.0..1250.0 && g.y in 60.0..690.0, "stage ${st.id} [$variant] gate off screen")
            }
        }
    }

    @Test fun starRule() {
        assertEquals(18 to 10, starLives(20))
    }

    @Test fun buildUpgradeMasteryAndSell() {
        val b = Battle(data.stage(9), Mods.from(emptyList(), 8))
        b.setGold(5000)
        val t = b.build(0, TowerKind.watch)!!
        assertNull(b.build(0, TowerKind.cannon), "a plot holds one tower")
        assertTrue(b.upgrade(t.id)); assertTrue(b.upgrade(t.id))
        assertEquals(3, t.lv)
        assertTrue(b.splitTower(t.id, SplitId.a))
        assertEquals(4, t.lv)
        assertNotNull(b.upgradeCost(t))
        assertTrue(b.upgrade(t.id))
        assertEquals(data.maxTowerLevel, t.lv)
        assertNull(b.upgradeCost(t))
        assertFalse(b.upgrade(t.id))
        val before = b.gold
        assertTrue(b.sell(t.id))
        assertEquals(before + b.sellValue(t), b.gold)
    }

    @Test fun courierSurchargeAndZeroCooldownShave() {
        val b = Battle(data.stage(1))
        b.setGold(500)
        assertEquals(data.item(ItemId.boots).cost.toInt(), b.itemCost(ItemId.boots))
        assertTrue(b.learn(SkillKey.q))
        assertTrue(b.callWave())
        b.step(0.5)
        b.moveHero(300.0, 300.0)
        b.step(0.5)
        assertEquals(jsRound(data.item(ItemId.boots).cost * (1 + data.courierSurcharge)).toInt(), b.itemCost(ItemId.boots))
        assertTrue(b.castQ())
        var guardLeft = 400
        while (b.nextIn == null && !b.over && guardLeft > 0) { b.step(0.5); guardLeft -= 1 }
        assertNotNull(b.nextIn, "the first wave should finish spawning")
        if (b.skillReady(SkillKey.q)) assertTrue(b.castQ())
        val cdBefore = b.hero.cooldown(SkillKey.q)
        assertTrue(cdBefore > 0)
        val goldBefore = b.gold
        assertTrue(b.callWave())
        assertEquals(cdBefore, b.hero.cooldown(SkillKey.q), "an early call pays gold and never shaves cooldowns")
        assertTrue(b.gold > goldBefore, "an early call pays bonus gold")
    }

    @Test fun oathsAndPaidRubbleClear() {
        val b = Battle(data.stage(2), Mods(), 7, StageVariant.alt, listOf(OathId.longNight))
        assertTrue(b.night)
        val s1 = Battle(data.stage(1))
        val rIdx = s1.plots.indexOfFirst { it.rubble != null }
        if (rIdx < 0) fail("stage 1 should start with a rubble plot")
        val cost = s1.plots[rIdx].rubble!!.cost
        val before = s1.gold
        assertTrue(s1.canClearPlot(rIdx))
        assertTrue(s1.clearPlot(rIdx))
        assertNull(s1.plots[rIdx].rubble)
        assertEquals(before - cost, s1.gold)
    }

    @Test fun gateSwitchHoldsWalkersAtTheBoom() {
        val stageId = data.stages.first { st -> (st.switches ?: emptyList()).any { it.mode == SwitchMode.gate } }.id
        val held = Battle(data.stage(stageId))
        val free = Battle(data.stage(stageId))
        val si = held.switches.indexOfFirst { it.def.mode == SwitchMode.gate }
        val roadId = held.switches[si].def.closesB!!.first()
        val dur = held.switches[si].def.dur ?: 10.0
        val cd = held.switches[si].def.cd
        assertTrue(dur > 3)
        val walkers = ArrayList<Foe>()
        var hold = 0.0
        for (b in listOf(held, free)) {
            val road = b.roads.first { it.def.id == roadId }
            hold = road.closeAt!!
            val p = road.path.point(hold)
            b.moveHero(if (p.x < 640) 1260.0 else 20.0, if (p.y < 360) 705.0 else 85.0)
            walkers.add(b.spawn(EnemyKind.grub, atRoad = road, atD = hold - 45))
        }
        assertTrue(held.toggleSwitch(si))
        assertFalse(held.toggleSwitch(si), "a gate cannot be flipped again while it is shut")
        assertTrue(held.roads.first { it.def.id == roadId }.closed)
        assertFalse(free.roads.first { it.def.id == roadId }.closed)
        for (b in listOf(held, free)) repeat(4) { b.step(0.5) }
        assertFalse(walkers[0].dead)
        assertEquals(hold - 40, walkers[0].d, 1e-9, "the walker waits 40 px short of the boom")
        assertTrue(walkers[1].d > hold, "with the gate open the same walker is past the boom by now")
        assertEquals(cd, held.switches[si].cdLeft, 1e-9, "the cooldown waits for the gate to open")
        var t = 2.0
        while (held.switches[si].activeT > 0 && t < dur + 5) { held.step(0.5); t += 0.5 }
        assertEquals(0.0, held.switches[si].activeT)
        assertEquals(0, held.switches[si].state)
        held.step(1.0)
        assertFalse(held.roads.first { it.def.id == roadId }.closed)
        assertTrue(walkers[0].dead || walkers[0].d > hold - 40)
        assertTrue(held.switches[si].cdLeft < cd)
    }

    @Test fun bossHealthPhaseOpensItsRoad() {
        for ((stageId, roadId, bossKind) in listOf(Triple(5, "inner", EnemyKind.mireking), Triple(15, "mid_cut", EnemyKind.colossus), Triple(20, "causeway", EnemyKind.queen))) {
            val b = Battle(data.stage(stageId))
            val road = b.roads.first { it.def.id == roadId }
            assertFalse(road.active, "stage $stageId: $roadId starts shut")
            assertNotNull(road.def.openOnPhase)
            val boss = b.spawn(bossKind)
            val breakAt = boss.def.traits!!.phases!!.first()
            if (bossKind != EnemyKind.queen) assertEquals(0.5, breakAt)
            repeat(30) { b.step(1.0 / 30) }
            assertFalse(road.active)
            assertEquals(0, boss.phase)
            boss.hp = boss.max * (breakAt - 0.01)
            val before = b.foes.size
            b.drain()
            b.step(1.0 / 30)
            assertEquals(1, boss.phase, "stage $stageId")
            assertTrue(road.active && road.spawnOpen, "stage $stageId: $roadId opens on the boss phase")
            val events = b.drain()
            assertEquals(1, events.count { it is BattleEvent.RiftOpen && it.road == roadId })
            assertEquals(1, events.count { it is BattleEvent.Phase })
            if (boss.def.traits?.summon != null) assertEquals(before + 6, b.foes.size) else assertEquals(before, b.foes.size)
            assertTrue(b.spawns.any { (_, rs) -> rs.any { it === road } })
        }
    }

    @Test fun burnEndsCleanly() {
        val b = Battle(data.stage(1))
        b.moveHero(1260.0, 85.0)
        val f = b.spawn(EnemyKind.elite)
        f.burnT = 0.2
        f.burnDps = 30.0
        val hp = f.hp
        b.step(0.1)
        assertTrue(f.burnT > 0)
        assertEquals(30.0, f.burnDps)
        assertTrue(f.hp < hp)
        b.step(0.5)
        assertEquals(0.0, f.burnT)
        assertEquals(0.0, f.burnDps)
        val after = f.hp
        b.step(0.5)
        assertEquals(after, f.hp)
    }

    @Test fun tidewyrmSealsTheNorthPass() {
        val b = Battle(data.stage(10))
        val north = b.roads.first { it.def.id == "north" }
        assertTrue(north.spawnOpen)
        val boss = b.spawn(EnemyKind.tidewyrm)
        boss.hp = boss.max * 0.49
        b.step(0.5)
        assertEquals(1, boss.phase)
        assertFalse(north.spawnOpen)
    }

    @Test fun lastLifeOnTheLastFoeIsALoss() {
        class Run(val battle: Battle, val won: Int, val lost: Int)
        fun play(lives: Int): Run {
            val mods = Mods()
            mods.lives = lives - data.stage(1).lives
            val b = Battle(data.stage(1), mods, 11)
            assertEquals(lives, b.startLives)
            b.moveHero(1260.0, 85.0)
            var won = 0
            var lost = 0
            b.callWave()
            var guardLeft = 6000
            while (!b.over && guardLeft > 0) {
                if (b.nextIn != null) b.callWave()
                b.step(0.5)
                for (e in b.drain()) { if (e is BattleEvent.Won) won++; if (e is BattleEvent.Lost) lost++ }
                guardLeft -= 1
            }
            return Run(b, won, lost)
        }
        val dry = play(100_000)
        assertEquals(Status.won, dry.battle.status)
        assertEquals(0, dry.battle.kills)
        val total = dry.battle.leaks
        assertTrue(total > 1)
        val edge = play(total)
        assertEquals(total, edge.battle.leaks)
        assertEquals(0, edge.battle.lives)
        assertEquals(Status.lost, edge.battle.status)
        assertEquals(0, edge.won)
        assertEquals(1, edge.lost)
        val spare = play(total + 1)
        assertEquals(Status.won, spare.battle.status)
        assertEquals(1, spare.battle.lives)
    }

    @Test fun sinkingPlotRefund() {
        for ((stageId, oaths) in listOf(9 to listOf(OathId.shiftingEarth), 17 to emptyList())) {
            val mods = Mods()
            mods.lives = 100_000
            val b = Battle(data.stage(stageId), mods, oaths = oaths)
            val pi = b.stage.plots.indexOfFirst { it.sinkAt != null && (it.openAtWave ?: 1) <= 1 && it.rubble == null }
            assertTrue(pi >= 0, "stage $stageId $oaths has a plot that sinks")
            if (oaths.isEmpty()) assertNotNull(data.stage(stageId).plots[pi].sinkAt) else assertNull(data.stage(stageId).plots[pi].sinkAt)
            b.setGold(5000)
            val t = b.build(pi, TowerKind.beacon)!!
            assertTrue(b.upgrade(t.id))
            val spent = t.spent
            assertTrue(b.callWave())
            b.drain()
            var refund: Int? = null
            var guardLeft = 60_000
            while (refund == null && !b.over && guardLeft > 0) {
                val before = b.gold
                if (b.nextIn != null) b.callWave()
                b.step(1.0 / 30)
                var other = 0
                var sunk = false
                for (e in b.drain()) when (e) {
                    is BattleEvent.Early -> other += e.gold
                    is BattleEvent.Wave -> if (e.n > 1) other += 15 + e.n * 3
                    is BattleEvent.Kill -> other += e.gold
                    is BattleEvent.RuneEv -> if (e.kind == RuneKind.bounty && e.picked) other += 30 + b.wave * 6
                    is BattleEvent.Sink -> if (e.plot == pi) sunk = true
                    else -> {}
                }
                if (sunk) refund = b.gold - before - other
                guardLeft -= 1
            }
            val want = if (OathId.shiftingEarth in oaths) jsRound(spent * StageDef.SHIFTING_EARTH_REFUND).toInt() else spent
            assertEquals(want, refund, "stage $stageId $oaths")
            assertTrue(b.plots[pi].sunk)
            assertNull(b.tower(t.id))
        }
    }

    @Test fun forkSwitchFlipsOntoARoadThatOpens() {
        val mods = Mods()
        mods.lives = 100_000
        val b = Battle(data.stage(12), mods)
        val spur = b.roads.first { it.def.id == "spur" }
        val main = b.roads.first { it.def.id == "main" }
        val si = b.switches.indexOfFirst { it.def.mode == SwitchMode.fork }
        val openWave = spur.def.openAtWave!!
        assertTrue(openWave > 1)
        assertEquals(0, b.switches[si].state)
        assertTrue("spur" in (b.switches[si].def.closesA ?: emptyList()))
        assertTrue(b.callWave())
        var guardLeft = 4000
        while (b.wave < openWave && !b.over && guardLeft > 0) {
            assertFalse(b.foes.any { it.road === spur })
            b.step(0.5)
            if (b.nextIn != null) b.callWave()
            guardLeft -= 1
        }
        assertEquals(openWave, b.wave)
        assertTrue(spur.active && spur.spawnOpen)
        assertEquals(1, b.switches[si].state)
        assertFalse(spur.closed)
        assertTrue(main.closed)
        repeat(6) { b.step(0.5) }
        assertTrue(b.foes.any { it.road === spur })
    }

    @Test fun rubbleDoesNotClearDuringPrep() {
        val b = Battle(data.stage(1))
        val pi = b.plots.indexOfFirst { (it.rubble?.holdSec ?: 0.0) > 0 }
        val holdSec = b.plots[pi].rubble!!.holdSec!!
        b.moveHero(b.plots[pi].x + 30, b.plots[pi].y)
        var walked = 0.0
        while ((b.hero.moving || walked == 0.0) && walked < 60) { b.step(0.5); walked += 0.5 }
        assertFalse(b.hero.moving)
        assertTrue(hypot2(b.plots[pi].x - b.hero.x, b.plots[pi].y - b.hero.y) <= 48)
        repeat((holdSec * 2 + 6).toInt()) { b.step(0.5) }
        assertEquals(Status.prep, b.status)
        assertNotNull(b.plots[pi].rubble)
        assertEquals(holdSec, b.plots[pi].rubbleLeft)
        val gold = b.gold
        assertTrue(b.callWave())
        b.drain()
        var freed = false
        var waited = 0.0
        while (!freed && waited < holdSec + 1.5) {
            b.step(0.5); waited += 0.5
            freed = b.drain().any { it is BattleEvent.ClearPlot && it.plot == pi && it.free }
        }
        assertTrue(freed)
        assertNull(b.plots[pi].rubble)
        assertTrue(b.gold >= gold)
    }

    private fun signature(st: StageDef): String = listOf(
        st.roads, st.plots, st.waves, st.shifts ?: emptyList<Any>(), st.portals ?: emptyList<Any>(),
        st.night ?: false, st.weather ?: "-", st.adaptEvery ?: -1, st.hpMul ?: 1.0,
    ).joinToString("|")

    @Test fun variantBAndEveryOathChangeEveryStage() {
        fun foeCount(s: StageDef) = s.waves.sumOf { w -> w.groups.sumOf { it.n } }
        for (raw in data.stages) {
            val std = raw.resolved()
            val sig = signature(std)
            assertEquals(sig, signature(raw), "stage ${raw.id}: the standard layout is the stage as written")
            assertNotEquals(sig, signature(raw.resolved(StageVariant.alt)), "stage ${raw.id} Variant B")
            val twin = raw.resolved(oaths = listOf(OathId.twinRifts))
            assertEquals(StageDef.TWIN_RIFTS_HP, (twin.hpMul ?: 1.0) / (std.hpMul ?: 1.0), 1e-9)
            assertTrue(twin.roads.all { it.openOnPhase != null || (it.openAtWave ?: 1) == 1 })
            assertEquals(std.plots.map { it.openAtWave }, twin.plots.map { it.openAtWave })
            assertTrue(foeCount(twin) >= foeCount(std))
            val shift = raw.resolved(oaths = listOf(OathId.shiftingEarth))
            val added = shift.plots.indices.filter { shift.plots[it].sinkAt != null && std.plots[it].sinkAt == null }
            assertEquals(2, added.size, "stage ${raw.id} Shifting Earth sinks two plots")
            assertNotEquals(shift.plots[added[0]].sinkAt, shift.plots[added[1]].sinkAt)
            for (i in added) assertTrue(shift.plots[i].sinkAt!! in 2..raw.waves.size)
            for ((i, s) in (std.shifts ?: emptyList()).withIndex()) {
                assertTrue(shift.shifts!![i].dur < s.dur)
                assertEquals(s.every, shift.shifts!![i].every)
                assertEquals(s.start, shift.shifts!![i].start)
            }
            assertEquals(true, raw.resolved(oaths = listOf(OathId.longNight)).night)
            val dark = Battle(raw, oaths = listOf(OathId.longNight))
            assertTrue(dark.night)
            dark.callWave()
            repeat(4) { dark.step(0.5) }
            assertTrue(dark.night, "stage ${raw.id} Long Night stays dark")
            assertFalse(Battle(raw).night)
        }
    }

    @Test fun earlyRiftsAreFed() {
        var checked = 0
        for (raw in data.stages) {
            for ((variant, oaths) in listOf(StageVariant.alt to emptyList(), StageVariant.standard to listOf(OathId.twinRifts))) {
                val st = raw.resolved(variant, oaths)
                for (r in st.roads) {
                    val was = raw.roads.firstOrNull { it.id == r.id } ?: continue
                    val opens = r.openAtWave ?: 1
                    if (r.openOnPhase != null || opens >= (was.openAtWave ?: 1)) continue
                    if (raw.waves.none { w -> w.groups.any { it.spawn == r.spawn } }) continue
                    val liveBefore = raw.roads.filter { it.spawn == r.spawn && it.openOnPhase == null }.minOfOrNull { it.openAtWave ?: 1 } ?: Int.MAX_VALUE
                    if (liveBefore <= opens) continue
                    val idx = st.waves.indexOfFirst { w -> w.groups.any { it.spawn == r.spawn } }
                    val first = if (idx < 0) Int.MAX_VALUE - 1 else idx
                    assertTrue(first + 1 <= opens, "stage ${raw.id} $variant $oaths: road ${r.id} opens on wave $opens")
                    checked += 1
                }
            }
        }
        assertTrue(checked > 0)
    }

    // ---------------------------------------------------------------- saves

    private val perfectStars = "{" + (1..20).joinToString(",") { "\"$it\":3" } + "}"

    @Test fun saveRoundTripsAndDropsUnknownNodes() {
        val first = data.trees[0].nodes.first { it.req.isNullOrEmpty() && (it.after ?: 0) == 0 }
        val json = "{\"version\":2,\"stars\":{\"1\":3,\"2\":1},\"altStars\":{\"1\":2},\"oathStars\":{\"1\":3},\"oathsCleared\":{\"1:longNight\":true},\"nodes\":[\"${first.id}\",\"nope\"],\"settings\":{\"sound\":false,\"autoNext\":true,\"leftHandHud\":true},\"seenIntro\":true}"
        val s = Save.parse(json)
        assertEquals(2, s.version)
        assertEquals(mapOf(1 to 3, 2 to 1), s.stars)
        assertEquals(mapOf(1 to 2), s.altStars)
        assertEquals(mapOf(1 to 3), s.oathStars)
        assertEquals(mapOf("1:longNight" to true), s.oathsCleared)
        assertEquals(listOf(first.id), s.nodes)
        assertFalse(s.treesRefunded)
        assertFalse(s.settings.sound)
        assertTrue(s.settings.autoNext)
        assertTrue(s.settings.leftHandHud)
        assertNull(s.settings.autoSkills)
        assertEquals(2, s.cleared)
        assertEquals(4 + 4 + 1 + 1 - first.cost, s.embers.free)
        assertEquals(s.toJson(), Save.parse(s.toJson()).toJson())
        assertEquals(mapOf(1 to 3), Save.parse("{\"version\":2,\"stars\":{\"1\":1,\"01\":3}}").stars)
    }

    @Test fun oldSaveHasItsTreeNodesRefunded() {
        val owned = data.trees[0].nodes.joinToString(",") { "\"${it.id}\"" }
        val s = Save.parse("{\"version\":1,\"stars\":$perfectStars,\"nodes\":[$owned],\"settings\":{\"sound\":false},\"seenIntro\":true}")
        assertEquals(Save.CURRENT_VERSION, s.version)
        assertEquals(emptyList(), s.nodes)
        assertTrue(s.treesRefunded)
        assertEquals(3, s.stars[20])
        assertFalse(s.settings.sound)
        assertTrue(s.seenIntro)
        assertEquals(0, s.embers.spent)
        assertTrue(Save.parse(s.toJson()).treesRefunded)
        val unversioned = Save.parse("{\"stars\":{\"1\":3},\"nodes\":[$owned]}")
        assertEquals(emptyList(), unversioned.nodes)
        assertTrue(unversioned.treesRefunded)
        assertFalse(Save.parse("{\"version\":1,\"stars\":{\"1\":3},\"nodes\":[]}").treesRefunded)
        assertEquals(Save().toJson(), Save.parse(null).toJson())
        assertEquals(Save().toJson(), Save.parse("{not json").toJson())
    }

    @Test fun currentSaveKeepsItsNodesAndWritesAFile() {
        val s = Save()
        for (id in 1..20) s.stars[id] = 3
        val first = data.trees[0].nodes.first { it.req.isNullOrEmpty() && (it.after ?: 0) == 0 }
        assertTrue(s.buyNode(first.id))
        val file = kotlin.io.path.createTempDirectory().resolve("save.json").toFile()
        Save.write(s, file)
        val back = Save.load(file)
        assertEquals(listOf(first.id), back.nodes)
        assertFalse(back.treesRefunded)
        assertEquals(s.toJson(), back.toJson())
        assertTrue(file.readText().contains("\"version\":${Save.CURRENT_VERSION}"))
    }

    @Test fun saveNeverOwesEmbersOrHoldsANodeWithoutItsPrerequisite() {
        val all = data.trees.flatMap { it.nodes }
        val everything = all.joinToString(",") { "\"${it.id}\"" }
        val s = Save.parse("{\"version\":2,\"stars\":{\"1\":1},\"nodes\":[$everything]}")
        assertTrue(s.embers.free >= 0)
        assertEquals(s.nodes.size, s.nodes.toSet().size)
        for (id in s.nodes) {
            val n = data.nodes.getValue(id)
            if (!n.req.isNullOrEmpty()) assertTrue(n.req in s.nodes)
            if (!n.excl.isNullOrEmpty()) assertFalse(n.excl in s.nodes)
        }
        val needsReq = all.first { !it.req.isNullOrEmpty() }
        assertEquals(emptyList(), Save.parse("{\"version\":2,\"stars\":$perfectStars,\"nodes\":[\"${needsReq.id}\"]}").nodes)
    }

    @Test fun embersForVariantAndOathClears() {
        val s = Save()
        assertEquals(5, s.record(1, 3))
        assertEquals(0, s.record(1, 3))
        assertEquals(1, s.record(1, 2, StageVariant.alt))
        assertEquals(0, s.record(1, 3, StageVariant.alt))
        assertEquals(1, s.record(1, 1, oaths = listOf(OathId.longNight)))
        assertEquals(0, s.record(1, 3, oaths = listOf(OathId.twinRifts, OathId.shiftingEarth)))
        assertEquals(true, s.oathsCleared["1:twinRifts"])
    }

    @Test fun bossRelicsAndEveryTreeKeyIsKnown() {
        assertEquals(0.0, Mods.from(emptyList(), 4).dmgAll)
        assertEquals(0.1, Mods.from(emptyList(), 5).dmgAll)
        assertEquals(0.1, Mods.from(emptyList(), 19).dmgAll)
        assertEquals(0.2, Mods.from(emptyList(), 20).dmgAll)
        assertTrue(Mods.from(emptyList(), 10).tidePearl)
        assertEquals(1, Mods.from(emptyList(), 15).heroSkillPoints)
        val unknown = data.trees.flatMap { it.nodes }.map { it.effect.k }.filter { it !in Mods.knownKeys }
        assertEquals(emptyList(), unknown, "tree effect keys the Kotlin Mods does not fold in")
    }
}
