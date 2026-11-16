package com.njarrar.towerriot.engine

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlin.math.max

/** Every fixed number in the game, loaded once from the bundled JSON. */
class GameData private constructor(f: File) {
    @Serializable
    private class File(
        val maxTowerLevel: Int,
        val towers: List<TowerDef>,
        val beaconBuff: List<Double>,
        val enemies: List<EnemyDef>,
        val hero: HeroDef,
        val skills: List<SkillDef>,
        val sweep: SweepDef, val snare: SnareDef, val attune: AttuneDef, val sunrise: SunriseDef,
        val items: List<ItemDef>,
        val itemSlots: Int,
        val sellItem: Double,
        val courierSurcharge: Double,
        val runes: List<RuneDef>,
        val runeFirst: Double, val runeEvery: Double, val runeLifetime: Double, val runeWarnSec: Double,
        val trees: List<TreeDef>,
        val regions: List<RegionDef>,
        val stages: List<StageDef>,
    )

    val maxTowerLevel = f.maxTowerLevel
    val towers: Map<TowerKind, TowerDef> = f.towers.associateBy { it.kind }
    val towerOrder: List<TowerKind> = f.towers.map { it.kind }
    /** Damage bonus a beacon gives to towers in its light, by level. */
    val beaconBuff = f.beaconBuff
    val enemies: Map<EnemyKind, EnemyDef> = f.enemies.associateBy { it.kind }
    val hero = f.hero
    val skills: Map<SkillKey, SkillDef> = f.skills.associateBy { it.key }
    val sweep = f.sweep
    val snare = f.snare
    val attune = f.attune
    val sunrise = f.sunrise
    val items: Map<ItemId, ItemDef> = f.items.associateBy { it.id }
    val itemOrder: List<ItemId> = f.items.map { it.id }
    val itemSlots = f.itemSlots
    val sellItem = f.sellItem
    val courierSurcharge = f.courierSurcharge
    val runes: Map<RuneKind, RuneDef> = f.runes.associateBy { it.kind }
    val runeOrder: List<RuneKind> = f.runes.map { it.kind }
    val runeFirst = f.runeFirst
    val runeEvery = f.runeEvery
    val runeLifetime = f.runeLifetime
    val runeWarnSec = f.runeWarnSec
    val trees = f.trees
    val nodes: Map<String, TreeNode> = f.trees.flatMap { it.nodes }.associateBy { it.id }
    val regions = f.regions
    val stages = f.stages

    fun tower(k: TowerKind) = towers.getValue(k)
    fun enemy(k: EnemyKind) = enemies.getValue(k)
    fun skill(k: SkillKey) = skills.getValue(k)
    fun item(k: ItemId) = items.getValue(k)
    fun rune(k: RuneKind) = runes.getValue(k)
    fun stage(id: Int) = stages.first { it.id == id }
    fun treeOf(node: TreeNode): TreeDef? = trees.firstOrNull { t -> t.nodes.any { it.id == node.id } }

    companion object {
        const val SPLIT_MASTERY_DMG = 1.24
        const val SPLIT_MASTERY_RANGE = 1.08

        private val json = Json { ignoreUnknownKeys = true }

        fun parse(text: String): GameData = GameData(json.decodeFromString(File.serializer(), text))

        /** The data that ships with the game. */
        val shared: GameData by lazy {
            val stream = GameData::class.java.getResourceAsStream("/game-data.json")
                ?: error("game-data.json is missing. Run npm run native:data.")
            parse(stream.bufferedReader().use { it.readText() })
        }
    }
}

/** Health scale per stage so later stages hit harder. The Ashen Rift (16 to 20) climbs twice as fast. */
fun hpScale(stage: Int): Double = 1 + (stage - 1) * 0.06 + max(0, stage - 15) * 0.1

/** Gold per kill grows a little so later stages can afford their towers. */
fun goldScale(stage: Int): Double = 1.4 + (stage - 1) * 0.05

/** Armor scales slower than health. */
@Suppress("UNUSED_PARAMETER")
fun armorScale(stage: Int): Double = 1.0
