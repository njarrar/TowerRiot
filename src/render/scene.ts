/**
 * Draws a Battle with the hand-painted art library: a baked ground layer,
 * cached tower sprites, depth-sorted units, morning light and effects.
 * Reads battle state; never changes it.
 */
import { LFX } from '../art/lfx.js';
import type { Battle, BattleEvent, Foe, Tower } from '../game/sim';
import { Y_SQUASH, TOWER_SIGHT } from '../game/sim';
import { pointAt, smooth, type Vec } from '../game/path';
import { makeRng } from '../game/rng';
import { TOWERS, type TowerKind } from '../game/data/towers';
import { RUNES } from '../game/data/shop';
import { SNARE } from '../game/data/hero';
import type { StageDef } from '../game/data/stages';

export const W = 1280;
export const H = 720;
const L = LFX, X = LFX.EXTRA, TAU = Math.PI * 2;

type Light = [number, number, number, number, string?];
interface Sprite { c: HTMLCanvasElement; w: number; h: number; ox: number; oy: number }
interface Part { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string; s: number; kind: 'smoke' | 'spark' | 'chip'; grav?: number }
interface Fx { k: 'ring' | 'arc' | 'boom' | 'slash' | 'flash' | 'steam' | 'lantern' | 'sun' | 'splash'; x: number; y: number; r: number; max: number; life: number; c?: string; pts?: Vec[]; seed?: number }
interface Float { x: number; y: number; text: string; c: string; big: boolean; life: number; max: number; gold?: number }

const LIGHT: Record<TowerKind, [string, number]> = {
  watch: ['#ff9a3a', 120], cannon: ['#ff8a2a', 72], bell: ['#8fd0ff', 70], pylon: ['#a99cff', 150], roots: ['#7fd06a', 50], beacon: ['#ffb050', 150],
};
const EL_COLOR: Record<string, string> = { pierce: '#f0d6a8', fire: '#ffb27a', frost: '#bfe6ff', storm: '#cfc6ff', nature: '#b8e6a0', hero: '#e8f2ff', env: '#ffd9a0' };

type RGB = [number, number, number];
/** Day ground colours per region, painted straight into the field. The Ashen Rift has none and keeps its dark, lava-lit ground. */
interface DayPal { grassLo: RGB; grassHi: RGB; moss: RGB; high: RGB; roadLo: RGB; roadHi: RGB; water: RGB; leafy: boolean; leaf: string; bark: string }
const DAY_PAL: (DayPal | null)[] = [
  // Mosslight Vale: fresh grass, a pale dirt road, clear water.
  { grassLo: [92, 124, 66], grassHi: [122, 152, 80], moss: [84, 128, 70], high: [150, 148, 132], roadLo: [196, 178, 142], roadHi: [216, 200, 164], water: [64, 118, 140], leafy: true, leaf: '#4f7d3a', bark: '#3a2e24' },
  // Saltglass Coast: pale sand and dune grass, a darker packed road, blue sea.
  { grassLo: [184, 174, 134], grassHi: [204, 194, 152], moss: [150, 162, 112], high: [170, 166, 150], roadLo: [160, 142, 110], roadHi: [178, 160, 126], water: [60, 130, 160], leafy: true, leaf: '#6a8a48', bark: '#5a4a3a' },
  // Cogwheel Foundry: slate and soot, a swept stone road, grey water.
  { grassLo: [122, 124, 116], grassHi: [144, 144, 134], moss: [112, 122, 96], high: [160, 156, 148], roadLo: [186, 174, 152], roadHi: [200, 190, 168], water: [92, 110, 122], leafy: false, leaf: '#56704a', bark: '#2e2a26' },
  null,
];

/** Region looks laid over the same painted ground: [screen lift, water tint, sun warmth]. Only the Ashen Rift still uses the lift. */
const REGION_LOOK = [
  { lift: 'rgb(40,50,30)', water: 'rgb(120,165,200)', sunA: 'rgba(255,214,150,.6)', sunB: 'rgba(210,225,170,.4)', sunC: 'rgba(190,215,230,.5)' },
  { lift: 'rgb(62,58,44)', water: 'rgb(100,170,205)', sunA: 'rgba(255,224,170,.6)', sunB: 'rgba(225,220,180,.4)', sunC: 'rgba(190,215,235,.5)' },
  { lift: 'rgb(52,46,38)', water: 'rgb(110,115,120)', sunA: 'rgba(255,190,120,.6)', sunB: 'rgba(215,190,160,.4)', sunC: 'rgba(185,195,215,.45)' },
  { lift: 'rgb(48,36,32)', water: 'rgb(255,120,50)', sunA: 'rgba(255,170,110,.6)', sunB: 'rgba(170,110,90,.35)', sunC: 'rgba(80,60,70,.45)' },
];

export interface View {
  /** The plot or tower the player has open, for range rings. */
  selPlot: number | null;
  selTower: number | null;
  /** Ghost of a tower kind the player is about to build. */
  preview: TowerKind | null;
  /** Show the W skill's landing circle at this point. */
  aimW: Vec | null;
  reduceMotion: boolean;
  /** Show damage numbers over foes. Gold and lives always show. */
  dmgNumbers: boolean;
}

