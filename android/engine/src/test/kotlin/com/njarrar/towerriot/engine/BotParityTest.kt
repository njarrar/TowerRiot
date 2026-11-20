package com.njarrar.towerriot.engine

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** The Kotlin engine must play every stage exactly as the web and iOS engines do. */
class BotParityTest {
    @Serializable
    private class Row(
        val stage: Int, val won: Boolean, val lives: Int, val waves: Int, val level: Int,
        val gold: Int, val towers: Int, val kills: Int, val clock: Double,
        val variant: StageVariant = StageVariant.standard, val oaths: List<OathId> = emptyList(),
    ) {
        val result get() = Bot.Result(stage, won, lives, waves, level, gold, towers, kills, clock)
        val isStandard get() = variant == StageVariant.standard && oaths.isEmpty()
        val label get() = "stage $stage ${variant.name} [${oaths.joinToString(",") { it.name }}]"
    }

    @Test
    fun everyStageMatchesTheWebBot() {
        val text = javaClass.getResourceAsStream("/bot-results.json")!!.bufferedReader().use { it.readText() }
        val rows = Json { ignoreUnknownKeys = true }.decodeFromString<List<Row>>(text)
        assertEquals((1..20).toList(), rows.filter { it.isStandard }.map { it.stage }, "one standard row per stage, in order")
        val misses = ArrayList<String>()
        for (row in rows) {
            val (_, r) = Bot.play(row.stage, Bot.typicalMods(row.stage), variant = row.variant, oaths = row.oaths)
            if (r != row.result) misses.add("${row.label}\n  want ${row.result}\n  got  $r")
            if (row.isStandard) assertTrue(r.won, "the bot should win ${row.label}")
        }
        assertTrue(misses.isEmpty(), "${misses.size} of ${rows.size} rows differ:\n" + misses.joinToString("\n"))
    }
}
