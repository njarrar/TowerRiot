@file:Suppress("EnumEntryName")

package com.njarrar.towerriot.engine

import kotlin.math.max

enum class TargetMode { first, strong, armored, close }

/** What dealt the damage: an element, or the map itself (vents). */
sealed class DamageSource {
    data class El(val el: Element) : DamageSource()
    data object Env : DamageSource()
}

/** A road at battle time: its path, closures, wreck and belts. */
class RoadRt(val def: Road, val path: Path, var active: Boolean, var telegraph: Boolean, var spawnOpen: Boolean) {
    class BarrierState(var hp: Double, val max: Double, val d: Double, val x: Double, val y: Double)
    class BeltState(val from: Double, val to: Double, val mult: Double)

    var closed = false
        internal set
    /** Distance along the road where a tide or lava closure sits, if any. */
    var closeAt: Double? = null
        internal set
    /** Every point along the road where a closure holds foes (a road can pass one ford twice). */
    val closeAts = ArrayList<Double>()
    var barrier: BarrierState? = null
        internal set
    val belts = ArrayList<BeltState>()
    internal var threat = 0.0
    internal var airThreat = 0.0
}

enum class EliteAffix { swift, volatile, wardborn }

class Foe internal constructor(
    val id: Int,
    val kind: EnemyKind,
    val def: EnemyDef,
    road: RoadRt,
    d: Double,
    p: Path.Point,
    off: Double,
    hp: Double,
    val speed: Double,
    /** Crowned Elite affix on Variant B and Oath runs. */
    val affix: EliteAffix? = null,
) {
    var road = road; internal set
    var d = d; internal set
    var x = p.x; internal set
    var y = p.y; internal set
    var dir = p.dir; internal set
    /** Small sideways offset so a crowd does not walk in single file. */
    var off = off; internal set
    var hp = hp; internal set
    val max = hp
    var slow = 0.0; internal set
    var slowT = 0.0; internal set
    var rootT = 0.0; internal set
    var staggerT = 0.0; internal set
    var freezeT = 0.0; internal set
    internal var freezeImmune = 0.0
    var burnT = 0.0; internal set
    internal var burnDps = 0.0
    var lanternBurnT = 0.0; internal set
    internal var lanternBurnDps = 0.0
    var vulnT = 0.0; internal set
    var blocked = false; internal set
    var hidden = false; internal set
    var shielded = false; internal set
    /** Underground (burrower) or under the tide (Tidewyrm). */
    var under = false; internal set
    internal var underT: Double = def.traits?.burrow?.get(1) ?: def.traits?.dive?.every ?: 0.0
    var abilityT: Double = def.traits?.summon?.every ?: def.traits?.lunge?.every ?: def.traits?.stamp?.every ?: 2.0; internal set
    var phase = 0; internal set
    internal var burstT = 0.0
    var hitT = 0.0; internal set
    var dead = false; internal set
    internal var warpedMask = 0
    /** Seconds left in a Cinder Hound's lunge. */
    var lungeT = 0.0; internal set
    /** Glasshide panes left, seconds until the next grows back, and a short gap so one burst breaks one pane. */
    var panes: Int = max(def.traits?.panes?.n ?: 0, if (affix == EliteAffix.wardborn) 1 else 0); internal set
    internal var paneT = 0.0
    internal var paneCd = 0.0
    internal var sporePaneCd = 0.0
    /** Inside a Herald's aura this tick. */
    var warded = false; internal set
    /** The ally a Mender is beaming heal into, and how long its beam stays broken after being held. */
    var healTarget: Int? = null; internal set
    internal var healInterruptT = 0.0
    /** A Sapper still carries its powder keg (it goes off when the Sapper dies). */
    var kegArmed: Boolean = def.traits?.sapper ?: false; internal set
    /** Tether Twins partner: damage splits 50/50 within 160 px. */
    var linkPartnerId: Int? = null; internal set
    /** The Beacon a Wick Leech is draining. */
    var siphonTowerId: Int? = null; internal set
    /** Tidewyrm after a dive: Storm hits it 40% harder. */
    var drenchedT = 0.0; internal set
    /** Hollow Queen's Veil Eclipse: hidden for a while. */
    var eclipseT = 0.0; internal set
    /** Hollow Queen phase 3: flying for a while. */
    var flightT = 0.0; internal set
    internal var bossSkillT: Double = when (def.traits?.bossSkill) { "mire" -> 8.0; "colossus" -> 10.0; "queen" -> 12.0; else -> 0.0 }
    /** Warning before the Brass Colossus vents steam. */
    var ventWarnT = 0.0; internal set
    /** A Rune Stalker off the road, going for a rune or back. */
    internal var detouring = false
}