export class Scene {
  private readonly g: CanvasRenderingContext2D;
  private readonly dpr: number;
  private bg!: HTMLCanvasElement;
  private sprites = new Map<string, Sprite>();
  private gateSp!: Sprite;
  private parts: Part[] = [];
  private fx: Fx[] = [];
  private floats: Float[] = [];
  private coins: { sx: number; sy: number; u: number; x: number; y: number }[] = [];
  private shake = 0;
  private flash = 0;
  private posts: Vec[] = [];
  private rifts: { x: number; y: number }[] = [];
  private waterPts: { pts: Vec[]; w: number }[] = [];
  private seeds = new Map<number, number>();
  private moveMark: { x: number; y: number; t: number } | null = null;
  private crows: { x: number; y: number; v: number; n: number }[] = [];
  private r = makeRng(99);
  private stage!: StageDef;
  /** Screen transform: world px to css px. */
  scale = 1; ox = 0; oy = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.g = canvas.getContext('2d')!;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
  }

  /** Paint the stage ground once. Slow (a second or so on a phone), so call it behind a loading screen. */
  load(b: Battle) {
    const st = b.stage;
    this.stage = st;
    this.parts = []; this.fx = []; this.floats = []; this.coins = []; this.seeds.clear();
    this.waterPts = st.waters.map(w => ({ pts: smooth(w.ctrl), w: w.w }));
    const decor = makeDecor(b);
    this.posts = decor.posts;
    this.rifts = [...b.spawns.values()].map(rs => {
      const p = pointAt(rs[0].path, 30);
      return { x: Math.max(64, Math.min(W - 64, p.x)), y: Math.max(80, Math.min(H - 50, p.y)) };
    });
    const bg = document.createElement('canvas');
    bg.width = W; bg.height = H;
    const c = bg.getContext('2d')!;
    X.paintField(c, W, H, {
      roads: b.roads.map(r => ({ pts: r.path.pts, w: r.def.w })).sort((a, z) => a.w - z.w),
      waters: this.waterPts, high: st.high ?? [], bridges: st.bridges,
      ruins: decor.ruins, stones: decor.stones, trees: decor.trees, plots: [],
      pal: st.lava ? null : DAY_PAL[st.region],
    });
    this.washRegion(c, st);
    b.plots.forEach((p, i) => L.plot(c, p.x, p.y, 600 + i * 3, 1));
    this.bg = bg;
    this.gateSp = this.sprite((x, ox, oy) => L.gate(x, ox, oy, 'base'), 280, 220, 140, 190);
  }

  private washRegion(c: CanvasRenderingContext2D, st: StageDef) {
    const look = REGION_LOOK[st.region];
    if (!st.lava && DAY_PAL[st.region]) {
      // Day ground is already in colour. Add only low sun from the upper right and a cool touch in the far shade.
      c.save(); c.globalCompositeOperation = 'soft-light';
      const sg = c.createLinearGradient(W, 0, 0, H);
      sg.addColorStop(0, 'rgba(255,226,170,.45)'); sg.addColorStop(0.55, 'rgba(255,255,255,0)'); sg.addColorStop(1, 'rgba(120,150,190,.35)');
      c.fillStyle = sg; c.fillRect(0, 0, W, H); c.restore();
      return;
    }
    c.save();
    c.globalCompositeOperation = 'screen'; c.fillStyle = look.lift; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = st.lava ? 'source-over' : 'multiply';
    c.filter = 'blur(8px)'; c.lineCap = 'round'; c.lineJoin = 'round';
    for (const w of this.waterPts) {
      L.strokePts(c, w.pts);
      c.strokeStyle = st.lava ? 'rgb(60,22,12)' : look.water; c.lineWidth = w.w * 0.9; c.stroke();
    }
    c.filter = 'none';
    c.globalCompositeOperation = 'soft-light';
    const sg = c.createLinearGradient(W, 0, 0, H);
    sg.addColorStop(0, look.sunA); sg.addColorStop(0.55, look.sunB); sg.addColorStop(1, look.sunC);
    c.fillStyle = sg; c.fillRect(0, 0, W, H);
    if (!st.lava) {
      // Morning grade, baked once: open the mid tones and pull the brown haze toward cool daylight.
      c.globalCompositeOperation = 'soft-light'; c.fillStyle = 'rgba(255,255,255,.45)'; c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = 'saturation'; c.fillStyle = 'rgba(90,150,60,.25)'; c.fillRect(0, 0, W, H);
    }
    c.restore();
  }

  private sprite(fn: (x: CanvasRenderingContext2D, ox: number, oy: number) => void, w: number, h: number, ox: number, oy: number): Sprite {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * this.dpr); c.height = Math.ceil(h * this.dpr);
    const x = c.getContext('2d')!;
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    fn(x, ox, oy);
    return { c, w, h, ox, oy };
  }

  private put(sp: Sprite, x: number, y: number) { this.g.drawImage(sp.c, x - sp.ox, y - sp.oy, sp.w, sp.h); }

  static towerScale(t: { lv: number }) { return 0.6 + 0.06 * (Math.min(t.lv, 4) - 1); }

  private towerSprite(t: Tower): Sprite {
    const key = `${t.kind}:${t.lv}:${t.split ?? ''}:${t.plot}`;
    let sp = this.sprites.get(key);
    if (!sp) {
      const S = Scene.towerScale(t), seed = 200 + t.plot * 7;
      sp = this.sprite((x, ox, oy) => paintTower(x, t.kind, ox, oy, S, 'base', seed), 280, 300, 140, 262);
      this.sprites.set(key, sp);
    }
    return sp;
  }

  /** Fit the 1280x720 world into `area` of the canvas (the whole canvas by default), centred. */
  resize(cssW: number, cssH: number, area = { x: 0, y: 0, w: cssW, h: cssH }) {
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.canvas.style.width = cssW + 'px'; this.canvas.style.height = cssH + 'px';
    this.scale = Math.min(area.w / W, area.h / H);
    this.ox = area.x + (area.w - W * this.scale) / 2;
    this.oy = area.y + (area.h - H * this.scale) / 2;
  }

  /** Where the world sits on screen, in css px. */
  worldRect() { return { x: this.ox, y: this.oy, w: W * this.scale, h: H * this.scale }; }

  toWorld(cx: number, cy: number): Vec { return [(cx - this.ox) / this.scale, (cy - this.oy) / this.scale]; }
  toScreen(x: number, y: number): Vec { return [x * this.scale + this.ox, y * this.scale + this.oy]; }

  markMove(x: number, y: number) { this.moveMark = { x, y, t: 0.6 }; }

  /* ------------------------------------------------------------------ events to effects */

  consume(b: Battle, events: BattleEvent[], dmgNumbers = false) {
    const R = this.r;
    for (const e of events) {
      switch (e.t) {
        case 'pulse': this.fx.push({ k: 'ring', x: e.x, y: e.y, r: 0, max: e.r, life: 1, c: '170,220,255' }); break;
        case 'arc': this.fx.push({ k: 'arc', x: 0, y: 0, r: 0, max: 0, life: 0.18, pts: e.pts, seed: Math.floor(R() * 999) }); break;
        case 'boom':
          this.fx.push({ k: 'boom', x: e.x, y: e.y, r: e.r, max: 0.45, life: 0.45 });
          this.shake = Math.max(this.shake, 4);
          for (let i = 0; i < 14; i++) { const a = R() * TAU, v = 60 + R() * 160; this.parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5 - 90, life: 0.8, max: 0.8, c: '#2a241c', s: 2.6, kind: 'chip', grav: 1 }); }
          for (let i = 0; i < 5; i++) this.parts.push({ x: e.x + (R() - 0.5) * 30, y: e.y - 4, vx: (R() - 0.5) * 20, vy: -14, life: 1.5, max: 1.5, c: 'rgba(70,66,62,', s: 9, kind: 'smoke' });
          break;
        case 'root': for (let i = 0; i < 8; i++) this.parts.push({ x: e.x + (R() - 0.5) * 30, y: e.y, vx: (R() - 0.5) * 40, vy: -50 - R() * 50, life: 0.6, max: 0.6, c: '#3a3326', s: 2.6, kind: 'chip', grav: 1 }); break;
        case 'hit':
          for (let i = 0; i < 3; i++) { const a = R() * TAU; this.parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * 80, vy: Math.sin(a) * 80, life: 0.3, max: 0.3, c: EL_COLOR[e.el] ?? '#fff', s: 1.6, kind: 'spark' }); }
          if (dmgNumbers && e.crit) this.float(e.x, e.y - 10, `${Math.round(e.dmg)}!`, '#ffe6b0', true);
          else if (dmgNumbers && e.el === 'hero') this.float(e.x, e.y - 6, `${Math.round(e.dmg)}`, '#e8f2ff', false);
          break;
        case 'kill': {
          this.coins.push({ sx: e.x, sy: e.y - 20, u: 0, x: e.x, y: e.y });
          this.goldPop(e.x + 12, e.y - 46, e.gold, e.hero);
          for (let i = 0; i < 10; i++) { const a = R() * TAU; this.parts.push({ x: e.x, y: e.y - 10, vx: Math.cos(a) * 60, vy: -30 - R() * 60, life: 0.9, max: 0.9, c: '#5ac8a8', s: 1.8, kind: 'spark' }); }
          for (let i = 0; i < 3; i++) this.parts.push({ x: e.x + (R() - 0.5) * 20, y: e.y - 6, vx: 0, vy: -16, life: 1.3, max: 1.3, c: 'rgba(30,40,38,', s: 8, kind: 'smoke' });
          if (e.kind === 'mireking' || e.kind === 'tidewyrm' || e.kind === 'colossus' || e.kind === 'queen') { this.shake = 12; this.flash = 0.6; }
          break;
        }
        case 'leak': this.flash = Math.max(this.flash, 0.25); this.float(e.x, e.y - 50, `-${e.lives}`, '#ff6a5a', true); break;
        case 'vent': this.fx.push({ k: 'steam', x: e.x, y: e.y, r: 0, max: 1.2, life: 1.2 }); this.shake = Math.max(this.shake, 2); break;
        case 'skill':
          if (e.key === 'q') this.fx.push({ k: 'slash', x: e.x, y: e.y, r: 100, max: 0.4, life: 0.4 });
          if (e.key === 'w') this.fx.push({ k: 'lantern', x: e.x, y: e.y, r: SNARE.radius, max: 0.7, life: 0.7 });
          if (e.key === 'r') { this.fx.push({ k: 'sun', x: e.x, y: e.y, r: 0, max: 1.4, life: 1.4 }); this.shake = 7; }
          break;
        // The level number itself shows on the hero card; on the map a ring is enough.
        case 'level': this.fx.push({ k: 'ring', x: b.hero.x, y: b.hero.y, r: 0, max: 70, life: 1, c: '255,215,140' }); break;
        case 'phase': this.fx.push({ k: 'ring', x: e.x, y: e.y, r: 0, max: 360, life: 1, c: '120,230,200' }); this.shake = 10; break;
        case 'dive': this.fx.push({ k: 'splash', x: e.x, y: e.y, r: 0, max: 0.8, life: 0.8 }); break;
        case 'build': case 'upgrade':
          for (let i = 0; i < 12; i++) { const a = R() * TAU; this.parts.push({ x: e.x + Math.cos(a) * 20, y: e.y + Math.sin(a) * 8, vx: Math.cos(a) * 30, vy: -20 - R() * 30, life: 0.8, max: 0.8, c: 'rgba(150,140,120,', s: 6, kind: 'smoke' }); }
          break;
        case 'heroDown': this.float(b.hero.x, b.hero.y - 80, 'Wren falls', '#ff8a7a', true); break;
        case 'revive': this.fx.push({ k: 'sun', x: b.hero.x, y: b.hero.y, r: 0, max: 1, life: 1 }); break;
        case 'rune': if (e.picked) this.float(b.hero.x, b.hero.y - 80, RUNES[e.kind].name, RUNES[e.kind].color, true); break;
        default: break;
      }
    }
  }

  /** Gold from kills close together in time and place adds up in one number instead of a stack. */
  private goldPop(x: number, y: number, gold: number, hero: boolean) {
    const f = this.floats.find(o => o.gold !== undefined && o.max - o.life < 0.5 && Math.hypot(o.x - x, o.y - y) < 140);
    if (f) {
      f.gold! += gold; f.text = `+${f.gold}`; f.life = f.max;
      if (hero) { f.c = '#ffd76a'; f.big = true; }
      return;
    }
    this.float(x, y, `+${gold}`, hero ? '#ffd76a' : '#e8b34a', hero);
    this.floats[this.floats.length - 1].gold = gold;
  }

  private float(x: number, y: number, text: string, c: string, big: boolean) {
    if (this.floats.length > 60) this.floats.shift();
    this.floats.push({ x: x + (this.r() - 0.5) * 12, y, text, c, big, life: big ? 1.4 : 0.8, max: big ? 1.4 : 0.8 });
  }

  /* ------------------------------------------------------------------ frame */

  private seedOf(f: Foe) { let s = this.seeds.get(f.id); if (s === undefined) { s = 40 + (f.id * 7) % 9; this.seeds.set(f.id, s); } return s; }

  draw(b: Battle, view: View, T: number, dt: number) {
    const g = this.g, st = this.stage, R = this.r;
    this.step(dt);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#e4dccb'; g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    g.translate(this.ox, this.oy); g.scale(this.scale, this.scale);
    g.save();
    g.beginPath(); g.rect(0, 0, W, H); g.clip();
    if (this.shake > 0 && !view.reduceMotion) g.translate((R() - 0.5) * this.shake, (R() - 0.5) * this.shake);
    g.drawImage(this.bg, 0, 0, W, H);

    // Water glints, or lava flowing.
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    for (const w of this.waterPts) {
      L.strokePts(g, w.pts);
      if (st.lava) {
        g.globalCompositeOperation = 'lighter';
        g.strokeStyle = `rgba(255,${110 + 30 * Math.sin(T * 2)},40,0.35)`; g.lineWidth = w.w * 0.55; g.setLineDash([]); g.stroke();
        g.strokeStyle = 'rgba(255,220,140,0.35)'; g.lineWidth = 2; g.setLineDash([10, 26, 4, 30]); g.lineDashOffset = -T * 18; g.stroke();
      } else {
        g.globalCompositeOperation = 'lighter';
        g.strokeStyle = 'rgba(220,235,245,0.3)'; g.lineWidth = 1.6; g.setLineDash([6, 30, 14, 46]); g.lineDashOffset = -T * 26; g.stroke();
      }
      g.globalCompositeOperation = 'source-over';
    }
    g.setLineDash([]); g.restore();

    this.drawMapRules(b, T);
    this.drawPlots(b, view, T);
    this.drawRifts(T);
    if (b.rune) this.drawRune(b.rune, T);

    // Base pass, sorted by depth.
    const ents: { y: number; d: () => void }[] = [];
    for (const t of b.towers) ents.push({ y: t.y, d: () => this.drawTowerBase(t) });
    for (const [x, y] of this.posts) ents.push({ y, d: () => drawPost(g, x, y) });
    for (const f of b.foes) ents.push({ y: f.y + (f.def.flying ? 40 : 0), d: () => this.drawFoe(f, 'base', T) });
    if (!b.hero.dead) ents.push({ y: b.hero.y, d: () => this.drawHero(b, 'base', T) });
    for (const [gx, gy] of b.gate) ents.push({ y: gy, d: () => this.put(this.gateSp, gx, gy) });
    ents.sort((a, z) => a.y - z.y).forEach(e => e.d());

    for (const p of this.parts) if (p.kind === 'smoke') { g.fillStyle = p.c + (p.life / p.max * 0.4) + ')'; g.beginPath(); g.arc(p.x, p.y, p.s * (2.2 - p.life / p.max), 0, TAU); g.fill(); }
    for (const p of this.parts) if (p.kind === 'chip') { g.globalAlpha = Math.min(1, p.life / p.max * 2); g.fillStyle = p.c; g.fillRect(p.x, p.y, p.s, p.s); }
    g.globalAlpha = 1;
    for (const c of b.clouds) { const gr = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r); gr.addColorStop(0, `rgba(120,170,70,${0.35 * Math.min(1, c.t)})`); gr.addColorStop(1, 'rgba(120,170,70,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(c.x, c.y, c.r, c.r / Y_SQUASH, 0, 0, TAU); g.fill(); }

    // Light: lanterns, towers and Wren. Morning keeps it soft; night and Sunrise change it.
    const lights: Light[] = [];
    const fk = 1 + Math.sin(T * 7) * 0.03;
    for (const t of b.towers) { const [c, r] = LIGHT[t.kind]; lights.push([t.x, t.y - 50, (t.kind === 'beacon' ? b.stats(t).range * 0.8 : r) * fk, 0.9, c]); }
    for (const [x, y] of this.posts) lights.push([x, y - 34, 70 * fk, 0.75, '#ff9a3a']);
    if (!b.hero.dead) lights.push([b.hero.x - 16, b.hero.y - 10, b.heroSight() * fk, 0.95, '#ffa040']);
    for (const [gx, gy] of b.gate) lights.push([gx, gy - 120, 230 * fk, 1, '#ffb050']);
    if (st.lighthouse) lights.push([st.lighthouse[0], st.lighthouse[1] - 120, 380, 1, '#ffe2a0']);
    for (const f of this.fx) if (f.k === 'boom') lights.push([f.x, f.y, 140 * f.life / 0.45 + 40, 0.9, '#ff8a3a']);
    const dark = b.hero.sunriseT > 0 ? 0 : b.night ? 0.62 : st.lava ? 0.14 : 0.03;
    L.darkness(g, W, H, lights, dark);

    // Sun wash and slow light shafts (not at night).
    if (!b.night) {
      g.save(); g.globalCompositeOperation = 'soft-light';
      const sun = g.createRadialGradient(W * 0.92, -60, 40, W * 0.92, -60, W * 1.1);
      sun.addColorStop(0, st.lava ? 'rgba(255,170,110,.55)' : 'rgba(255,232,180,.32)'); sun.addColorStop(1, 'rgba(255,225,160,0)');
      g.fillStyle = sun; g.fillRect(0, 0, W, H);
      if (!view.reduceMotion) {
        g.globalCompositeOperation = 'screen';
        for (let i = 0; i < 4; i++) {
          const off = ((i * 300 + T * 8) % (W + 600)) - 300;
          g.save(); g.translate(off + W * 0.5, 0); g.rotate(0.5);
          const sh = g.createLinearGradient(-60, 0, 60, 0);
          sh.addColorStop(0, 'rgba(255,235,190,0)'); sh.addColorStop(0.5, `rgba(255,235,190,${0.03 + 0.015 * Math.sin(T * 0.5 + i)})`); sh.addColorStop(1, 'rgba(255,235,190,0)');
          g.fillStyle = sh; g.fillRect(-60, -200, 120, H * 2); g.restore();
        }
      }
      g.restore();
    }

    // Emit pass.
    for (const t of b.towers) this.drawTowerEmit(b, t, T);
    for (const [x, y] of this.posts) { const f = 0.8 + 0.2 * Math.sin(T * 15 + x); g.save(); g.globalCompositeOperation = 'lighter'; L.glow(g, x, y - 34, 10 * f, '#ff9a3a', 0.25); g.restore(); g.fillStyle = '#ffd08a'; g.fillRect(x - 2, y - 37, 4, 6 * f); }
    for (const f of b.foes) this.drawFoe(f, 'emit', T);
    if (!b.hero.dead) this.drawHero(b, 'emit', T);
    for (const [gx, gy] of b.gate) L.gate(g, gx, gy, 'emit');
    if (st.lighthouse) { g.save(); g.globalCompositeOperation = 'lighter'; L.glow(g, st.lighthouse[0], st.lighthouse[1] - 110, 60, '#ffe6b0', 0.5); g.restore(); }

    this.drawShots(b);
    this.drawFx(T);
    this.drawRanges(b, view);
    this.drawCrows(T, dt, view.reduceMotion);
    if (!view.reduceMotion) L.fog(g, W, H, 9, T * 10, st.lava ? 0.05 : 0.025);
    g.restore();

    // Overlays that ignore shake.
    g.save(); g.beginPath(); g.rect(0, 0, W, H); g.clip();
    L.vignette(g, W, H, b.night ? 0.7 : 0.16);
    if (this.flash > 0) { g.fillStyle = `rgba(255,${b.status === 'lost' ? 80 : 230},${b.status === 'lost' ? 60 : 180},${this.flash * 0.35})`; g.fillRect(0, 0, W, H); }
    for (const c of this.coins) { g.fillStyle = '#d9962a'; g.beginPath(); g.ellipse(c.x, c.y, 4.5 * Math.abs(Math.cos(c.u * 12)) + 1, 4.5, 0, 0, TAU); g.fill(); g.strokeStyle = '#5a2e08'; g.lineWidth = 1; g.stroke(); }
    g.textAlign = 'center';
    for (const f of this.floats) {
      const a = Math.min(1, f.life / f.max * 2.2), sc = f.big ? 1 + Math.max(0, f.life / f.max - 0.75) * 2 : 1;
      g.globalAlpha = a;
      g.font = `800 ${Math.round((f.big ? 24 : 15) * sc)}px Cinzel, Georgia, serif`;
      g.lineWidth = f.big ? 5 : 3.5; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(f.text, f.x, f.y);
      g.fillStyle = f.c; g.fillText(f.text, f.x, f.y);
    }
    g.globalAlpha = 1;
    g.restore();
  }

  private step(dt: number) {
    this.shake = Math.max(0, this.shake - dt * 20);
    this.flash = Math.max(0, this.flash - dt * 1.5);
    for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.grav) p.vy += 380 * dt; p.life -= dt; }
    this.parts = this.parts.filter(p => p.life > 0);
    if (this.parts.length > 600) this.parts.splice(0, this.parts.length - 600);
    for (const f of this.fx) { if (f.k === 'ring') f.r += dt * 320; else f.life -= dt; }
    this.fx = this.fx.filter(f => f.k === 'ring' ? f.r < f.max : f.life > 0);
    for (const c of this.coins) { c.u += dt * 1.3; c.x = c.sx + (40 - c.sx) * c.u * c.u; c.y = c.sy + (20 - c.sy) * c.u - Math.sin(c.u * Math.PI) * 120; }
    this.coins = this.coins.filter(c => c.u < 1);
    for (const f of this.floats) { f.life -= dt; f.y -= dt * (f.big ? 26 : 40); }
    this.floats = this.floats.filter(f => f.life > 0);
    if (this.moveMark) { this.moveMark.t -= dt; if (this.moveMark.t <= 0) this.moveMark = null; }
  }

  /* ------------------------------------------------------------------ pieces */

  private drawMapRules(b: Battle, T: number) {
    const g = this.g, st = this.stage;
    // Tides and lava closures.
    (st.shifts ?? []).forEach((s, i) => {
      const on = b.shiftActive(i);
      const [x, y] = s.at;
      g.save();
      if (s.kind === 'lava') {
        g.globalCompositeOperation = on ? 'source-over' : 'lighter';
        const gr = g.createRadialGradient(x, y, 0, x, y, s.r * (on ? 1.1 : 0.7));
        gr.addColorStop(0, on ? 'rgba(255,150,60,.95)' : 'rgba(255,120,40,.25)'); gr.addColorStop(0.6, on ? 'rgba(200,60,20,.85)' : 'rgba(200,60,20,.1)'); gr.addColorStop(1, 'rgba(60,20,10,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, s.r * 1.3, s.r * 0.8, 0, 0, TAU); g.fill();
        if (on) { g.globalCompositeOperation = 'lighter'; L.glow(g, x, y, s.r * 1.4, '#ff7a2a', 0.35 + 0.1 * Math.sin(T * 4)); }
      } else {
        const a = on ? 0.85 : 0.0;
        if (a > 0) {
          g.fillStyle = `rgba(70,110,140,${a})`; g.beginPath(); g.ellipse(x, y, s.r * 1.2, s.r * 0.7, 0, 0, TAU); g.fill();
          g.strokeStyle = 'rgba(220,240,255,.45)'; g.lineWidth = 1.5; g.setLineDash([8, 14]); g.lineDashOffset = -T * 20;
          g.beginPath(); g.ellipse(x, y, s.r * 1.05, s.r * 0.58, 0, 0, TAU); g.stroke(); g.setLineDash([]);
        } else {
          for (let k = 0; k < 6; k++) { g.fillStyle = '#4a4945'; g.beginPath(); g.ellipse(x - 20 + k * 8, y + 10 - k * 6, 6, 3.5, 0, 0, TAU); g.fill(); }
        }
      }
      g.restore();
    });
    // Wrecks across a road.
    for (const r of b.roads) {
      const bar = r.barrier;
      if (!bar) continue;
      if (bar.hp > 0) {
        L.shadow(g, bar.x + 6, bar.y + 10, 46, 12, 0.6);
        g.save(); g.translate(bar.x, bar.y); g.rotate(-0.25);
        g.fillStyle = '#3a2a1c'; g.beginPath(); g.moveTo(-50, 6); g.quadraticCurveTo(0, 30, 50, 4); g.lineTo(44, -18); g.lineTo(-46, -14); g.closePath(); g.fill();
        g.strokeStyle = '#1c140d'; g.lineWidth = 2; for (let k = -40; k < 44; k += 12) { g.beginPath(); g.moveTo(k, -15); g.lineTo(k + 2, 10); g.stroke(); }
        g.fillStyle = '#5a4430'; g.fillRect(-6, -60, 5, 46); g.fillStyle = 'rgba(220,210,190,.6)'; g.beginPath(); g.moveTo(-1, -58); g.lineTo(26, -40); g.lineTo(-1, -26); g.fill();
        g.restore();
        bar0(g, bar.x, bar.y - 70, bar.hp / bar.max, '#c89a5a');
      } else {
        g.fillStyle = 'rgba(40,30,20,.6)'; for (let k = 0; k < 7; k++) g.fillRect(bar.x - 40 + k * 12, bar.y - 4 + (k % 2) * 6, 9, 3);
      }
    }
    // Belts: iron plates with moving chevrons.
    for (const r of b.roads) for (const bt of r.belts) {
      g.save(); g.lineCap = 'butt';
      const pts: Vec[] = [];
      for (let d = bt.from; d <= bt.to; d += 8) { const p = pointAt(r.path, d); pts.push([p.x, p.y]); }
      L.strokePts(g, pts); g.strokeStyle = 'rgba(40,38,36,.75)'; g.lineWidth = r.def.w * 0.8; g.stroke();
      g.strokeStyle = 'rgba(200,160,90,.35)'; g.lineWidth = r.def.w * 0.6; g.setLineDash([4, 14]); g.lineDashOffset = -T * 60; g.stroke();
      g.setLineDash([]); g.restore();
    }
    // Vents.
    for (const v of b.vents) {
      g.fillStyle = '#26221e'; g.beginPath(); g.ellipse(v.x, v.y, 22, 9, 0, 0, TAU); g.fill();
      g.strokeStyle = '#5a5048'; g.lineWidth = 2; g.stroke();
      const warn = v.t < 1.2;
      g.save(); g.globalCompositeOperation = 'lighter'; L.glow(g, v.x, v.y, 18, warn ? '#ff7a3a' : '#ffb070', warn ? 0.5 + 0.3 * Math.sin(T * 20) : 0.15); g.restore();
    }
  }

  private drawPlots(b: Battle, view: View, T: number) {
    const g = this.g;
    const canAfford = b.stage.towers.some(k => b.gold >= b.costOf(k));
    b.plots.forEach((p, i) => {
      const used = b.towers.some(t => t.plot === i);
      if (p.sunk) { g.fillStyle = 'rgba(40,52,40,.9)'; g.beginPath(); g.ellipse(p.x, p.y, 34, 14, 0, 0, TAU); g.fill(); g.strokeStyle = 'rgba(150,180,150,.25)'; g.stroke(); return; }
      if (p.gear) {
        const up = b.towers.length >= 0 && isGearUp(b, p.gear);
        g.save(); g.translate(p.x, p.y + 2); g.scale(1, 0.4); g.rotate(T * (up ? 0.6 : 0.15) * (p.gear === 'a' ? 1 : -1));
        g.strokeStyle = p.gear === 'a' ? 'rgba(230,180,90,.8)' : 'rgba(170,180,195,.8)'; g.lineWidth = 4;
        for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; g.beginPath(); g.moveTo(Math.cos(a) * 34, Math.sin(a) * 34); g.lineTo(Math.cos(a) * 42, Math.sin(a) * 42); g.stroke(); }
        g.beginPath(); g.arc(0, 0, 34, 0, TAU); g.stroke(); g.restore();
        if (!up) { g.fillStyle = 'rgba(10,12,10,.45)'; g.beginPath(); g.ellipse(p.x, p.y, 34, 14, 0, 0, TAU); g.fill(); }
      }
      if (used) return;
      if (view.selPlot === i) {
        g.strokeStyle = `rgba(255,214,140,${0.6 + 0.3 * Math.sin(T * 6)})`; g.lineWidth = 2.5;
        g.beginPath(); g.ellipse(p.x, p.y - 1.5, 39, 16, 0, 0, TAU); g.stroke();
      }
      // A small rust mark on every plot you can afford to build on right now.
      if (canAfford && !b.over && (!p.gear || isGearUp(b, p.gear))) {
        const x = p.x, y = p.y - 2;
        g.fillStyle = 'rgba(40,24,16,.25)'; g.beginPath(); g.ellipse(x + 1, y + 2, 10, 5, 0, 0, TAU); g.fill();
        g.fillStyle = '#a63d26'; g.beginPath(); g.arc(x, y - 4, 9, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(255,240,225,.9)'; g.lineWidth = 1.2; g.stroke();
        g.strokeStyle = '#fff6ea'; g.lineWidth = 2.4; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x - 4, y - 4); g.lineTo(x + 4, y - 4); g.moveTo(x, y - 8); g.lineTo(x, y); g.stroke(); g.lineCap = 'butt';
      }
    });
  }

  /** A rift is a torn crack in the ground with a green edge, set fully on the map where foes climb out. */
  private drawRifts(T: number) {
    const g = this.g;
    this.rifts.forEach(({ x, y }, i) => {
      const R = makeRng(70 + i);
      g.save(); g.translate(x, y);
      // Scorched ground around it.
      const sc = g.createRadialGradient(0, 0, 4, 0, 0, 58);
      sc.addColorStop(0, 'rgba(24,30,26,.55)'); sc.addColorStop(1, 'rgba(24,30,26,0)');
      g.save(); g.scale(1, 0.42); g.fillStyle = sc; g.beginPath(); g.arc(0, 0, 58, 0, TAU); g.fill(); g.restore();
      // The tear: a jagged lens, darker at the centre.
      const pts: Vec[] = [];
      for (let k = 0; k <= 18; k++) {
        const a = k / 18 * TAU, j = 0.75 + R() * 0.4;
        pts.push([Math.cos(a) * 34 * j, Math.sin(a) * 12 * j]);
      }
      g.fillStyle = '#0a0d0c'; g.beginPath(); pts.forEach(([px, py], k) => k ? g.lineTo(px, py) : g.moveTo(px, py)); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(96,226,180,.85)'; g.lineWidth = 1.6; g.stroke();
      // Shards of the ground pushed up at its lips.
      for (let k = 0; k < 4; k++) {
        const a = Math.PI + 0.4 + k * 0.6, bx = Math.cos(a) * 30, by = Math.sin(a) * 11;
        g.fillStyle = k % 2 ? '#3a3a34' : '#4a4840';
        g.beginPath(); g.moveTo(bx - 5, by); g.lineTo(bx + 1, by - 12 - R() * 8); g.lineTo(bx + 6, by); g.closePath(); g.fill();
      }
      g.globalCompositeOperation = 'lighter';
      L.glow(g, 0, -2, 40, '#5ac8a8', 0.32 + 0.04 * Math.sin(T * 1.5 + i));
      g.restore();
    });
  }

  private drawRune(r: { kind: keyof typeof RUNES; x: number; y: number }, T: number) {
    const g = this.g, c = RUNES[r.kind].color, bob = Math.sin(T * 3) * 4;
    L.shadow(g, r.x, r.y + 4, 16, 5, 0.5);
    g.save(); g.translate(r.x, r.y - 26 + bob); g.rotate(T);
    g.fillStyle = '#1a1c20'; g.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; g.lineTo(Math.cos(a) * 13, Math.sin(a) * 13); } g.fill();
    g.strokeStyle = c; g.lineWidth = 2.5; g.stroke();
    g.restore();
    g.save(); g.globalCompositeOperation = 'lighter'; L.glow(g, r.x, r.y - 26 + bob, 34, c, 0.55); g.restore();
  }

  private drawTowerBase(t: Tower) {
    const g = this.g, S = Scene.towerScale(t);
    this.put(this.towerSprite(t), t.x, t.y);
    if (t.kind === 'cannon') X.cannonBarrel(g, t.x + 4 * S, t.y, S, t.aim, Math.max(0, 1 - t.fired * 4), 0);
    // Level plaque at the foot of the tower: one mark per level, all gold once it has split.
    const n = Math.min(t.lv, 3), px = t.x, py = t.y + 20;
    g.fillStyle = 'rgba(40,30,20,.3)'; g.fillRect(px - 18, py - 4, 38, 13);
    g.fillStyle = 'rgba(246,240,228,.95)'; g.strokeStyle = 'rgba(70,56,40,.7)'; g.lineWidth = 1;
    g.beginPath(); g.roundRect(px - 19, py - 6, 38, 13, 3); g.fill(); g.stroke();
    for (let i = 0; i < 3; i++) {
      const qx = px - 14 + i * 10, qy = py - 3;
      g.fillStyle = i < n ? (t.lv === 4 ? '#d9a23a' : '#a63d26') : 'rgba(70,56,40,.12)';
      g.fillRect(qx, qy, 8, 7);
      if (i >= n) { g.strokeStyle = 'rgba(70,56,40,.45)'; g.strokeRect(qx + 0.5, qy + 0.5, 7, 6); }
    }
    if (t.round) { const c = t.round === 'ember' ? '#ff8a3a' : t.round === 'frost' ? '#8fd0ff' : '#b9a8ff'; g.fillStyle = c; g.beginPath(); g.arc(t.x + 30, t.y + 8, 4, 0, TAU); g.fill(); }
    if (t.down) { g.fillStyle = 'rgba(10,12,14,.45)'; g.beginPath(); g.ellipse(t.x, t.y - 40, 34, 60, 0, 0, TAU); g.fill(); }
  }

  private drawTowerEmit(b: Battle, t: Tower, T: number) {
    const g = this.g, S = Scene.towerScale(t), seed = 200 + t.plot * 7;
    if (t.down) return;
    switch (t.kind) {
      case 'watch': L.watchTower(g, t.x, t.y, S, 'emit', seed); break;
      case 'bell': L.frostBell(g, t.x, t.y, S, 'emit', seed); break;
      case 'pylon': L.stormPylon(g, t.x, t.y, S, 'emit', seed, t.fired < 0.16 ? lastArcEnd(b, t) : null); break;
      case 'cannon':
        X.forgeCannon(g, t.x, t.y, S, 'emit', seed);
        if (t.fired < 0.14) {
          const a = Math.atan2(Math.sin(t.aim) * 0.5, Math.cos(t.aim));
          g.save(); g.globalCompositeOperation = 'lighter'; L.glow(g, t.x + 4 * S + Math.cos(a) * 38 * S, t.y - 50 * S + Math.sin(a) * 38 * S, 26, '#ffa040', 0.8 * (1 - t.fired / 0.14)); g.restore();
        }
        break;
      case 'beacon': X.beaconFire(g, t.x, t.y, S, T); break;
      case 'roots': X.rootPods(g, t.x, t.y, S, T, Math.max(0, 1 - t.fired)); break;
    }
    if (t.split) { g.save(); g.globalCompositeOperation = 'lighter'; L.glow(g, t.x, t.y - 120 * S, 26, LIGHT[t.kind][0], 0.25 + 0.1 * Math.sin(T * 3)); g.restore(); }
  }

  private drawFoe(f: Foe, pass: 'base' | 'emit', T: number) {
    const g = this.g, seed = this.seedOf(f), face = f.dir || 1;
    const bob = Math.sin(T * 8 + seed) * 0.4;
    const x = f.x, y = f.y + bob;
    if (f.under) {
      if (pass === 'base') {
        g.fillStyle = 'rgba(40,32,24,.9)'; g.beginPath(); g.ellipse(x, y, 14 * f.def.size, 6 * f.def.size, 0, 0, TAU); g.fill();
        g.fillStyle = 'rgba(90,76,58,.8)'; for (let k = 0; k < 4; k++) g.fillRect(x - 10 + k * 6 + Math.sin(T * 9 + k) * 2, y - 3, 3, 3);
      }
      return;
    }
    const hidden = f.hidden;
    if (hidden) g.globalAlpha = 0.3;
    const S = f.def.size;
    // Small foes are drawn a fifth bigger than their art scale so they read at 3x and on phones.
    const K = f.def.traits?.boss ? 1 : 1.2;
    if (K !== 1) { g.save(); g.translate(x, y); g.scale(K, K); g.translate(-x, -y); }
    switch (f.kind) {
      case 'grub': L.grub(g, x, y, 0.42, pass, seed, face); break;
      case 'skitter': L.grub(g, x, y, 0.28, pass, seed + 3, face); break;
      case 'mender': L.grub(g, x, y, 0.46, pass, seed + 5, face); if (pass === 'emit') ringGlow(g, x, y - 12, 26, '120,230,140', 0.2 + 0.1 * Math.sin(T * 4)); break;
      case 'shade': L.grub(g, x, y, 0.4, pass, seed + 7, face); break;
      case 'splitter': L.grub(g, x, y, 0.5, pass, seed + 1, face); if (pass === 'emit') ringGlow(g, x, y - 14, 20, '180,240,200', 0.15); break;
      case 'burrower': L.grub(g, x, y, 0.4, pass, seed + 2, face); break;
      case 'shell': L.shellback(g, x, y, 0.5, pass, seed, face, 1); break;
      case 'sapper': L.shellback(g, x, y, 0.42, pass, seed + 4, face, 0); break;
      case 'elite': L.shellback(g, x, y, 0.58, pass, seed + 6, face, 0); if (pass === 'base') { g.fillStyle = 'rgba(150,160,175,.35)'; g.beginPath(); g.ellipse(x, y - 22, 26, 12, 0, Math.PI, TAU); g.fill(); } break;
      case 'warden': L.shellback(g, x, y, 0.66, pass, 66, face, 0); if (pass === 'emit') ringGlow(g, x, y - 24, 110 / Y_SQUASH * 0.6, '90,200,170', 0.22 + 0.08 * Math.sin(T * 3)); break;
      case 'moth': L.moth(g, x, y + Math.sin(T * 3 + seed) * 3, 0.34, pass, seed, 60); break;
      case 'ashmoth': L.moth(g, x, y + Math.sin(T * 3 + seed) * 3, 0.4, pass, seed + 9, 60); if (pass === 'emit') { g.save(); g.globalCompositeOperation = 'lighter'; L.glow(g, x, y - 60, 22, '#ff7a3a', 0.35); g.restore(); } break;
      case 'mireking': L.grub(g, x, y, 1.25, pass, 41, face); break;
      case 'tidewyrm': L.grub(g, x, y, 1.05, pass, 47, face); if (pass === 'emit') ringGlow(g, x, y, 60, '120,190,230', 0.2); break;
      case 'colossus': L.shellback(g, x, y, 1.2, pass, 61, face, (f.slowT > 0 || f.freezeT > 0) ? 1 : 0); break;
      case 'queen': L.moth(g, x, y, 0.95, pass, 51, 40); L.shellback(g, x, y, 0.7, pass, 63, face, 0); if (pass === 'emit') ringGlow(g, x, y - 40, 80, '90,230,190', 0.25 + 0.1 * Math.sin(T * 2)); break;
    }
    // The green glow in their seams: the one strong colour the Hollow owns.
    if (pass === 'emit' && !hidden && !f.def.flying) { g.save(); g.globalCompositeOperation = 'lighter'; L.glow(g, x, y - f.def.bar * 0.35, 12 + 6 * S, '#3be0b8', 0.28); g.restore(); }
    if (K !== 1) g.restore();
    g.globalAlpha = 1;
    if (pass === 'base') {
      if (f.rootT > 0) { g.fillStyle = '#0d0f0a'; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, rx = x + Math.cos(a) * 14 * S, ry = y + Math.sin(a) * 4; g.beginPath(); g.moveTo(rx - 3, ry); g.lineTo(rx + Math.cos(a) * 3, ry - 12 - f.rootT * 4); g.lineTo(rx + 3, ry); g.fill(); } }
      if (f.slowT > 0 || f.freezeT > 0) { g.fillStyle = f.freezeT > 0 ? 'rgba(200,235,255,.6)' : 'rgba(190,225,250,.35)'; g.beginPath(); g.ellipse(x, y + 2, 18 * S, 5 * S, 0, 0, TAU); g.fill(); }
      if (f.burnT > 0) { g.fillStyle = 'rgba(255,120,40,.5)'; g.beginPath(); g.ellipse(x, y - 8, 6, 10, 0, 0, TAU); g.fill(); }
    }
    if (pass === 'emit' && !hidden) {
      if (f.hp < f.max || f.def.traits?.boss) {
        const w = f.def.traits?.boss ? 90 : 34, hy = y - f.def.bar * K;
        bar0(g, x, hy, f.hp / f.max, f.def.traits?.boss ? '#e0503a' : f.shielded ? '#5ac8a8' : '#c8552e', w);
      }
      if (f.hitT > 0) { g.save(); g.globalCompositeOperation = 'lighter'; L.glow(g, x, y - f.def.bar * 0.5, 16 * S, '#ffffff', f.hitT * 2); g.restore(); }
    }
  }

  private drawHero(b: Battle, pass: 'base' | 'emit', T: number) {
    const g = this.g, h = b.hero;
    if (pass === 'base') {
      // A pale ring of lantern light at her feet: the one unit you command never reads as a foe.
      g.save();
      g.fillStyle = 'rgba(255,244,214,.38)'; g.beginPath(); g.ellipse(h.x, h.y + 2, 30, 11, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,236,190,.95)'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(h.x, h.y + 2, 30, 11, 0, 0, TAU); g.stroke();
      g.restore();
      L.wren(g, h.x, h.y, 1.4, 'base');
      if (h.swing > 0) { g.strokeStyle = `rgba(220,235,250,${h.swing * 3})`; g.lineWidth = 3; g.beginPath(); g.arc(h.x + h.face * 12, h.y - 30, 30, h.face > 0 ? -1.4 : Math.PI + 1.4, h.face > 0 ? 0.3 : Math.PI - 0.3, h.face < 0); g.stroke(); }
      return;
    }
    L.wren(g, h.x, h.y, 1.4, 'emit');
    // Health and level above her head.
    bar0(g, h.x, h.y - 98, h.hp / b.heroMaxHp(), '#7fd06a', 46);
    g.font = '800 12px Barlow, sans-serif'; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.8)';
    g.strokeText(String(h.level), h.x - 32, h.y - 94); g.fillStyle = '#ffe2a0'; g.fillText(String(h.level), h.x - 32, h.y - 94);
    if (h.double > 0) ringGlow(g, h.x, h.y - 30, 34, '90,180,255', 0.35);
    if (h.haste > 0) ringGlow(g, h.x, h.y, 26, '255,110,80', 0.3);
    if (h.sunriseT > 0) { g.save(); g.globalCompositeOperation = 'lighter'; L.glow(g, h.x, h.y - 40, 110, '#ffd590', 0.35 + 0.1 * Math.sin(T * 6)); g.restore(); }
    // Her post, when she will return to it.
    if (Math.hypot(h.anchorX - h.x, h.anchorY - h.y) > 20) { g.strokeStyle = 'rgba(255,214,140,.35)'; g.lineWidth = 1.5; g.setLineDash([3, 6]); g.beginPath(); g.ellipse(h.anchorX, h.anchorY, 14, 6, 0, 0, TAU); g.stroke(); g.setLineDash([]); }
    if (this.moveMark) { const m = this.moveMark, a = m.t / 0.6; g.strokeStyle = `rgba(255,214,140,${a})`; g.lineWidth = 2; g.beginPath(); g.ellipse(m.x, m.y, 22 * (1.4 - a), 9 * (1.4 - a), 0, 0, TAU); g.stroke(); }
  }

  private drawShots(b: Battle) {
    const g = this.g;
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const s of b.shots) {
      if (s.t < 0) continue;
      const u = Math.min(1, s.t / s.dur);
      if (s.kind === 'bolt') {
        const x = s.x0 + (s.tx - s.x0) * u, y = s.y0 + (s.ty - 12 - s.y0) * u;
        const bx = s.x0 + (s.tx - s.x0) * Math.max(0, u - 0.18), by = s.y0 + (s.ty - 12 - s.y0) * Math.max(0, u - 0.18);
        const gr = g.createLinearGradient(bx, by, x, y); gr.addColorStop(0, 'rgba(255,170,80,0)'); gr.addColorStop(1, s.crit ? 'rgba(255,240,200,1)' : 'rgba(255,215,160,.9)');
        g.strokeStyle = gr; g.lineWidth = s.crit ? 3 : 2; g.beginPath(); g.moveTo(bx, by); g.lineTo(x, y); g.stroke();
      }
    }
    g.restore();
    for (const s of b.shots) {
      if (s.kind !== 'shell' || s.t < 0) continue;
      const u = Math.min(1, s.t / s.dur), arc = Math.sin(u * Math.PI) * 90;
      const x = s.x0 + (s.tx - s.x0) * u, y = s.y0 + (s.ty - s.y0) * u - arc;
      g.fillStyle = '#0c0c0d'; g.beginPath(); g.arc(x, y, 4.5, 0, TAU); g.fill();
      g.fillStyle = 'rgba(200,205,215,.4)'; g.fillRect(x - 2, y - 3, 2, 1);
      if (this.r() < 0.5) this.parts.push({ x, y, vx: 0, vy: -6, life: 0.7, max: 0.7, c: 'rgba(60,60,62,', s: 3, kind: 'smoke' });
    }
  }

  private drawFx(T: number) {
    const g = this.g;
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const e of this.fx) {
      if (e.k === 'ring') { const a = 1 - e.r / e.max; g.strokeStyle = `rgba(${e.c},${0.45 * a})`; g.lineWidth = 2; g.beginPath(); g.ellipse(e.x, e.y, e.r, e.r / Y_SQUASH * 0.6, 0, 0, TAU); g.stroke(); }
      else if (e.k === 'arc' && e.pts) { for (let i = 1; i < e.pts.length; i++) L.bolt(g, e.pts[i - 1][0], e.pts[i - 1][1], e.pts[i][0], e.pts[i][1], (e.seed ?? 1) + i, 14, 1.4); }
      else if (e.k === 'boom') { const a = e.life / e.max; L.glow(g, e.x, e.y - 8, 70 * (1.2 - a) + 20, '#ff8a3a', 0.6 * a); L.glow(g, e.x, e.y - 8, 20, '#ffe0b0', 0.8 * a); }
      else if (e.k === 'slash') { const a = e.life / e.max; g.strokeStyle = `rgba(220,235,250,${a})`; g.lineWidth = 4; g.beginPath(); g.ellipse(e.x, e.y - 10, e.r * (1.2 - a * 0.4), e.r * 0.45 * (1.2 - a * 0.4), 0, T * 8, T * 8 + 4.5); g.stroke(); }
      else if (e.k === 'lantern') { const a = e.life / e.max; L.glow(g, e.x, e.y - 10, e.r, '#ffb050', 0.5 * a); g.strokeStyle = `rgba(255,200,120,${a})`; g.lineWidth = 2; g.beginPath(); g.ellipse(e.x, e.y, e.r, e.r / Y_SQUASH * 0.6, 0, 0, TAU); g.stroke(); }
      else if (e.k === 'sun') { const a = e.life / e.max; L.glow(g, e.x, e.y - 40, 400 * (1.2 - a), '#ffd590', 0.5 * a); }
      else if (e.k === 'steam') { const a = e.life / e.max; for (let k = 0; k < 5; k++) { g.fillStyle = `rgba(230,230,230,${0.18 * a})`; g.beginPath(); g.arc(e.x + Math.sin(k * 2 + T) * 10, e.y - (1 - a) * 90 - k * 14, 14 + k * 4, 0, TAU); g.fill(); } }
      else if (e.k === 'splash') { const a = e.life / e.max; g.strokeStyle = `rgba(200,230,255,${a})`; g.lineWidth = 2; g.beginPath(); g.ellipse(e.x, e.y, 60 * (1.2 - a), 20 * (1.2 - a), 0, 0, TAU); g.stroke(); }
    }
    for (const p of this.parts) if (p.kind === 'spark') { g.globalAlpha = p.life / p.max; g.fillStyle = p.c; g.fillRect(p.x, p.y, p.s, p.s); }
    g.globalAlpha = 1;
    g.restore();
  }

  private drawRanges(b: Battle, view: View) {
    const g = this.g;
    const ring = (x: number, y: number, r: number, c: string) => {
      g.save(); g.fillStyle = c.replace('A', '0.08'); g.strokeStyle = c.replace('A', '0.7'); g.lineWidth = 1.5; g.setLineDash([6, 6]);
      g.beginPath(); g.ellipse(x, y, r, r / Y_SQUASH, 0, 0, TAU); g.fill(); g.stroke(); g.restore();
    };
    if (view.selTower !== null) { const t = b.tower(view.selTower); if (t) { ring(t.x, t.y, b.stats(t).range, 'rgba(255,214,140,A)'); if (t.kind !== 'beacon') ring(t.x, t.y, TOWER_SIGHT, 'rgba(140,200,255,A)'); } }
    if (view.selPlot !== null && view.preview) {
      const p = b.plots[view.selPlot];
      const def = TOWERS[view.preview];
      ring(p.x, p.y, def.range[0] * (p.high ? 1.2 : 1) * (1 + b.mods.rangeAll), 'rgba(255,214,140,A)');
    }
    if (view.aimW) { const [x, y] = view.aimW; ring(x, y, SNARE.radius, 'rgba(255,190,110,A)'); }
  }

  private drawCrows(T: number, dt: number, reduce: boolean) {
    if (reduce) return;
    const g = this.g, R = this.r;
    if (R() < dt * 0.15 && this.crows.length < 2) { const l = R() < 0.5; this.crows.push({ x: l ? -40 : W + 40, y: 60 + R() * 380, v: (l ? 1 : -1) * (110 + R() * 50), n: 3 + Math.floor(R() * 3) }); }
    for (const c of this.crows) {
      c.x += c.v * dt;
      for (let i = 0; i < c.n; i++) {
        const x = c.x - Math.sign(c.v) * i * 26, y = c.y + (i % 2) * 14 + i * 6, w = Math.sin(T * 14 + i) * 6;
        g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(x + 20, y + 120, 7, 2.5, 0, 0, TAU); g.fill();
        g.strokeStyle = '#141414'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(x - 10, y - w); g.quadraticCurveTo(x - 4, y - 2, x, y + 2); g.quadraticCurveTo(x + 4, y - 2, x + 10, y - w); g.stroke();
      }
    }
    this.crows = this.crows.filter(c => c.x > -120 && c.x < W + 120);
  }
}

