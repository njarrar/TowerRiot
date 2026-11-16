@file:Suppress("EnumEntryName")

package com.njarrar.towerriot.engine

import kotlinx.serialization.Serializable
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

// The game's data, decoded from game-data.json. That file is made from the web game's TypeScript data
// (see tests/native-data.test.ts), so every build of the game shares the same towers, foes, stages and trees.
// Enum entries keep the data's own spelling, so `name` is the value written in the JSON.

@Serializable enum class TowerKind { watch, cannon, bell, pylon, roots, beacon }
@Serializable enum class Element { pierce, fire, frost, storm, nature, hero }
@Serializable enum class Rounds { ember, frost, storm }
@Serializable enum class SplitId { a, b }
@Serializable enum class SkillKey { q, w, e, r }
@Serializable enum class ItemId { boots, blade, ring, plate, cleave, lantern, dawnspear, emberspear, dawnmantle, seconddawn }
@Serializable enum class RuneKind { haste, double, regen, bounty }
@Serializable enum class OathId { twinRifts, shiftingEarth, longNight }
@Serializable enum class StageVariant { standard, alt }

@Serializable enum class RubbleKind { ruin, crane, boulder, slag }

@Serializable
data class RubbleDef(
    val kind: RubbleKind,
    val cost: Int,
    /** Optional seconds for Wren standing within 48 px to clear this plot for free (0 gold). */
    val holdSec: Double? = null,
)

@Serializable
enum class EnemyKind {
    grub, skitter, shell, moth, warden, mender, shade, splitter, sapper, burrower, ashmoth, elite,
    husk, hound, glasshide, veilmoth, ram, herald,
    mireking, tidewyrm, colossus, queen,
}

@Serializable
data class SplitDef(
    val id: SplitId,
    val name: String,
    val desc: String,
    val cost: Double,
    val masteryCost: Double,
    val masteryName: String,
    val masteryDesc: String,
    val dmgMul: Double,
    val rangeMul: Double,
    val rateMul: Double,
    val crit: Double? = null,
    val shells: Int? = null,
    val jumpsDelta: Int? = null,
    val jumpsOverride: Int? = null,
    val splashMul: Double? = null,
)

@Serializable
data class TowerDef(
    val kind: TowerKind,
    val name: String,
    val blurb: String,
    val element: Element,
    /** Cost to build (index 0) and to reach level 2 and 3. */
    val cost: List<Double>,
    val dmg: List<Double>,
    val range: List<Double>,
    /** Seconds between attacks. */
    val rate: List<Double>,
    val hitsFlying: Boolean,
    val splits: List<SplitDef>,
)

@Serializable
data class Traits(
    val shield: Double? = null,
    val heal: Double? = null,
    val stealth: Boolean? = null,
    val splitInto: Split? = null,
    val sapper: Boolean? = null,
    /** Seconds underground, then seconds on the surface. */
    val burrow: List<Double>? = null,
    val armor: Double? = null,
    val plated: Double? = null,
    val summon: Summon? = null,
    val dive: Dive? = null,
    /** Every `every` seconds it runs at `mult` speed for `dur` seconds, unless slowed, held or frozen. */
    val lunge: Lunge? = null,
    /** Glass panes: each hit breaks one pane and does no harm. A lost pane grows back after `regrow` seconds. */
    val panes: Panes? = null,
    /** Every `every` seconds it stamps: towers within `r` px stop for `stun` seconds, unless it is held. */
    val stamp: Stamp? = null,
    /** Only Wren's lantern, a Beacon, the lighthouse or Sunrise reveal it. */
    val veil: Boolean? = null,
    /** Foes within `r` px take `cut` less damage from the element used most this wave. */
    val aura: Aura? = null,
    val phases: List<Double>? = null,
    val boss: Boolean? = null,
) {
    @Serializable data class Split(val kind: EnemyKind, val n: Int)
    @Serializable data class Summon(val kind: EnemyKind, val n: Int, val every: Double)
    @Serializable data class Dive(val every: Double, val dur: Double)
    @Serializable data class Lunge(val every: Double, val dur: Double, val mult: Double)
    @Serializable data class Panes(val n: Int, val regrow: Double)
    @Serializable data class Stamp(val every: Double, val r: Double, val stun: Double)
    @Serializable data class Aura(val r: Double, val cut: Double)
}

