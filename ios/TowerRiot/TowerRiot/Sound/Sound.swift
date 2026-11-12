import AVFoundation
import os

/// The game's sounds, made on the fly like the web game's WebAudio synth (src/audio/sfx.ts): no files, fully offline.
/// Each sound is a few tones with pitch sweeps and short bursts of filtered noise.
final class Sound {
    enum Sfx: CaseIterable { case bolt, boom, zap, bell, root, coin, level, leak, wave, build, click, sweep, snare, sunrise, rune, boss, win, lose, hero, switchFlip, clear, warp }

    private let engine = AVAudioEngine()
    private var node: AVAudioSourceNode?
    private let rate: Double
    private var lock = os_unfair_lock()
    private var voices: [Voice] = []
    private var clock = 0.0
    private var last: [Sfx: Double] = [:]
    private var gain = 0.5
    private var targetGain = 0.5

    /// Muting also silences any sound already playing, not just the next one.
    var enabled = true {
        didSet { os_unfair_lock_lock(&lock); targetGain = enabled ? 0.5 : 0; os_unfair_lock_unlock(&lock) }
    }

    init() {
        let session = AVAudioSession.sharedInstance()
        // Ambient: plays along with the player's music and follows the silent switch.
        try? session.setCategory(.ambient, options: [.mixWithOthers])
        try? session.setActive(true)
        rate = engine.outputNode.outputFormat(forBus: 0).sampleRate > 0 ? engine.outputNode.outputFormat(forBus: 0).sampleRate : 44100
        let format = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 1)!
        let src = AVAudioSourceNode(format: format) { [unowned self] _, _, frames, buffers -> OSStatus in
            let abl = UnsafeMutableAudioBufferListPointer(buffers)
            guard let out = abl.first?.mData?.assumingMemoryBound(to: Float.self) else { return noErr }
            self.render(into: out, frames: Int(frames))
            if abl.count > 1 { for b in abl.dropFirst() { b.mData?.copyMemory(from: out, byteCount: Int(frames) * 4) } }
            return noErr
        }
        node = src
        engine.attach(src)
        engine.connect(src, to: engine.mainMixerNode, format: format)
        engine.prepare()
        try? engine.start()
        NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] _ in
            try? self?.engine.start()
        }
    }

    func play(_ s: Sfx) {
        guard enabled else { return }
        if !engine.isRunning { try? engine.start() }
        os_unfair_lock_lock(&lock)
        defer { os_unfair_lock_unlock(&lock) }
        let now = clock
        // Many towers fire at once: keep each sound from stacking into noise.
        let gap = s == .bolt || s == .coin || s == .hero ? 0.05 : 0.08
        if let t = last[s], t > now - gap { return }
        last[s] = now
        if voices.count > 48 { voices.removeFirst(voices.count - 48) }
        // Subtle ±4% pitch jitter on rapid combat hits prevents machine-gun ear fatigue while keeping musical chimes exact.
        let j = [.bolt, .boom, .zap, .hero, .root].contains(s) ? 0.96 + (noise() + 1) * 0.04 : 1.0
        let tone = { (w: Wave, f0: Double, f1: Double, dur: Double, vol: Double, delay: Double) in
            self.voices.append(Voice(start: now + delay, dur: dur, vol: vol, kind: .tone(w, max(20, f0 * j), max(20, f1 * j))))
        }
        let hiss = { (freq: Double, q: Double, dur: Double, vol: Double, type: Filter.Kind) in
            self.voices.append(Voice(start: now, dur: dur, vol: vol, kind: .noise(Filter(kind: type, freq: freq, q: q, rate: self.rate)), env: .decay))
        }
        switch s {
        case .bolt: tone(.triangle, 900, 300, 0.08, 0.08, 0); hiss(3000, 1, 0.05, 0.05, .high)
        case .boom: tone(.sine, 120, 40, 0.35, 0.35, 0); hiss(700, 0.7, 0.4, 0.35, .low)
        case .zap: tone(.saw, 1400, 200, 0.12, 0.06, 0); hiss(5000, 2, 0.12, 0.08, .band)
        case .bell: tone(.sine, 1320, 1300, 0.6, 0.08, 0); tone(.sine, 1980, 1960, 0.4, 0.04, 0)
        case .root: hiss(400, 1, 0.2, 0.12, .low); tone(.square, 160, 90, 0.12, 0.04, 0)
        case .coin: tone(.square, 1400, 1400, 0.05, 0.03, 0); tone(.square, 2100, 2100, 0.07, 0.03, 0.04)
        case .hero: hiss(2500, 1, 0.08, 0.08, .band); tone(.triangle, 500, 220, 0.08, 0.06, 0)
        case .level: for (i, f) in [523.0, 659, 784, 1047].enumerated() { tone(.triangle, f, f, 0.22, 0.09, Double(i) * 0.08) }
        case .leak: tone(.sine, 90, 50, 0.4, 0.3, 0)
        case .wave: tone(.saw, 110, 110, 0.9, 0.06, 0); tone(.saw, 165, 160, 0.9, 0.05, 0)
        case .build: hiss(900, 1, 0.25, 0.15, .low); tone(.square, 220, 330, 0.12, 0.05, 0.05)
        case .click: tone(.triangle, 660, 660, 0.04, 0.05, 0)
        case .sweep: hiss(1800, 0.8, 0.25, 0.2, .band); tone(.triangle, 300, 120, 0.25, 0.1, 0)
        case .snare: tone(.sine, 700, 200, 0.3, 0.1, 0); hiss(1200, 1, 0.3, 0.12, .low)
        case .sunrise: for (i, f) in [392.0, 523, 659, 784].enumerated() { tone(.sine, f, f * 1.01, 1.2, 0.08, Double(i) * 0.06) }
        case .rune: tone(.sine, 880, 1760, 0.3, 0.08, 0)
        case .boss: tone(.saw, 70, 55, 1.6, 0.18, 0); hiss(300, 0.5, 1.4, 0.2, .low)
        case .win: for (i, f) in [523.0, 659, 784, 1047, 1319].enumerated() { tone(.triangle, f, f, 0.4, 0.1, Double(i) * 0.12) }
        case .lose: for (i, f) in [392.0, 330, 262, 196].enumerated() { tone(.triangle, f, f * 0.98, 0.5, 0.1, Double(i) * 0.18) }
        case .switchFlip: tone(.triangle, 420, 620, 0.09, 0.09, 0); tone(.triangle, 720, 860, 0.06, 0.05, 0.05)
        case .clear: hiss(750, 1, 0.22, 0.14, .low); tone(.triangle, 260, 440, 0.16, 0.08, 0.03)
        case .warp: tone(.sine, 520, 1080, 0.16, 0.07, 0); tone(.sine, 980, 440, 0.14, 0.05, 0.08)
        }
    }

    /* ------------------------------------------------------------------ the synth */

    enum Wave { case sine, triangle, square, saw }

    struct Filter {
        enum Kind { case low, high, band }
        var b0 = 0.0, b1 = 0.0, b2 = 0.0, a1 = 0.0, a2 = 0.0
        var x1 = 0.0, x2 = 0.0, y1 = 0.0, y2 = 0.0
        /// A biquad from the Audio EQ Cookbook, the same shapes WebAudio uses.
        init(kind: Kind, freq: Double, q: Double, rate: Double) {
            let w = 2 * Double.pi * min(freq, rate * 0.45) / rate, cw = cos(w), alpha = sin(w) / (2 * max(0.1, q))
            let a0 = 1 + alpha
            switch kind {
            case .low: b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2
            case .high: b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2
            case .band: b0 = alpha; b1 = 0; b2 = -alpha
            }
            a1 = -2 * cw; a2 = 1 - alpha
            b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0
        }
        mutating func run(_ x: Double) -> Double {
            let y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
            x2 = x1; x1 = x; y2 = y1; y1 = y
            return y
        }
    }

    struct Voice {
        enum Kind { case tone(Wave, Double, Double), noise(Filter) }
        enum Env { case pluck, decay }
        let start: Double
        let dur: Double
        let vol: Double
        var kind: Kind
        var env: Env = .pluck
        var phase = 0.0
    }

    private var seed: UInt32 = 22222
    private func noise() -> Double {
        seed = seed &* 1664525 &+ 1013904223
        return Double(seed) / Double(UInt32.max) * 2 - 1
    }

    private func render(into out: UnsafeMutablePointer<Float>, frames: Int) {
        os_unfair_lock_lock(&lock)
        defer { os_unfair_lock_unlock(&lock) }
        let dt = 1 / rate
        for i in 0..<frames {
            gain += (targetGain - gain) * 0.002
            var mix = 0.0
            let t = clock + Double(i) * dt
            for v in voices.indices {
                let local = t - voices[v].start
                if local < 0 || local > voices[v].dur { continue }
                let u = local / voices[v].dur
                // Exponential fades, as WebAudio's exponentialRampToValueAtTime gives.
                let env: Double
                switch voices[v].env {
                case .pluck: env = local < 0.01 ? 0.0001 * pow(voices[v].vol / 0.0001, local / 0.01) : voices[v].vol * pow(0.0001 / voices[v].vol, (local - 0.01) / max(0.001, voices[v].dur - 0.01))
                case .decay: env = voices[v].vol * pow(0.0001 / voices[v].vol, u)
                }
                switch voices[v].kind {
                case let .tone(w, f0, f1):
                    let f = f0 * pow(f1 / f0, u)
                    voices[v].phase += f * dt
                    let p = voices[v].phase - floor(voices[v].phase)
                    let s: Double
                    switch w {
                    case .sine: s = sin(p * 2 * .pi)
                    case .triangle: s = 1 - 4 * abs(p - 0.5)
                    case .square: s = p < 0.5 ? 1 : -1
                    case .saw: s = 2 * p - 1
                    }
                    mix += s * env
                case var .noise(filter):
                    mix += filter.run(noise()) * env
                    voices[v].kind = .noise(filter)
                }
            }
            out[i] = Float(max(-1, min(1, mix * gain)))
        }
        clock += Double(frames) * dt
        voices.removeAll { clock - $0.start > $0.dur + 0.05 }
    }
}