/* ------------------------------------------------------------------ helpers */

export function paintTower(c: CanvasRenderingContext2D, kind: TowerKind, x: number, y: number, s: number, pass: 'base' | 'emit', seed: number) {
  switch (kind) {
    case 'watch': L.watchTower(c, x, y, s, pass, seed); break;
    case 'bell': L.frostBell(c, x, y, s, pass, seed); break;
    case 'pylon': L.stormPylon(c, x, y, s, pass, seed, null); break;
    case 'cannon': X.forgeCannon(c, x, y, s, pass, seed); if (pass === 'base') X.cannonBarrel(c, x + 4 * s, y, s, -0.3, 0, 0); break;
    case 'beacon': X.beaconTower(c, x, y, s, pass, seed); if (pass === 'emit') X.beaconFire(c, x, y, s, 1.3); break;
    case 'roots': X.rootGarden(c, x, y, s, pass, seed); if (pass === 'emit') X.rootPods(c, x, y, s, 1, 0.4); break;
  }
}

function bar0(g: CanvasRenderingContext2D, x: number, y: number, v: number, c: string, w = 34) {
  g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(x - w / 2 - 1, y, w + 2, 5);
  g.fillStyle = c; g.fillRect(x - w / 2, y + 1, w * Math.max(0, Math.min(1, v)), 3);
}