@Serializable
data class EnemyDef(
    val kind: EnemyKind,
    val name: String,
    val hp: Double,
    val speed: Double,
    val gold: Double,
    val leak: Int,
    val flying: Boolean? = null,
    val takes: Map<String, Double>? = null,
    val dps: Double,
    val bar: Double,
    val size: Double,
    val traits: Traits? = null,
    val blurb: String,
    /** The towers that beat it, for the field guide and the first time it shows up. */
    val answer: String,
) {
    val isFlying: Boolean get() = flying ?: false
    val isBoss: Boolean get() = traits?.boss ?: false
}

@Serializable
data class HeroDef(
    val maxLevel: Int,
    val hp: Double, val hpPerLevel: Double,
    val dmg: Double, val dmgPerLevel: Double,
    val atkRate: Double,
    val reach: Double, val leash: Double, val aggro: Double,
    val speed: Double,
    val regen: Double,
    val gateRegen: Double, val gateRadius: Double,
    val blocks: Int,
    val sight: Double,
    val xpRadius: Double,
    /** Share of XP she still gets from kills outside that radius. */
    val xpFar: Double,
    val lastHit: Double,
    val respawnBase: Double,
    val respawnPerLevel: Double,
) {
    fun respawn(level: Int): Double = respawnBase + level * respawnPerLevel
}

/** XP needed to go from `level` to `level + 1`. */
fun xpToNext(level: Int): Double = 50 + 30 * level.toDouble()

@Serializable
data class SkillDef(
    val key: SkillKey,
    val name: String,
    val desc: String,
    val maxRank: Int,
    val cd: List<Double>,
    /** Hero level needed for each rank (index rank - 1). */
    val needLevel: List<Int>,
)

@Serializable data class SweepDef(val dmg: List<Double>, val radius: Double)
@Serializable data class SnareDef(val hold: List<Double>, val dmg: List<Double>, val radius: Double, val range: Double, val burnSec: Double, val burnDpsMul: Double)
@Serializable data class AttuneDef(val rate: List<Double>, val radius: Double)
@Serializable data class SunriseDef(val dur: List<Double>)

@Serializable
data class ItemDef(
    val id: ItemId,
    val name: String,
    val cost: Double,
    val desc: String,
    /** Stage you must clear before the shop sells it. */
    val after: Int,
    val speed: Double? = null, val dmg: Double? = null, val regen: Double? = null, val hp: Double? = null,
    val armor: Double? = null, val atkSpeed: Double? = null,
    val cleave: Double? = null, val sight: Double? = null, val sunder: Double? = null, val auraDmg: Double? = null,
    val revive: Boolean? = null,
)

@Serializable data class RuneDef(val kind: RuneKind, val name: String, val desc: String, val dur: Double, val color: String)

@Serializable data class Effect(val k: String, val tower: TowerKind? = null, val round: Rounds? = null, val v: Double? = null)

@Serializable
data class TreeNode(
    val id: String,
    val name: String,
    val desc: String,
    val cost: Int,
    val req: String? = null,
    val after: Int? = null,
    val excl: String? = null,
    val effect: Effect,
)

@Serializable data class TreeDef(val id: String, val name: String, val blurb: String, val after: Int, val nodes: List<TreeNode>)
@Serializable data class RegionDef(val name: String, val rule: String, val color: String)

@Serializable
data class Road(
    val id: String,
    val spawn: String,
    val ctrl: List<Vec>,
    val w: Double,
    val openAtWave: Int? = null,
    val closeAtWave: Int? = null,
    val openOnPhase: Int? = null,
)

@Serializable
data class Plot(
    val at: Vec,
    val gear: SplitId? = null,
    val sinkAt: Int? = null,
    val openAtWave: Int? = null,
    val rubble: RubbleDef? = null,
)

@Serializable data class Water(val id: String? = null, val ctrl: List<Vec>, val w: Double, val drainAtWave: Int? = null)

/** A timed rule that closes roads: a tide over a ford, lava over a pass. */
@Serializable
data class Shift(
    val kind: String,
    val closes: List<String>,
    val every: Double,
    val start: Double,
    val dur: Double,
    val at: Vec,
    val r: Double,
    val label: String,
)

