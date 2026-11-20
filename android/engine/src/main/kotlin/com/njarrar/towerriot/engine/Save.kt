package com.njarrar.towerriot.engine

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import java.io.File
import kotlin.math.max
import kotlin.math.min

/** Player progress. Same shape as the web and iOS saves, so the three are easy to compare. */
class Save {
    class Settings {
        var sound = true
        var reduceMotion = false
        /** Spend Wren's skill points for her. Null means the default: on in the first region, off after. */
        var autoSkills: Boolean? = null
        /** Show damage numbers over foes. */
        var dmgNumbers = false
        var tapGroundMove = false
        var tapAimW = false
        var autoNext = false
        var leftHandHud = false

        fun copy(): Settings = Settings().also {
            it.sound = sound; it.reduceMotion = reduceMotion; it.autoSkills = autoSkills; it.dmgNumbers = dmgNumbers
            it.tapGroundMove = tapGroundMove; it.tapAimW = tapAimW; it.autoNext = autoNext; it.leftHandHud = leftHandHud
        }

        internal fun toJson(): JsonObject = buildJsonObject {
            // Sorted keys, as the iOS save writes them.
            put("autoNext", autoNext)
            autoSkills?.let { put("autoSkills", it) }
            put("dmgNumbers", dmgNumbers)
            put("leftHandHud", leftHandHud)
            put("reduceMotion", reduceMotion)
            put("sound", sound)
            put("tapAimW", tapAimW)
            put("tapGroundMove", tapGroundMove)
        }

        companion object {
            internal fun fromJson(o: JsonObject?): Settings {
                val s = Settings()
                if (o == null) return s
                fun b(k: String) = (o[k] as? JsonPrimitive)?.booleanOrNull
                s.sound = b("sound") ?: true
                s.reduceMotion = b("reduceMotion") ?: false
                s.autoSkills = b("autoSkills")
                s.dmgNumbers = b("dmgNumbers") ?: false
                s.tapGroundMove = b("tapGroundMove") ?: false
                s.tapAimW = b("tapAimW") ?: false
                s.autoNext = b("autoNext") ?: false
                s.leftHandHud = b("leftHandHud") ?: false
                return s
            }
        }
    }

    var version = CURRENT_VERSION
    /** Best stars per stage id (Standard). */
    val stars = HashMap<Int, Int>()
    /** Best stars per stage id in Replay Variant B (`alt`). */
    val altStars = HashMap<Int, Int>()
    /** Best stars earned with at least one Challenge Oath active. */
    val oathStars = HashMap<Int, Int>()
    /** Unlocked Oath badges keyed by "stageId:oath". */
    val oathsCleared = HashMap<String, Boolean>()
    /** Bought tree nodes. */
    val nodes = ArrayList<String>()
    var settings = Settings()
    var seenIntro = false
    /** True after an older save had its tree nodes refunded, until the player has seen the note on the trees screen. */
    var treesRefunded = false

    /** Drop nodes a save cannot hold: a missing prerequisite, both of an either-or pair, or more than its Embers pay for. */
    private fun pruneNodes() {
        val data = GameData.shared
        val known = data.nodes
        val cl = cleared
        var changed = true
        while (changed) {
            changed = false
            val keep = ArrayList<String>()
            for (id in nodes) {
                var ok = false
                val n = known[id]
                val tree = n?.let { data.treeOf(it) }
                if (n != null && tree != null && id !in keep) {
                    val unlocked = tree.after <= cl && (n.after ?: 0) <= cl
                    val reqOk = n.req.isNullOrEmpty() || n.req in nodes
                    val exclHit = !n.excl.isNullOrEmpty() && n.excl in keep
                    ok = unlocked && reqOk && !exclHit
                }
                if (ok) keep.add(id) else changed = true
            }
            nodes.clear(); nodes.addAll(keep)
            if (!changed && nodes.isNotEmpty() && embers.free < 0) { nodes.removeAt(nodes.size - 1); changed = true }
        }
    }

    // ---------------------------------------------------------------- progress

    /** Highest stage id cleared in a row from stage 1. */
    val cleared: Int
        get() {
            var n = 0
            for (st in GameData.shared.stages) { if ((stars[st.id] ?: 0) > 0) n = st.id else break }
            return n
        }

    fun isUnlocked(id: Int): Boolean = id <= cleared + 1
    val totalStars: Int get() = stars.values.sum()
    val totalAltStars: Int get() = altStars.values.sum()

    class Embers(val earned: Int, val spent: Int, val free: Int)

    /** Embers: 1 per star + 2 per standard clear + 1 per Variant B clear + 1 per Oath clear, minus what trees cost. */
    val embers: Embers
        get() {
            val std = totalStars + 2 * stars.values.count { it > 0 }
            val alt = altStars.values.count { it > 0 }
            val oath = oathStars.values.count { it > 0 }
            val earned = std + alt + oath
            val spent = nodes.sumOf { GameData.shared.nodes[it]?.cost ?: 0 }
            return Embers(earned, spent, earned - spent)
        }

