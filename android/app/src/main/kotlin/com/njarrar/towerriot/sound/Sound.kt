package com.njarrar.towerriot.sound

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

/** The game's sounds, made on the fly like the web game's WebAudio synth (src/audio/sfx.ts): no files, fully offline.
 *  Each sound is a few tones with pitch sweeps and short bursts of filtered noise. A port of the iOS Sound. */
class Sound {
    enum class Sfx { bolt, boom, zap, bell, root, coin, level, leak, wave, build, click, sweep, snare, sunrise, rune, boss, win, lose, hero, switchFlip, clear, warp }

    private val rate = 44100.0
    private val lock = Object()
    private val voices = ArrayList<Voice>()
    private var clock = 0.0
    private val last = HashMap<Sfx, Double>()
    private var gain = 0.5
    private var targetGain = 0.5
    private var track: AudioTrack? = null
    private var thread: Thread? = null
    @Volatile private var running = false
    @Volatile private var awake = true

    /** Muting also silences any sound already playing, not just the next one. */
    var enabled = true
        set(v) { field = v; synchronized(lock) { targetGain = if (v) 0.5 else 0.0 } }

    /** Start the audio thread. Safe to call again after `stop`. */
    fun start() {
        if (running) return
        running = true
        val t = Thread({ loop() }, "TowerRiot sound")
        t.isDaemon = true
        thread = t
        t.start()
    }

    /** Stop for good while the app is in the background. */
    fun stop() {
        running = false
        synchronized(lock) { lock.notifyAll() }
        thread?.join(300)
        thread = null
    }