@Serializable data class Barrier(val road: String, val at: Double, val hp: Double)
@Serializable data class Belt(val road: String, val from: Double, val to: Double, val mult: Double)
@Serializable data class Vent(val road: String, val at: Double, val every: Double, val dmg: Double)

@Serializable enum class SwitchMode { fork, gate, belt }

@Serializable
data class SwitchDef(
    val id: String,
    val label: String,
    val at: Vec,
    val mode: SwitchMode,
    val closesA: List<String>? = null,
    val closesB: List<String>? = null,
    val dur: Double? = null,
    val cd: Double,
    val targetRoad: String? = null,
    val beltMult: Double? = null,
)

@Serializable enum class TerraformKind { drain, flood, quakelow, raisehigh, overdrivebelts }

@Serializable
data class TerraformDef(
    val atWave: Int? = null,
    val atPhase: Int? = null,
    val kind: TerraformKind,
    val label: String,
    val waters: List<String>? = null,
    val openRoads: List<String>? = null,
    val closeRoads: List<String>? = null,
    val openPlots: List<Int>? = null,
    val sinkPlots: List<Int>? = null,
    val highPoly: List<Vec>? = null,
)

@Serializable enum class PortalKind { tunnel, rift, chute }

@Serializable
data class PortalDef(
    val id: String,
    val kind: PortalKind,
    val fromRoad: String,
    val fromAt: Double,
    val toRoad: String,
    val toAt: Double,
    val openAtWave: Int? = null,
    val everyNth: Int? = null,
    val groundOnly: Boolean? = null,
)

@Serializable
data class StageAlt(
    val name: String,
    val twist: String,
    val reverseRoads: List<String>? = null,
    val openAtWave: Map<String, Int>? = null,
    val rubblePlots: List<RubblePlot>? = null,
    val sinkPlots: List<Int>? = null,
    val swapGears: Boolean? = null,
    val heroStart: Vec? = null,
    val night: Boolean? = null,
    val weather: String? = null,
    val adaptEvery: Int? = null,
    /** Every portal opens on this wave instead of its own. */
    val portalOpenAtWave: Int? = null,
    /** Tides, lava and steam cycle this much faster or slower (0.8 = every 40 s instead of 50 s). */
    val shiftEveryMul: Double? = null,
    /** Foe health for this layout, on top of the stage's own `hpMul`. */
    val hpMul: Double? = null,
) {
    @Serializable data class RubblePlot(val plot: Int, val kind: RubbleKind, val cost: Int, val holdSec: Double? = null)
}

@Serializable data class Group(val kind: EnemyKind, val n: Int, val gap: Double, val spawn: String? = null, val delay: Double)
@Serializable data class WaveDef(val hint: String, val groups: List<Group>)