    fun canBuyNode(id: String): Boolean {
        val data = GameData.shared
        val n = data.nodes[id] ?: return false
        if (id in nodes) return false
        val tree = data.treeOf(n) ?: return false
        val cl = cleared
        if (tree.after > cl || (n.after ?: 0) > cl) return false
        if (!n.req.isNullOrEmpty() && n.req !in nodes) return false
        if (!n.excl.isNullOrEmpty() && n.excl in nodes) return false
        return embers.free >= n.cost
    }

    fun buyNode(id: String): Boolean {
        if (!canBuyNode(id)) return false
        nodes.add(id)
        return true
    }

    /** Refund every node. Free, so players can try other builds. */
    fun resetTrees() = nodes.clear()

    /** Record a result; keeps the best stars across standard / Variant B / Oaths. Returns Embers newly earned. */
    fun record(stage: Int, stars: Int, variant: StageVariant = StageVariant.standard, oaths: List<OathId> = emptyList()): Int {
        val before = embers.earned
        if (variant == StageVariant.alt) altStars[stage] = max(altStars[stage] ?: 0, stars)
        else this.stars[stage] = max(this.stars[stage] ?: 0, stars)
        if (oaths.isNotEmpty()) {
            oathStars[stage] = max(oathStars[stage] ?: 0, stars)
            for (o in oaths) oathsCleared["$stage:${o.name}"] = true
        }
        return embers.earned - before
    }

    val mods: Mods get() = Mods.from(nodes, cleared)

    // ---------------------------------------------------------------- JSON

    fun toJson(): String {
        fun starsJson(m: Map<Int, Int>) = buildJsonObject { for (k in m.keys.map { it.toString() }.sorted()) put(k, m.getValue(k.toInt())) }
        val o = buildJsonObject {
            put("altStars", starsJson(altStars))
            put("nodes", buildJsonArray { for (n in nodes) add(JsonPrimitive(n)) })
            put("oathStars", starsJson(oathStars))
            put("oathsCleared", buildJsonObject { for (k in oathsCleared.keys.sorted()) put(k, oathsCleared.getValue(k)) })
            put("seenIntro", seenIntro)
            put("settings", settings.toJson())
            put("stars", starsJson(stars))
            put("treesRefunded", treesRefunded)
            put("version", version)
        }
        return o.toString()
    }

    companion object {
        /** Version 2: the trees were rebalanced (new costs, new prerequisites, three nodes replaced). */
        const val CURRENT_VERSION = 2

        /** JSON object keys are strings; accept "3": 2 as stage 3 with two stars. Two keys that name the
         *  same stage ("1" and "01") keep the better result. */
        private fun starMap(e: JsonElement?, into: HashMap<Int, Int>) {
            val o = e as? JsonObject ?: return
            for ((k, v) in o) {
                val id = k.toIntOrNull() ?: continue
                val n = (v as? JsonPrimitive)?.intOrNull ?: continue
                val c = max(0, min(3, n))
                into[id] = max(into[id] ?: 0, c)
            }
        }

        /** A broken or missing save starts fresh; the game always runs. */
        fun parse(text: String?): Save {
            if (text == null) return Save()
            val o = try { Json.parseToJsonElement(text).jsonObject } catch (_: Exception) { return Save() }
            val s = Save()
            val old = (o["version"] as? JsonPrimitive)?.intOrNull != CURRENT_VERSION
            starMap(o["stars"], s.stars)
            starMap(o["altStars"], s.altStars)
            starMap(o["oathStars"], s.oathStars)
            (o["oathsCleared"] as? JsonObject)?.forEach { (k, v) -> (v as? JsonPrimitive)?.booleanOrNull?.let { s.oathsCleared[k] = it } }
            val known = GameData.shared.nodes
            val rawNodes = try { o["nodes"]?.jsonArray?.mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content } } catch (_: Exception) { null }
            // An older save bought its nodes at the old prices: refund them all rather than leave the player in debt.
            if (!old) s.nodes.addAll((rawNodes ?: emptyList()).filter { known[it] != null })
            s.settings = Settings.fromJson(o["settings"] as? JsonObject)
            s.seenIntro = (o["seenIntro"] as? JsonPrimitive)?.booleanOrNull ?: false
            val hadNodes = !rawNodes.isNullOrEmpty()
            s.treesRefunded = if (old) hadNodes else (o["treesRefunded"] as? JsonPrimitive)?.booleanOrNull ?: false
            s.pruneNodes()
            return s
        }

        fun load(file: File): Save = parse(try { file.readText() } catch (_: Exception) { null })

        /** Write next to the old file, then move it over, so a crash mid-write never loses a save. */
        fun write(save: Save, file: File) {
            try {
                file.parentFile?.mkdirs()
                val tmp = File(file.parentFile, file.name + ".tmp")
                tmp.writeText(save.toJson())
                if (!tmp.renameTo(file)) { file.writeText(save.toJson()); tmp.delete() }
            } catch (_: Exception) { /* the game keeps running; the next write tries again */ }
        }
    }
}