    private fun loop() {
        val minBuf = AudioTrack.getMinBufferSize(rate.toInt(), AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_FLOAT)
        val tr = try {
            AudioTrack.Builder()
                .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_GAME).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_FLOAT).setSampleRate(rate.toInt()).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                .setBufferSizeInBytes(max(minBuf, 2048 * 4))
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build()
        } catch (_: Exception) { running = false; return }
        track = tr
        val buf = FloatArray(512)
        var quiet = 0
        try {
            tr.play()
            while (running) {
                val silent = synchronized(lock) { voices.isEmpty() }
                if (silent) quiet += 1 else quiet = 0
                // About two seconds of silence: let the speaker rest until the next sound.
                if (quiet > 170) {
                    tr.pause(); tr.flush()
                    synchronized(lock) {
                        awake = false
                        while (running && voices.isEmpty()) lock.wait(1000)
                        awake = true
                    }
                    if (!running) break
                    tr.play()
                    quiet = 0
                }
                render(buf)
                tr.write(buf, 0, buf.size, AudioTrack.WRITE_BLOCKING)
            }
        } catch (_: Exception) {
        } finally {
            try { tr.stop() } catch (_: Exception) {}
            tr.release()
            track = null
        }
    }

    fun play(s: Sfx) {
        if (!enabled) return
        synchronized(lock) {
            val now = clock
            // Many towers fire at once: keep each sound from stacking into noise.
            val gap = if (s == Sfx.bolt || s == Sfx.coin || s == Sfx.hero) 0.05 else 0.08
            val t = last[s]
            if (t != null && t > now - gap) return
            last[s] = now
            if (voices.size > 48) repeat(voices.size - 48) { voices.removeAt(0) }
            // A small pitch jitter on rapid combat hits keeps them from sounding like a machine gun.
            val j = if (s == Sfx.bolt || s == Sfx.boom || s == Sfx.zap || s == Sfx.hero || s == Sfx.root) 0.96 + (noise() + 1) * 0.04 else 1.0
            fun tone(w: Wave, f0: Double, f1: Double, dur: Double, vol: Double, delay: Double) {
                voices.add(Voice(now + delay, dur, vol, w, max(20.0, f0 * j), max(20.0, f1 * j), null, Env.pluck))
            }
            fun hiss(freq: Double, q: Double, dur: Double, vol: Double, type: FilterKind) {
                voices.add(Voice(now, dur, vol, null, 0.0, 0.0, Filter(type, freq, q, rate), Env.decay))
            }
            when (s) {
                Sfx.bolt -> { tone(Wave.triangle, 900.0, 300.0, 0.08, 0.08, 0.0); hiss(3000.0, 1.0, 0.05, 0.05, FilterKind.high) }
                Sfx.boom -> { tone(Wave.sine, 120.0, 40.0, 0.35, 0.35, 0.0); hiss(700.0, 0.7, 0.4, 0.35, FilterKind.low) }
                Sfx.zap -> { tone(Wave.saw, 1400.0, 200.0, 0.12, 0.06, 0.0); hiss(5000.0, 2.0, 0.12, 0.08, FilterKind.band) }
                Sfx.bell -> { tone(Wave.sine, 1320.0, 1300.0, 0.6, 0.08, 0.0); tone(Wave.sine, 1980.0, 1960.0, 0.4, 0.04, 0.0) }
                Sfx.root -> { hiss(400.0, 1.0, 0.2, 0.12, FilterKind.low); tone(Wave.square, 160.0, 90.0, 0.12, 0.04, 0.0) }
                Sfx.coin -> { tone(Wave.square, 1400.0, 1400.0, 0.05, 0.03, 0.0); tone(Wave.square, 2100.0, 2100.0, 0.07, 0.03, 0.04) }
                Sfx.hero -> { hiss(2500.0, 1.0, 0.08, 0.08, FilterKind.band); tone(Wave.triangle, 500.0, 220.0, 0.08, 0.06, 0.0) }
                Sfx.level -> listOf(523.0, 659.0, 784.0, 1047.0).forEachIndexed { i, f -> tone(Wave.triangle, f, f, 0.22, 0.09, i * 0.08) }
                Sfx.leak -> tone(Wave.sine, 90.0, 50.0, 0.4, 0.3, 0.0)
                Sfx.wave -> { tone(Wave.saw, 110.0, 110.0, 0.9, 0.06, 0.0); tone(Wave.saw, 165.0, 160.0, 0.9, 0.05, 0.0) }
                Sfx.build -> { hiss(900.0, 1.0, 0.25, 0.15, FilterKind.low); tone(Wave.square, 220.0, 330.0, 0.12, 0.05, 0.05) }
                Sfx.click -> tone(Wave.triangle, 660.0, 660.0, 0.04, 0.05, 0.0)
                Sfx.sweep -> { hiss(1800.0, 0.8, 0.25, 0.2, FilterKind.band); tone(Wave.triangle, 300.0, 120.0, 0.25, 0.1, 0.0) }
                Sfx.snare -> { tone(Wave.sine, 700.0, 200.0, 0.3, 0.1, 0.0); hiss(1200.0, 1.0, 0.3, 0.12, FilterKind.low) }
                Sfx.sunrise -> listOf(392.0, 523.0, 659.0, 784.0).forEachIndexed { i, f -> tone(Wave.sine, f, f * 1.01, 1.2, 0.08, i * 0.06) }
                Sfx.rune -> tone(Wave.sine, 880.0, 1760.0, 0.3, 0.08, 0.0)
                Sfx.boss -> { tone(Wave.saw, 70.0, 55.0, 1.6, 0.18, 0.0); hiss(300.0, 0.5, 1.4, 0.2, FilterKind.low) }
                Sfx.win -> listOf(523.0, 659.0, 784.0, 1047.0, 1319.0).forEachIndexed { i, f -> tone(Wave.triangle, f, f, 0.4, 0.1, i * 0.12) }
                Sfx.lose -> listOf(392.0, 330.0, 262.0, 196.0).forEachIndexed { i, f -> tone(Wave.triangle, f, f * 0.98, 0.5, 0.1, i * 0.18) }
                Sfx.switchFlip -> { tone(Wave.triangle, 420.0, 620.0, 0.09, 0.09, 0.0); tone(Wave.triangle, 720.0, 860.0, 0.06, 0.05, 0.05) }
                Sfx.clear -> { hiss(750.0, 1.0, 0.22, 0.14, FilterKind.low); tone(Wave.triangle, 260.0, 440.0, 0.16, 0.08, 0.03) }
                Sfx.warp -> { tone(Wave.sine, 520.0, 1080.0, 0.16, 0.07, 0.0); tone(Wave.sine, 980.0, 440.0, 0.14, 0.05, 0.08) }
            }
            if (!awake) lock.notifyAll()
        }
    }

    /* ------------------------------------------------------------------ the synth */

    enum class Wave { sine, triangle, square, saw }
    enum class FilterKind { low, high, band }
    enum class Env { pluck, decay }

    /** A biquad from the Audio EQ Cookbook, the same shapes WebAudio uses. */
    class Filter(kind: FilterKind, freq: Double, q: Double, rate: Double) {
        private var b0 = 0.0; private var b1 = 0.0; private var b2 = 0.0; private var a1 = 0.0; private var a2 = 0.0
        private var x1 = 0.0; private var x2 = 0.0; private var y1 = 0.0; private var y2 = 0.0
        init {
            val w = 2 * PI * min(freq, rate * 0.45) / rate
            val cw = cos(w)
            val alpha = sin(w) / (2 * max(0.1, q))
            val a0 = 1 + alpha
            when (kind) {
                FilterKind.low -> { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2 }
                FilterKind.high -> { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2 }
                FilterKind.band -> { b0 = alpha; b1 = 0.0; b2 = -alpha }
            }
            a1 = -2 * cw; a2 = 1 - alpha
            b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0
        }
        fun run(x: Double): Double {
            val y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
            x2 = x1; x1 = x; y2 = y1; y1 = y
            return y
        }
    }

    private class Voice(
        val start: Double, val dur: Double, val vol: Double,
        val wave: Wave?, val f0: Double, val f1: Double, val filter: Filter?, val env: Env,
    ) { var phase = 0.0 }

    private var seed = 22222
    private fun noise(): Double {
        seed = seed * 1664525 + 1013904223
        return (seed.toLong() and 0xffffffffL).toDouble() / 4294967295.0 * 2 - 1
    }

    private fun render(out: FloatArray) {
        synchronized(lock) {
            val dt = 1 / rate
            for (i in out.indices) {
                gain += (targetGain - gain) * 0.002
                var mix = 0.0
                val t = clock + i * dt
                for (v in voices) {
                    val local = t - v.start
                    if (local < 0 || local > v.dur) continue
                    val u = local / v.dur
                    // Exponential fades, as WebAudio's exponentialRampToValueAtTime gives.
                    val env = when (v.env) {
                        Env.pluck -> if (local < 0.01) 0.0001 * (v.vol / 0.0001).pow(local / 0.01) else v.vol * (0.0001 / v.vol).pow((local - 0.01) / max(0.001, v.dur - 0.01))
                        Env.decay -> v.vol * (0.0001 / v.vol).pow(u)
                    }
                    val w = v.wave
                    if (w != null) {
                        val f = v.f0 * (v.f1 / v.f0).pow(u)
                        v.phase += f * dt
                        val p = v.phase - floor(v.phase)
                        val s = when (w) {
                            Wave.sine -> sin(p * 2 * PI)
                            Wave.triangle -> 1 - 4 * abs(p - 0.5)
                            Wave.square -> if (p < 0.5) 1.0 else -1.0
                            Wave.saw -> 2 * p - 1
                        }
                        mix += s * env
                    } else {
                        mix += v.filter!!.run(noise()) * env
                    }
                }
                out[i] = max(-1.0, min(1.0, mix * gain)).toFloat()
            }
            clock += out.size * dt
            voices.removeAll { clock - it.start > it.dur + 0.05 }
        }
    }
}