@Serializable
data class StageDef(
    val id: Int,
    val name: String,
    val region: Int,
    val twist: String,
    val newFoe: String,
    val unlocks: String,
    val startGold: Int,
    val lives: Int,
    val towers: List<TowerKind>,
    val roads: List<Road>,
    val waters: List<Water>,
    val lava: Boolean? = null,
    val high: List<Vec>? = null,
    val plots: List<Plot>,
    /** Each bridge is [x, y, angle, half length]. */
    val bridges: List<List<Double>>,
    /** Where runes appear. */
    val rune: Vec,
    val heroStart: Vec,
    val shifts: List<Shift>? = null,
    val barriers: List<Barrier>? = null,
    val belts: List<Belt>? = null,
    val vents: List<Vent>? = null,
    val switches: List<SwitchDef>? = null,
    val terraforms: List<TerraformDef>? = null,
    val portals: List<PortalDef>? = null,
    val alt: StageAlt? = null,
    val weather: String? = null,
    /** Night falls on even waves (or all waves under longNight). */
    val night: Boolean? = null,
    /** A fixed lighthouse that lights a wide circle. */
    val lighthouse: Vec? = null,
    /** Extra foe health for this stage, on top of the usual climb. */
    val hpMul: Double? = null,
    val adaptEvery: Int? = null,
    val waves: List<WaveDef>,
) {
    val isLava: Boolean get() = lava ?: false

    /** Rift ids in the order they first appear, each with the roads that leave it. */
    val spawns: List<Pair<String, List<Road>>>
        get() {
            val ids = ArrayList<String>()
            val map = HashMap<String, ArrayList<Road>>()
            for (r in roads) {
                val l = map[r.spawn]
                if (l != null) l.add(r) else { ids.add(r.spawn); map[r.spawn] = arrayListOf(r) }
            }
            return ids.map { it to map[it]!!.toList() }
        }

    /** Apply Replay Variant B (`alt`) and Challenge Oaths deterministically (zero RNG). */
    fun resolved(variant: StageVariant = StageVariant.standard, oaths: List<OathId> = emptyList()): StageDef {
        var out = this
        val a = alt
        if (variant == StageVariant.alt && a != null) {
            out = out.copy(twist = "${a.name}: ${a.twist}")
            val rev = a.reverseRoads
            if (!rev.isNullOrEmpty()) {
                val set = rev.toSet()
                out = out.copy(roads = out.roads.map { r -> if (r.id in set) r.copy(ctrl = reverseCtrl(r.ctrl)) else r })
            }
            a.openAtWave?.let { openMap ->
                // A road given a wave to open on no longer waits for a boss phase.
                out = out.copy(roads = out.roads.map { r -> openMap[r.id]?.let { w -> r.copy(openOnPhase = null, openAtWave = w) } ?: r })
            }
            val plots = out.plots.toMutableList()
            a.rubblePlots?.let { rps ->
                for (rp in rps) if (rp.plot >= 0 && rp.plot < plots.size) {
                    plots[rp.plot] = plots[rp.plot].copy(rubble = RubbleDef(rp.kind, rp.cost, rp.holdSec))
                }
            }
            a.sinkPlots?.let { sp ->
                for (idx in sp) if (idx >= 0 && idx < plots.size) plots[idx] = plots[idx].copy(sinkAt = plots[idx].sinkAt ?: 5)
            }
            if (a.swapGears == true) {
                for (i in plots.indices) {
                    val g = plots[i].gear ?: continue
                    plots[i] = plots[i].copy(gear = if (g == SplitId.a) SplitId.b else SplitId.a)
                }
            }
            out = out.copy(plots = plots)
            a.heroStart?.let { out = out.copy(heroStart = it) }
            a.night?.let { out = out.copy(night = it) }
            a.weather?.let { out = out.copy(weather = it) }
            a.adaptEvery?.let { out = out.copy(adaptEvery = it) }
            a.portalOpenAtWave?.let { pw -> out = out.copy(portals = out.portals?.map { it.copy(openAtWave = pw) }) }
            val mul = a.shiftEveryMul
            val sh = out.shifts
            if (mul != null && !sh.isNullOrEmpty()) out = out.copy(shifts = scaleShifts(sh, mul))
            a.hpMul?.let { hm -> out = out.copy(hpMul = (hpMul ?: 1.0) * hm) }
        }
        if (OathId.twinRifts in oaths) {
            // Roads and portals wake at once. Plots keep their own schedule: early ground would be a gift, not a challenge.
            // A road a boss breaks open at a health phase still waits for the boss.
            out = out.copy(
                roads = out.roads.map { r -> if (r.openOnPhase != null) r else r.copy(openAtWave = 1) },
                portals = out.portals?.map { it.copy(openAtWave = 1) },
                hpMul = (out.hpMul ?: 1.0) * TWIN_RIFTS_HP,
            )
        }
        if (OathId.shiftingEarth in oaths) {
            // A tide that holds foes at a ford is the player's friend, so the oath cuts every closure short.
            val sh = out.shifts
            if (!sh.isNullOrEmpty()) out = out.copy(shifts = sh.map { s -> s.copy(dur = max(4.0, jsRound(s.dur * SHIFTING_EARTH_DUR))) })
            val n = out.waves.size.toDouble()
            val first = max(2, jsRound(n * 0.4).toInt())
            val at = listOf(first, max(first + 1, jsRound(n * 0.7).toInt()))
            val plots = out.plots.toMutableList()
            for ((k, pi) in shiftingPlots(out).withIndex()) plots[pi] = plots[pi].copy(sinkAt = at[k])
            out = out.copy(plots = plots)
        }
        if (OathId.longNight in oaths) out = out.copy(night = true)
        if (variant == StageVariant.alt || OathId.twinRifts in oaths) out = out.copy(waves = seedEarlyRifts(out, this))
        return out
    }

    companion object {
        /** Twin Rifts: every foe is this much tougher. More foes would also pay more gold, which made the oath easier, not harder. */
        const val TWIN_RIFTS_HP = 1.15
        /** Shifting Earth: every tide, lava flow and steam burst holds its road shut for this share of its usual time. */
        const val SHIFTING_EARTH_DUR = 0.6
        /** Shifting Earth: a tower on a sinking plot pays back this share of its cost, not all of it. */
        const val SHIFTING_EARTH_REFUND = 0.5

        private fun reverseCtrl(ctrl: List<Vec>): List<Vec> {
            val rev = ctrl.reversed().toMutableList()
            if (rev.isNotEmpty()) {
                val last = rev.size - 1
                rev[last] = Vec(clamp(rev[last].x, 85.0, 1195.0), clamp(rev[last].y, 115.0, 650.0))
            }
            return rev
        }

        /** Speed a shift cycle up or down. The phase of each shift scales with it, and a cycle never
         *  gets so short that two half-phase shifts overlap. */
        private fun scaleShifts(shifts: List<Shift>, mul: Double): List<Shift> = shifts.map { s ->
            val every = max(ceil(s.dur * 2.1), jsRound(s.every * mul))
            s.copy(every = every, start = jsRound(s.start * every / s.every))
        }

        /** A road that now opens before any wave is sent to its rift would stand empty.
         *  Each wave from its new opening until the first wave already aimed at that rift sends a splinter group there. */
        private fun seedEarlyRifts(out: StageDef, orig: StageDef): List<WaveDef> {
            val list: MutableList<MutableList<Group>> = out.waves.map { it.groups.toMutableList() }.toMutableList()
            val seeded = HashSet<String>()
            for (r in out.roads) {
                val was = orig.roads.firstOrNull { it.id == r.id } ?: continue
                if (r.openOnPhase != null || r.spawn in seeded) continue
                val now = r.openAtWave ?: 1
                if (now >= (was.openAtWave ?: 1) && was.openOnPhase == null) continue
                // Untagged stage: the rift is shared and already fed.
                val first = list.indexOfFirst { groups -> groups.any { it.spawn == r.spawn } }
                if (first < 0) continue
                seeded.add(r.spawn)
                var wi = max(0, now - 1)
                while (wi < first) {
                    val crowd = list[wi].filter { it.n >= 3 }.sortedWith { x, y -> y.n.compareTo(x.n) }.firstOrNull()
                    if (crowd != null) {
                        val n = max(2, ceil(crowd.n * 0.4).toInt())
                        list[wi].add(Group(crowd.kind, n, crowd.gap, r.spawn, crowd.delay + 2))
                    }
                    wi++
                }
            }
            return out.waves.mapIndexed { i, w -> WaveDef(w.hint, list[i].toList()) }
        }

        /** Shifting Earth: the two open plots closest to a road sink mid-battle. */
        private fun shiftingPlots(out: StageDef): List<Int> {
            val bends = ArrayList<Vec>()
            for (r in out.roads) {
                if (r.openOnPhase != null) continue
                var i = 1
                while (i < r.ctrl.size - 1) { bends.add(r.ctrl[i]); i++ }
            }
            class Cand(val i: Int, val pl: Plot, val d: Double)
            val all = out.plots.mapIndexed { i, pl ->
                var d = Double.POSITIVE_INFINITY
                for (b in bends) d = min(d, hypot2(b.x - pl.at.x, b.y - pl.at.y))
                Cand(i, pl, d)
            }
            val open = all.filter { c -> c.pl.sinkAt == null && c.pl.gear == null && c.pl.rubble == null && (c.pl.openAtWave ?: 1) <= 1 }
            val cand = open.sortedWith { l, r -> if (l.d != r.d) l.d.compareTo(r.d) else l.i.compareTo(r.i) }
            if (cand.size < 4) return emptyList()
            val a = cand[0]
            val far = cand.firstOrNull { c -> c.i != a.i && hypot2(c.pl.at.x - a.pl.at.x, c.pl.at.y - a.pl.at.y) >= 220 }
            val b = far ?: cand[1]
            return listOf(a.i, b.i)
        }
    }
}
