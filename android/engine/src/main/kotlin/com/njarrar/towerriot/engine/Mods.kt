package com.njarrar.towerriot.engine

/** Every campaign bonus that changes a battle, folded into plain numbers. */
class Mods {
    val towerDmg = HashMap<TowerKind, Double>()
    val towerRange = HashMap<TowerKind, Double>()
    var dmgAll = 0.0
    var rangeAll = 0.0
    var armorPierce = 0.0
    var blast = 0.0
    var slow = 0.0
    var jumps = 0
    var hold = 0.0
    var costMul = 0.0
    val rounds = ArrayList<Rounds>()
    var shatter = false
    var overload = false
    var burnShatter = false
    var roundInherit = false
    var runeAttune = false
    var gateShock = false
    var rateAll = 0.0
    var heroLevel = 0
    var heroSkillPoints = 0
    var sweep = 0.0
    var snare = 0.0
    var attune = 0.0
    var sunrise = 0.0
    var lastHit = 0.0
    var lives = 0
    var gold = 0
    var sell = 0.0
    var early = 0.0
    var ironGate = false
    /** Tidewyrm relic: towers built near water gain +15% range. */
    var tidePearl = false
    /** Towers, hero skills and shop items open so far. */
    var splits = true
    var skillW = true
    var skillR = true
    var shopAfter = 99

    companion object {
        /** Every tree effect key this list folds in. */
        val knownKeys = setOf(
            "towerDmg", "towerRange", "dmgAll", "rangeAll", "armorPierce", "round", "shatter", "overload", "burnShatter",
            "roundInherit", "runeAttune", "gateShock", "ironGate", "costMul", "heroLevel", "blast", "slow", "jumps", "hold",
            "rateAll", "sweep", "snare", "attune", "sunrise", "lastHit", "lives", "gold", "sell", "early",
        )

        /** Fold bought tree nodes and campaign progress into one Mods value. */
        fun from(nodes: List<String>, cleared: Int, data: GameData = GameData.shared): Mods {
            val m = Mods()
            for (id in nodes) {
                val n = data.nodes[id] ?: continue
                val e = n.effect
                val v = e.v ?: 0.0
                when (e.k) {
                    "towerDmg" -> e.tower?.let { m.towerDmg[it] = (m.towerDmg[it] ?: 0.0) + v }
                    "towerRange" -> e.tower?.let { m.towerRange[it] = (m.towerRange[it] ?: 0.0) + v }
                    "dmgAll" -> m.dmgAll += v
                    "rangeAll" -> m.rangeAll += v
                    "armorPierce" -> m.armorPierce += v
                    "round" -> e.round?.let { if (it !in m.rounds) m.rounds.add(it) }
                    "shatter" -> m.shatter = true
                    "overload" -> m.overload = true
                    "burnShatter" -> m.burnShatter = true
                    "roundInherit" -> m.roundInherit = true
                    "runeAttune" -> m.runeAttune = true
                    "gateShock" -> { m.gateShock = true; m.lives += 8 }
                    "ironGate" -> m.ironGate = true
                    "costMul" -> m.costMul += v
                    "heroLevel" -> m.heroLevel += v.toInt()
                    "blast" -> m.blast += v
                    "slow" -> m.slow += v
                    "jumps" -> m.jumps += v.toInt()
                    "hold" -> m.hold += v
                    "rateAll" -> m.rateAll += v
                    "sweep" -> m.sweep += v
                    "snare" -> m.snare += v
                    "attune" -> m.attune += v
                    "sunrise" -> m.sunrise += v
                    "lastHit" -> m.lastHit += v
                    "lives" -> m.lives += v.toInt()
                    "gold" -> m.gold += v.toInt()
                    "sell" -> m.sell += v
                    "early" -> m.early += v
                    // The web engine adds `v` to whatever field the key names. A key this list does not know
                    // would do nothing here, so a test checks that every key in the data is known.
                    else -> {}
                }
                if (n.id == "ar-tempest") m.rateAll += 0.08
                if (n.id == "wr-beacon") m.sunrise += 2
            }
            // Relics from the four bosses.
            if (cleared >= 5) m.dmgAll += 0.1
            if (cleared >= 10) m.tidePearl = true
            if (cleared >= 15) m.heroSkillPoints += 1
            if (cleared >= 20) m.dmgAll += 0.1
            m.skillW = cleared >= 1
            m.skillR = cleared >= 7
            m.splits = cleared >= 8
            m.shopAfter = cleared
            return m
        }
    }
}
