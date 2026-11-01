/** Sound effects made on the fly with WebAudio: no files, so they work offline everywhere. */
type Sfx = 'bolt' | 'boom' | 'zap' | 'bell' | 'root' | 'coin' | 'level' | 'leak' | 'wave' | 'build' | 'click' | 'sweep' | 'snare' | 'sunrise' | 'rune' | 'boss' | 'win' | 'lose' | 'hero';

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<Sfx, number>();
  private on = true;

  /** Muting also silences any sound already playing, not just the next one. */
  get enabled() { return this.on; }
  set enabled(v: boolean) {
    this.on = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v ? 0.5 : 0, this.ctx.currentTime, 0.02);
  }

  /** Browsers start audio only after a tap. Call this from the first input. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.on ? 0.5 : 0;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  play(s: Sfx) {
    const c = this.ctx, m = this.master;
    if (!this.enabled || !c || !m || c.state !== 'running') return;
    const now = c.currentTime;
    // Many towers fire at once: keep each sound from stacking into noise.
    const gap = s === 'bolt' || s === 'coin' || s === 'hero' ? 0.05 : 0.08;
    if ((this.last.get(s) ?? -1) > now - gap) return;
    this.last.set(s, now);
    const tone = (type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0) => {
      const o = c.createOscillator(), gn = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, now + delay); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + delay + dur);
      gn.gain.setValueAtTime(0.0001, now + delay); gn.gain.exponentialRampToValueAtTime(vol, now + delay + 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, now + delay + dur);
      o.connect(gn); gn.connect(m); o.start(now + delay); o.stop(now + delay + dur + 0.02);
    };
    const hiss = (freq: number, q: number, dur: number, vol: number, type: BiquadFilterType = 'lowpass') => {
      if (!this.noise) return;
      const src = c.createBufferSource(), f = c.createBiquadFilter(), gn = c.createGain();
      src.buffer = this.noise; f.type = type; f.frequency.value = freq; f.Q.value = q;
      gn.gain.setValueAtTime(vol, now); gn.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      src.connect(f); f.connect(gn); gn.connect(m); src.start(now, Math.random() * 0.5); src.stop(now + dur + 0.02);
    };
    switch (s) {
      case 'bolt': tone('triangle', 900, 300, 0.08, 0.08); hiss(3000, 1, 0.05, 0.05, 'highpass'); break;
      case 'boom': tone('sine', 120, 40, 0.35, 0.35); hiss(700, 0.7, 0.4, 0.35); break;
      case 'zap': tone('sawtooth', 1400, 200, 0.12, 0.06); hiss(5000, 2, 0.12, 0.08, 'bandpass'); break;
      case 'bell': tone('sine', 1320, 1300, 0.6, 0.08); tone('sine', 1980, 1960, 0.4, 0.04); break;
      case 'root': hiss(400, 1, 0.2, 0.12); tone('square', 160, 90, 0.12, 0.04); break;
      case 'coin': tone('square', 1400, 1400, 0.05, 0.03); tone('square', 2100, 2100, 0.07, 0.03, 0.04); break;
      case 'hero': hiss(2500, 1, 0.08, 0.08, 'bandpass'); tone('triangle', 500, 220, 0.08, 0.06); break;
      case 'level': [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.22, 0.09, i * 0.08)); break;
      case 'leak': tone('sine', 90, 50, 0.4, 0.3); break;
      case 'wave': tone('sawtooth', 110, 110, 0.9, 0.06); tone('sawtooth', 165, 160, 0.9, 0.05); break;
      case 'build': hiss(900, 1, 0.25, 0.15); tone('square', 220, 330, 0.12, 0.05, 0.05); break;
      case 'click': tone('triangle', 660, 660, 0.04, 0.05); break;
      case 'sweep': hiss(1800, 0.8, 0.25, 0.2, 'bandpass'); tone('triangle', 300, 120, 0.25, 0.1); break;
      case 'snare': tone('sine', 700, 200, 0.3, 0.1); hiss(1200, 1, 0.3, 0.12); break;
      case 'sunrise': [392, 523, 659, 784].forEach((f, i) => tone('sine', f, f * 1.01, 1.2, 0.08, i * 0.06)); break;
      case 'rune': tone('sine', 880, 1760, 0.3, 0.08); break;
      case 'boss': tone('sawtooth', 70, 55, 1.6, 0.18); hiss(300, 0.5, 1.4, 0.2); break;
      case 'win': [523, 659, 784, 1047, 1319].forEach((f, i) => tone('triangle', f, f, 0.4, 0.1, i * 0.12)); break;
      case 'lose': [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, f * 0.98, 0.5, 0.1, i * 0.18)); break;
    }
  }
}