class Tower internal constructor(
    val id: Int,
    val kind: TowerKind,
    val plot: Int,
    val x: Double,
    val y: Double,
    spent: Int,
    high: Boolean,
) {
    var lv = 1; internal set
    var split: SplitId? = null; internal set
    var spent = spent; internal set
    internal var cd = 0.4
    var mode = TargetMode.first; internal set
    var round: Rounds? = null; internal set
    var aim = 0.0; internal set
    var high = high; internal set
    /** Gear plot lowered this wave: the tower sleeps. */
    var down = false; internal set
    /** Seconds since its last attack, for the renderer. */
    var fired = 9.0; internal set
    internal var shotCount = 0
    /** Seconds left stunned by a Hollow Ram's stamp or a Tide-Spout. */
    var stunT = 0.0; internal set
    /** Seconds left slowed by the Mire King's Bog Glob (a third slower). */
    var bogT = 0.0; internal set
    /** A Wick Leech is draining this Beacon (half its reach). */
    var siphoned = false; internal set
    var dmgDealt = 0.0; internal set
    var kills = 0; internal set
}

enum class ShotKind { bolt, shell }

class Shot internal constructor(
    val id: Int,
    val kind: ShotKind,
    val tower: Int,
    val x0: Double, val y0: Double,
    tx: Double, ty: Double,
    foe: Int,
    t: Double,
    val dur: Double,
    internal val dmg: Double,
    internal val el: Element,
    internal val splash: Double,
    internal val round: Rounds?,
    val crit: Boolean,
) {
    var tx = tx; internal set
    var ty = ty; internal set
    var foe = foe; internal set
    var t = t; internal set
}

class Cloud(val x: Double, val y: Double, val r: Double, val dps: Double, t: Double) {
    var t = t; internal set
}

class PlotRt(val x: Double, val y: Double, val gear: SplitId?, unlocked: Boolean, rubble: RubbleDef?, rubbleLeft: Double) {
    var high = false; internal set
    var nearWater = false; internal set
    var sunk = false; internal set
    var unlocked = unlocked; internal set
    var rubble = rubble; internal set
    var rubbleLeft = rubbleLeft; internal set
}

class WaterRt(val id: String?, val w: Double, val path: Path) {
    var drained = false; internal set
}

class SwitchRt(val def: SwitchDef) {
    var state = 0; internal set
    var activeT = 0.0; internal set
    var cdLeft = 0.0; internal set
    var boosted = false; internal set
}

class PortalRt(
    val def: PortalDef,
    val fromRoad: RoadRt,
    val toRoad: RoadRt,
    val fromD: Double,
    val toD: Double,
    val fromPos: Vec,
    val toPos: Vec,
    active: Boolean,
) {
    var active = active; internal set
    var count = 0; internal set
}

data class DamageBreakdown(var towers: Double = 0.0, var hero: Double = 0.0, var skills: Double = 0.0, var status: Double = 0.0)

enum class Bucket { towers, hero, skills, status }

class VentRt(val x: Double, val y: Double, internal val road: RoadRt, internal val d: Double, internal val every: Double, t: Double, internal val dmg: Double) {
    var t = t; internal set
}

class HeroState(x: Double, y: Double, level: Int, points: Int) {
    var x = x; internal set
    var y = y; internal set
    var tx = x; internal set
    var ty = y; internal set
    var anchorX = x; internal set
    var anchorY = y; internal set
    var hp = 0.0; internal set
    var level = level; internal set
    var xp = 0.0; internal set
    var points = points; internal set
    internal val ranks = IntArray(4)
    internal val cd = DoubleArray(4)
    internal var atkCd = 0.0
    var dead = false; internal set
    var respawnT = 0.0; internal set
    var focus: Int? = null; internal set
    val items = ArrayList<ItemId>()
    internal var revived = false
    var haste = 0.0; internal set
    var double = 0.0; internal set
    var regenT = 0.0; internal set
    var sunriseT = 0.0; internal set
    var attuneSurgeT = 0.0; internal set
    var face = 1.0; internal set
    var swing = 0.0; internal set
    var moving = false; internal set

    fun rank(k: SkillKey): Int = ranks[k.ordinal]
    fun cooldown(k: SkillKey): Double = cd[k.ordinal]
}