function ringGlow(g: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, a: number) {
  g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = `rgba(${rgb},${a})`; g.lineWidth = 1.5;
  g.beginPath(); g.ellipse(x, y, r, r * 0.6, 0, 0, TAU); g.stroke(); g.restore();
}

function drawPost(g: CanvasRenderingContext2D, x: number, y: number) {
  L.shadow(g, x + 6, y + 1, 10, 3, 0.6);
  g.fillStyle = '#1a1410'; g.fillRect(x - 1.5, y - 30, 3, 30);
  g.fillStyle = '#16171a'; g.fillRect(x - 4, y - 38, 8, 9);
  g.beginPath(); g.moveTo(x - 5, y - 38); g.lineTo(x, y - 42); g.lineTo(x + 5, y - 38); g.fill();
}

function isGearUp(b: Battle, gear: 'a' | 'b') { return (Math.max(1, b.wave) % 2 === 1) === (gear === 'a'); }

function lastArcEnd(b: Battle, t: Tower): [number, number] | null {
  const f = b.foes.find(x => !x.dead && Math.hypot(x.x - t.x, x.y - t.y) < b.stats(t).range * 1.2);
  return f ? [f.x, f.y - 14] : null;
}

/** Scatter trees, stones, ruins and lantern posts where nothing else is, the same way every time. */
function makeDecor(b: Battle) {
  const R = makeRng(b.stage.id * 101);
  const roads = b.roads;
  const waters = b.stage.waters.map(w => ({ pts: smooth(w.ctrl), w: w.w }));
  const clear = (x: number, y: number, pad: number) => {
    for (const r of roads) for (let d = 0; d < r.path.tot; d += 16) { const p = pointAt(r.path, d); if (Math.hypot(p.x - x, p.y - y) < r.def.w / 2 + pad) return false; }
    for (const w of waters) for (const p of w.pts) if (Math.hypot(p[0] - x, p[1] - y) < w.w / 2 + pad) return false;
    for (const p of b.plots) if (Math.hypot(p.x - x, p.y - y) < 60 + pad * 0.5) return false;
    for (const g of b.gate) if (Math.hypot(g[0] - x, g[1] - y) < 150) return false;
    if (b.stage.lighthouse && Math.hypot(b.stage.lighthouse[0] - x, b.stage.lighthouse[1] - y) < 80) return false;
    if (Math.hypot(b.stage.rune[0] - x, b.stage.rune[1] - y) < 50) return false;
    return true;
  };
  const pick = (n: number, pad: number, tries = 400) => {
    const out: Vec[] = [];
    for (let i = 0; i < tries && out.length < n; i++) {
      const x = 30 + R() * (W - 60), y = 70 + R() * (H - 100);
      if (clear(x, y, pad) && out.every(o => Math.hypot(o[0] - x, o[1] - y) > 90)) out.push([x, y]);
    }
    return out;
  };
  const trees = pick(7, 30).map(([x, y]) => [x, y, 0.8 + R() * 0.4] as [number, number, number]);
  const stones = pick(3, 24).map(([x, y]) => [x, y, 24 + R() * 12] as [number, number, number]);
  const ruins = pick(2, 60).map(([x, y]) => [x, y, 90 + R() * 50] as [number, number, number]);
  // Lantern posts along each road, on whichever side is free.
  const posts: Vec[] = [];
  for (const r of roads) {
    for (let d = 140; d < r.path.tot - 160; d += 260) {
      const p = pointAt(r.path, d), q = pointAt(r.path, d + 4);
      const nx = -(q.y - p.y), ny = q.x - p.x, len = Math.hypot(nx, ny) || 1;
      for (const side of [1, -1]) {
        const x = p.x + nx / len * (r.def.w / 2 + 14) * side, y = p.y + ny / len * (r.def.w / 2 + 14) * side;
        if (x < 20 || x > W - 20 || y < 60 || y > H - 20) continue;
        if (posts.some(o => Math.hypot(o[0] - x, o[1] - y) < 120)) continue;
        if (b.plots.some(o => Math.hypot(o.x - x, o.y - y) < 50)) continue;
        if (roads.some(o => o !== r && o.path.pts.some(pt => Math.hypot(pt[0] - x, pt[1] - y) < o.def.w / 2 + 6))) continue;
        posts.push([x, y]); break;
      }
    }
  }
  return { trees, stones, ruins, posts };
}