class RuneState(val kind: RuneKind, val x: Double, val y: Double, ttl: Double) {
    var ttl = ttl; internal set
}

/** Things that happened in a step, for the screen to show and play. */
sealed class BattleEvent {
    data class Wave(val n: Int, val hint: String) : BattleEvent()
    data class ShotFired(val tower: Int, val kind: ShotKind) : BattleEvent()
    data class Pulse(val tower: Int, val x: Double, val y: Double, val r: Double) : BattleEvent()
    data class Arc(val pts: List<Vec>) : BattleEvent()
    data class Boom(val x: Double, val y: Double, val r: Double) : BattleEvent()
    data class RootEv(val x: Double, val y: Double) : BattleEvent()
    data class Hit(val x: Double, val y: Double, val dmg: Double, val crit: Boolean, val source: DamageSource) : BattleEvent()
    data class Kill(val x: Double, val y: Double, val kind: EnemyKind, val gold: Int, val hero: Boolean) : BattleEvent()
    data class Leak(val x: Double, val y: Double, val lives: Int, val kind: EnemyKind, val hpLeft: Double) : BattleEvent()
    data class Adapt(val el: Element, val resist: Double) : BattleEvent()
    data class ShiftEv(val label: String, val on: Boolean) : BattleEvent()
    data class BarrierEv(val road: String, val broken: Boolean) : BattleEvent()
    data class VentEv(val x: Double, val y: Double) : BattleEvent()
    data class Build(val tower: Int, val x: Double, val y: Double) : BattleEvent()
    data class Upgrade(val tower: Int, val x: Double, val y: Double) : BattleEvent()
    data class Sell(val tower: Int, val x: Double, val y: Double) : BattleEvent()
    data class HeroHit(val x: Double, val y: Double) : BattleEvent()
    data object HeroDown : BattleEvent()
    data object HeroUp : BattleEvent()
    data object Revive : BattleEvent()
    data class Level(val level: Int) : BattleEvent()
    data class Skill(val key: SkillKey, val x: Double, val y: Double) : BattleEvent()
    data class RuneEv(val kind: RuneKind, val picked: Boolean) : BattleEvent()
    data class Buy(val id: ItemId) : BattleEvent()
    data class SellItem(val id: ItemId) : BattleEvent()
    data class Phase(val n: Int, val x: Double, val y: Double) : BattleEvent()
    data class Dive(val x: Double, val y: Double, val under: Boolean) : BattleEvent()
    data class Boss(val kind: EnemyKind) : BattleEvent()
    data class Gear(val up: SplitId) : BattleEvent()
    data class Sink(val plot: Int) : BattleEvent()
    data class Night(val on: Boolean) : BattleEvent()
    data class Early(val gold: Int) : BattleEvent()
    data class RiftWarn(val road: String, val wave: Int) : BattleEvent()
    data class RiftOpen(val road: String) : BattleEvent()
    data class ClearPlot(val plot: Int, val free: Boolean) : BattleEvent()
    data class SwitchFlip(val id: String, val label: String, val state: Int) : BattleEvent()
    data class Terraform(val label: String) : BattleEvent()
    data class Warp(val fromX: Double, val fromY: Double, val toX: Double, val toY: Double, val kind: PortalKind) : BattleEvent()
    data class GateShock(val x: Double, val y: Double) : BattleEvent()
    data class IronGate(val x: Double, val y: Double) : BattleEvent()
    data class HeraldCleanse(val el: Element, val x: Double, val y: Double) : BattleEvent()
    data class RuneStolen(val x: Double, val y: Double) : BattleEvent()
    data class Escape(val x: Double, val y: Double, val kind: EnemyKind) : BattleEvent()
    data class Bog(val tower: Int, val x: Double, val y: Double) : BattleEvent()
    data class Stamp(val x: Double, val y: Double, val r: Double) : BattleEvent()
    data class Pane(val x: Double, val y: Double, val left: Int) : BattleEvent()
    data class Lunge(val x: Double, val y: Double) : BattleEvent()
    data class Won(val stars: Int) : BattleEvent()
    data object Lost : BattleEvent()
}

enum class Status { prep, running, won, lost }

/** Final numbers for a tower right now. */
class TowerStats(
    val dmg: Double, val range: Double, val rate: Double, val crit: Double,
    val jumps: Int, val splash: Double, val shells: Int, val hitsFlying: Boolean,
    val buffs: List<String>,
)
