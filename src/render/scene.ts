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
import type { EnemyKind } from '../game/data/enemies';
import { RUNES, RUNE_WARN_SEC } from '../game/data/shop';
import { ATTUNE, HERO, SNARE } from '../game/data/hero';
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
  /** Show hero 90 px leash & Attune aura guide (e.g. while dragging or hovering Wren). */
  showLeash?: boolean;
  hoveredPlot?: number | null;
  hoveredSwitch?: number | null;
  /** A plot to mark for a new player (stage 1, before the first tower). */
  hintPlot?: number | null;
  /** A still frame (title screen): no health bars or shells in flight. */
  still?: boolean;
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
  private drainWaters: { idx: number; pts: Vec[]; w: number }[] = [];
  /** Roads already shown tearing open, so a second `riftOpen` for the same road adds no second ring or shake. */
  private openedRoads = new Set<string>();
  private seeds = new Map<number, number>();
  /** How each foe looks in motion: drawn only, so the fight itself (timing, ranges, gate) never changes. */
  private gaits = new Map<number, Gait>();
  private gaitTick = 0;
  private moveMark: { x: number; y: number; t: number } | null = null;
  private crows: { x: number; y: number; v: number; n: number }[] = [];
  private r = makeRng(99);
  private stage!: StageDef;
  /** Screen transform: world px to css px. */
  scale = 1; ox = 0; oy = 0;
  /** The part of the canvas the map may use. On a tall phone the map is wider than this and slides sideways. */
  private area = { x: 0, y: 0, w: 0, h: 0 };

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.g = canvas.getContext('2d')!;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
  }

  /** Paint the stage ground once. Slow (a second or so on a phone), so call it behind a loading screen. */
  load(b: Battle) {
    const st = b.stage;
    this.stage = st;
    this.parts = []; this.fx = []; this.floats = []; this.coins = []; this.seeds.clear(); this.gaits.clear();
    this.openedRoads.clear();
    this.waterPts = [];
    this.drainWaters = [];
    st.waters.forEach((w, idx) => {
      const pts = smooth(w.ctrl);
      if (w.drainAtWave !== undefined) this.drainWaters.push({ idx, pts, w: w.w });
      else this.waterPts.push({ pts, w: w.w });
    });
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
      roads: b.roads.filter(r => r.def.openAtWave === undefined && r.def.openOnPhase === undefined).map(r => ({ pts: r.path.pts, w: r.def.w })).sort((a, z) => a.w - z.w),
      waters: this.waterPts, high: st.high ?? [], bridges: st.bridges,
      ruins: decor.ruins, stones: decor.stones, trees: decor.trees, plots: [],
      pal: st.lava ? null : DAY_PAL[st.region], biome: st.region,
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

  static towerScale(t: { lv: number }) { return 0.6 + 0.06 * (Math.min(t.lv, 5) - 1); }

  private towerSprite(t: Tower): Sprite {
    const key = `${t.kind}:${Math.min(t.lv, 5)}:${t.split ?? ''}:${t.plot}`;
    let sp = this.sprites.get(key);
    if (!sp) {
      const S = Scene.towerScale(t), seed = 200 + t.plot * 7;
      sp = this.sprite((x, ox, oy) => paintTower(x, t.kind, ox, oy, S, 'base', seed, t.lv, t.split), 280, 300, 140, 262);
      this.sprites.set(key, sp);
    }
    return sp;
  }

  /**
   * Hit-test an interactive map switch in world coordinates.
   * With `touchPad` the target grows as the map shrinks, so it is never under 44 css px across on screen.
   */
  hitSwitch(b: Battle, wx: number, wy: number, touchPad = false): number | null {
    const r = touchPad ? Math.max(34, 22 * 1.15 / this.scale) : 34;
    for (let i = 0; i < b.switches.length; i++) {
      const [sx, sy] = b.switches[i].def.at;
      if (Math.hypot(wx - sx, (wy - sy) * 1.15) < r) return i;
    }
    return null;
  }

  /**
   * Fit the 1280x720 world into `area` of the canvas (the whole canvas by default), centred.
   * With `fillHeight` the world fills the area's height and may run past its sides; pan() slides it.
   */
  resize(cssW: number, cssH: number, area = { x: 0, y: 0, w: cssW, h: cssH }, fillHeight = false) {
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.canvas.style.width = cssW + 'px'; this.canvas.style.height = cssH + 'px';
    const centre = this.area.w ? (this.area.x + this.area.w / 2 - this.ox) / this.scale : W / 2;
    this.area = area;
    this.scale = fillHeight ? area.h / H : Math.min(area.w / W, area.h / H);
    this.oy = area.y + (area.h - H * this.scale) / 2;
    this.panTo(centre);
  }

  /** True when the map is wider than its area, so part of it is off screen. */
  get slides() { return W * this.scale > this.area.w + 1; }

  /** Slide the map sideways by dx css px, never past its edges. */
  pan(dx: number) {
    if (!this.slides) { this.ox = this.area.x + (this.area.w - W * this.scale) / 2; return; }
    this.ox = Math.min(this.area.x, Math.max(this.area.x + this.area.w - W * this.scale, this.ox + dx));
  }

  /** Put world x in the middle of the area, as far as the edges allow. */
  panTo(x: number) {
    this.ox = this.area.x + this.area.w / 2 - x * this.scale;
    this.pan(0);
  }

  /** Where the world sits on screen, in css px. */
  worldRect() { return { x: this.ox, y: this.oy, w: W * this.scale, h: H * this.scale }; }

  /** The part of the world in view, in css px. */
  viewRect() {
    const x = Math.max(this.ox, this.area.x), r = Math.min(this.ox + W * this.scale, this.area.x + this.area.w);
    return { x, y: this.oy, w: r - x, h: H * this.scale };
  }

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
          for (let i = 0; i < 3; i++) this.parts.push({ x: e.x + (R() - 0.5) * 26, y: e.y - 4, vx: (R() - 0.5) * 20, vy: -14, life: 0.9, max: 0.9, c: 'rgba(150,142,130,', s: 6, kind: 'smoke' });
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
          for (let i = 0; i < 2; i++) this.parts.push({ x: e.x + (R() - 0.5) * 16, y: e.y - 6, vx: 0, vy: -16, life: 0.8, max: 0.8, c: 'rgba(60,80,72,', s: 5, kind: 'smoke' });
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
        case 'riftWarn': {
          const r = b.roads.find(x => x.def.id === e.road);
          if (r) { const p = pointAt(r.path, 36); this.fx.push({ k: 'ring', x: p.x, y: p.y, r: 0, max: 85, life: 1.1, c: '255,155,70' }); }
          break;
        }
        case 'riftOpen': {
          if (this.openedRoads.has(e.road)) break;
          this.openedRoads.add(e.road);
          const r = b.roads.find(x => x.def.id === e.road);
          if (r) { const p = pointAt(r.path, 36); this.fx.push({ k: 'ring', x: p.x, y: p.y, r: 0, max: 140, life: 1, c: '96,226,180' }); this.shake = Math.max(this.shake, 5); }
          break;
        }
        case 'clearPlot': {
          const pl = b.plots[e.plot];
          if (pl) {
            for (let i = 0; i < 10; i++) { const a = R() * TAU; this.parts.push({ x: pl.x, y: pl.y - 6, vx: Math.cos(a) * 65, vy: Math.sin(a) * 35 - 40, life: 0.65, max: 0.65, c: '#7a6c58', s: 2.5, kind: 'chip', grav: 1 }); }
            this.fx.push({ k: 'ring', x: pl.x, y: pl.y, r: 0, max: 52, life: 0.6, c: e.free ? '140,220,160' : '230,190,110' });
          }
          break;
        }
        case 'switchFlip': {
          const sw = b.switches.find(x => x.def.id === e.id);
          if (sw) {
            const [sx, sy] = sw.def.at;
            this.fx.push({ k: 'ring', x: sx, y: sy, r: 0, max: 58, life: 0.65, c: '230,185,95' });
            for (let i = 0; i < 6; i++) { const a = R() * TAU; this.parts.push({ x: sx, y: sy - 10, vx: Math.cos(a) * 55, vy: Math.sin(a) * 40, life: 0.35, max: 0.35, c: '#ffd480', s: 2, kind: 'spark' }); }
          }
          break;
        }
        case 'terraform':
          this.shake = Math.max(this.shake, 8);
          this.fx.push({ k: 'ring', x: W / 2, y: H / 2, r: 0, max: 420, life: 0.9, c: '180,220,210' });
          break;
        case 'warp':
          this.fx.push({ k: 'ring', x: e.fromX, y: e.fromY, r: 0, max: 46, life: 0.55, c: '90,210,255' });
          this.fx.push({ k: 'ring', x: e.toX, y: e.toY, r: 0, max: 54, life: 0.65, c: '255,150,70' });
          break;
        case 'gateShock':
          this.fx.push({ k: 'ring', x: e.x, y: e.y, r: 0, max: 180, life: 0.85, c: '255,215,120' });
          this.shake = Math.max(this.shake, 6);
          break;
        default: break;
      }
    }
  }

  /** Gold from kills close together in time and place adds up in one number instead of a stack. */
  private goldPop(x: number, y: number, gold: number, hero: boolean) {
    const f = this.floats.find(o => o.gold !== undefined && o.max - o.life < 0.45 && Math.hypot(o.x - x, o.y - y) < 95);
    if (f) {
      f.gold! += gold; f.text = `+${f.gold}`; f.life = f.max; f.y -= 3;
      if (hero) { f.c = '#ffd76a'; f.big = true; }
      return;
    }
    this.float(x, y, `+${gold}`, hero ? '#ffd76a' : '#e8b34a', hero);
    this.floats[this.floats.length - 1].gold = gold;
  }

  private float(x: number, y: number, text: string, c: string, big: boolean) {
    if (this.floats.length >= 28) this.floats.shift();
    this.floats.push({ x: x + (this.r() - 0.5) * 14, y: Math.max(85, y), text, c, big, life: big ? 1.4 : 0.8, max: big ? 1.4 : 0.8 });
  }

  /* ------------------------------------------------------------------ frame */

  private seedOf(f: Foe) { let s = this.seeds.get(f.id); if (s === undefined) { s = 40 + (f.id * 7) % 9; this.seeds.set(f.id, s); } return s; }

  /** Follow each foe from frame to frame: how far it moved, which way it heads, how it turns. */
  private stepGaits(b: Battle, dt: number) {
    const tick = ++this.gaitTick;
    for (const f of b.foes) {
      let m = this.gaits.get(f.id);
      const seed = this.seedOf(f);
      if (!m) {
        // Start mid stride and already walking, so a still frame shows foes on the move and a crowd is never in step.
        m = { x: f.x, y: f.y, ph: seed * 1.7 + f.id * 2.3, v: 1, face: f.dir || 1, hx: f.dir || 1, hy: 0, tick };
        this.gaits.set(f.id, m);
      }
      m.tick = tick;
      if (dt <= 0) continue;
      const dx = f.x - m.x, dy = f.y - m.y, dist = Math.hypot(dx, dy);
      m.x = f.x; m.y = f.y;
      // A burrower that pops up across the map, or a boss phase jump, is not a stride.
      if (dist > 40) continue;
      // Legs turn over with ground covered, not with time: slowed foes trudge, held foes stand.
      m.ph += dist / GAIT[gaitOf(f)].stride * TAU;
      const k = 1 - Math.exp(-dt * 8);
      m.v += (Math.min(1.5, dist / dt / f.def.speed) - m.v) * k;
      if (dist > 0.05) { m.hx += (dx / dist - m.hx) * (1 - Math.exp(-dt * 6)); m.hy += (dy / dist - m.hy) * (1 - Math.exp(-dt * 6)); }
      // Turning around takes a beat: the body swings through instead of flipping in one frame.
      const want = f.dir || 1;
      m.face += Math.sign(want - m.face) * Math.min(Math.abs(want - m.face), dt * 7);
    }
    if (tick % 120 === 0) for (const [id, m] of this.gaits) if (m.tick !== tick) this.gaits.delete(id);
  }

  draw(b: Battle, view: View, T: number, dt: number) {
    const g = this.g, st = this.stage, R = this.r;
    this.step(dt);
    this.stepGaits(b, dt);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#e4dccb'; g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    g.translate(this.ox, this.oy); g.scale(this.scale, this.scale);
    g.save();
    g.beginPath(); g.rect(0, 0, W, H); g.clip();
    if (this.shake > 0 && !view.reduceMotion) g.translate((R() - 0.5) * this.shake, (R() - 0.5) * this.shake);
    g.drawImage(this.bg, 0, 0, W, H);

    // Dynamic drainable water bodies (wet channel until drain wave, then exposed sandbar bed).
    for (const dw of this.drainWaters) {
      const drained = b.waters[dw.idx]?.drained ?? false;
      g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
      L.strokePts(g, dw.pts);
      if (!drained) {
        g.strokeStyle = st.lava ? 'rgba(110,40,18,.92)' : 'rgba(56,112,138,.86)'; g.lineWidth = dw.w; g.stroke();
        g.globalCompositeOperation = 'lighter';
        g.strokeStyle = st.lava ? 'rgba(255,140,60,.4)' : 'rgba(220,235,245,.32)'; g.lineWidth = 1.8; g.setLineDash([6, 26, 12, 40]); g.lineDashOffset = -T * 24; g.stroke();
      } else {
        g.strokeStyle = st.lava ? 'rgba(66,54,48,.88)' : 'rgba(154,142,118,.84)'; g.lineWidth = dw.w * 0.92; g.stroke();
        g.strokeStyle = 'rgba(72,62,48,.32)'; g.lineWidth = 2; g.setLineDash([4, 18]); g.stroke();
      }
      g.setLineDash([]); g.restore();
    }

    // Dynamically awakened roads (openAtWave or openOnPhase once opened).
    for (const r of b.roads) {
      if ((r.def.openAtWave === undefined && r.def.openOnPhase === undefined) || !r.active) continue;
      g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
      L.strokePts(g, r.path.pts);
      g.strokeStyle = st.lava ? 'rgba(46,38,34,.92)' : 'rgba(192,172,138,.9)'; g.lineWidth = r.def.w; g.stroke();
      g.strokeStyle = 'rgba(24,20,16,.24)'; g.lineWidth = 2; g.setLineDash([6, 12]); g.stroke();
      g.setLineDash([]); g.restore();
    }

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

    // Subtle Sanctuary healing arc around Keep Gate when Wren is injured or inside radius.
    if (!view.still) {
      for (const [gx, gy] of b.gate) {
        const near = !b.hero.dead && Math.hypot(gx - b.hero.x, gy - b.hero.y) < HERO.gateRadius;
        if (near || (!b.hero.dead && b.hero.hp < b.heroMaxHp() * 0.85)) {
          g.save();
          g.strokeStyle = near ? 'rgba(128,210,110,.36)' : 'rgba(235,195,120,.2)';
          g.lineWidth = 1.6; g.setLineDash([6, 8]);
          g.beginPath(); g.ellipse(gx, gy, HERO.gateRadius, HERO.gateRadius / Y_SQUASH, 0, 0, TAU); g.stroke();
          g.restore();
        }
      }
    }

    this.drawMapRules(b, T, view);
    this.drawPlots(b, view, T);
    this.drawRifts(T);
    if (b.rune) this.drawRune(b.rune, T, view.reduceMotion);

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
    if (!b.hero.dead) this.drawHero(b, 'emit', T, !!view.still);
    for (const [gx, gy] of b.gate) L.gate(g, gx, gy, 'emit');
    if (st.lighthouse) {
      const [lx, ly] = st.lighthouse;
      // The beam sweeps; with calm motion it rests at one angle.
      const beamAng = view.reduceMotion ? -0.6 : T * 0.65;
      g.save(); g.globalCompositeOperation = 'lighter';
      g.translate(lx, ly - 110); g.rotate(beamAng);
      const beamG = g.createLinearGradient(0, 0, 380, 0);
      beamG.addColorStop(0, 'rgba(255,230,175,.36)'); beamG.addColorStop(1, 'rgba(255,230,175,0)');
      g.fillStyle = beamG; g.beginPath(); g.moveTo(0, -10); g.lineTo(380, -76); g.lineTo(380, 76); g.lineTo(0, 10); g.closePath(); g.fill();
      g.restore();
      g.save(); g.globalCompositeOperation = 'lighter'; L.glow(g, lx, ly - 110, 62, '#ffe6b0', 0.55); g.restore();
    }

    if (!view.still) this.drawShots(b);
    this.drawFx(T);
    if (st.weather === 'rain' && !view.reduceMotion) {
      g.save();
      g.strokeStyle = 'rgba(195,222,245,.24)'; g.lineWidth = 1.1; g.lineCap = 'round';
      for (let i = 0; i < 65; i++) {
        const rx = ((i * 97 + T * 420) % (W + 120)) - 60;
        const ry = ((i * 71 + T * 880) % (H + 80)) - 40;
        g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx - 14, ry + 28); g.stroke();
      }
      g.restore();
    }
    this.drawRanges(b, view);
    this.drawCrows(T, dt, view.reduceMotion);
    if (!view.reduceMotion) L.fog(g, W, H, 9, T * 10, st.lava ? 0.05 : 0.025);
    g.restore();

    // Overlays that ignore shake.
    g.save(); g.beginPath(); g.rect(0, 0, W, H); g.clip();
    L.vignette(g, W, H, b.night ? 0.7 : 0.16);
    if (this.flash > 0 && !view.reduceMotion) { g.fillStyle = `rgba(255,${b.status === 'lost' ? 80 : 230},${b.status === 'lost' ? 60 : 180},${this.flash * 0.35})`; g.fillRect(0, 0, W, H); }
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
    if (this.slides && !view.still) this.drawEdgeMarks(b);
  }

  /** When the map runs off the screen's sides: a dark notch at the edge for each foe out of view, and a hint that there is more road. */
  private drawEdgeMarks(b: Battle) {
    const g = this.g, v = this.viewRect(), x0 = (v.x - this.ox) / this.scale, x1 = (v.x + v.w - this.ox) / this.scale;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    for (const side of [-1, 1]) {
      const more = side < 0 ? v.x > this.ox + 1 : v.x + v.w < this.ox + W * this.scale - 1;
      if (!more) continue;
      const ex = side < 0 ? v.x : v.x + v.w;
      const fade = g.createLinearGradient(ex, 0, ex - side * 18, 0);
      fade.addColorStop(0, 'rgba(36,30,24,0.28)'); fade.addColorStop(1, 'rgba(36,30,24,0)');
      g.fillStyle = fade; g.fillRect(side < 0 ? ex : ex - 18, v.y, 18, v.h);
      for (const f of b.foes) {
        if (f.dead || (side < 0 ? f.x >= x0 : f.x <= x1)) continue;
        const y = v.y + Math.max(8, Math.min(v.h - 8, f.y * this.scale));
        g.fillStyle = '#7a1f12'; g.beginPath();
        g.moveTo(ex - side * 11, y - 7); g.lineTo(ex - side * 2, y); g.lineTo(ex - side * 11, y + 7); g.closePath(); g.fill();
      }
    }
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

  private drawMapRules(b: Battle, T: number, view: View) {
    const g = this.g, st = this.stage;
    // Telegraphed upcoming Rift breaches & dashed threat path splines (1 full wave in advance!).
    for (const r of b.roads) {
      if (!r.telegraph) continue;
      const p0 = pointAt(r.path, 36);
      g.save();
      g.strokeStyle = `rgba(218,86,52,${0.32 + 0.16 * Math.sin(T * 4)})`;
      g.lineWidth = 3; g.setLineDash([8, 10]); g.lineDashOffset = -T * 32;
      L.strokePts(g, r.path.pts); g.stroke(); g.setLineDash([]);
      g.fillStyle = 'rgba(28,16,14,.86)'; g.beginPath(); g.arc(p0.x, p0.y, 13, 0, TAU); g.fill();
      g.strokeStyle = '#ff8a50'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#ffe6b8'; g.font = '800 12px Barlow, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('!', p0.x, p0.y + 0.5);
      g.restore();
    }
    // Portals / Chutes / Drift Rifts with directional flow arcs.
    for (const pt of b.portals) {
      const col = pt.def.kind === 'rift' ? '#ff7a3a' : pt.def.kind === 'chute' ? '#e5a444' : '#5ad8ff';
      const [fx, fy] = pt.fromPos, [tx, ty] = pt.toPos;
      g.save();
      g.globalAlpha = pt.active ? 0.92 : 0.35;
      g.strokeStyle = col; g.lineWidth = 1.6; g.setLineDash([5, 7]); g.lineDashOffset = -T * 24;
      g.beginPath(); g.moveTo(fx, fy); g.quadraticCurveTo((fx + tx) / 2, Math.min(fy, ty) - 42, tx, ty); g.stroke(); g.setLineDash([]);
      for (const [px, py] of [pt.fromPos, pt.toPos]) {
        g.fillStyle = 'rgba(18,22,26,.8)'; g.beginPath(); g.ellipse(px, py, 16, 8, 0, 0, TAU); g.fill();
        g.strokeStyle = col; g.lineWidth = 2; g.stroke();
        if (pt.active) { g.globalCompositeOperation = 'lighter'; L.glow(g, px, py, 16, col, 0.35 + 0.1 * Math.sin(T * 5)); g.globalCompositeOperation = 'source-over'; }
      }
      g.restore();
    }
    // Interactive tactical map switches (Fork track, Boom gate, Foundry conveyor brake).
    b.switches.forEach((sw, si) => {
      const [sx, sy] = sw.def.at;
      const hot = view.hoveredSwitch === si;
      const active = sw.activeT > 0;
      const ready = sw.cdLeft <= 0 && !active;
      const col = active ? '#5ee8c0' : ready ? '#e6a83e' : '#7a756c';
      g.save();
      L.shadow(g, sx + 2, sy + 5, 16, 6, 0.45);
      g.fillStyle = '#2d2924'; g.beginPath(); g.ellipse(sx, sy + 2, 16, 8, 0, 0, TAU); g.fill();
      g.strokeStyle = hot ? '#fff3d4' : col; g.lineWidth = hot ? 2.5 : 1.8; g.stroke();
      // Lever handle tilted according to state
      g.strokeStyle = '#d8cbb4'; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + (sw.state ? 10 : -10), sy - 14); g.stroke();
      g.fillStyle = col; g.beginPath(); g.arc(sx + (sw.state ? 10 : -10), sy - 14, 4.5, 0, TAU); g.fill();
      if (sw.boosted) { g.strokeStyle = 'rgba(255,214,140,.75)'; g.lineWidth = 1.4; g.beginPath(); g.ellipse(sx, sy + 2, 22, 11, 0, 0, TAU); g.stroke(); }
      if (sw.cdLeft > 0 || active) {
        const share = active ? sw.activeT / (sw.def.dur ?? 10) : 1 - sw.cdLeft / sw.def.cd;
        g.strokeStyle = active ? '#6ff5d0' : 'rgba(246,240,228,.75)'; g.lineWidth = 2.5;
        g.beginPath(); g.arc(sx, sy - 6, 15, -Math.PI / 2, -Math.PI / 2 + share * TAU); g.stroke();
      }
      // Boom bar across road when a gate switch seals it.
      if (sw.def.mode === 'gate' && active) {
        g.strokeStyle = '#d98a2b'; g.lineWidth = 6; g.beginPath(); g.moveTo(sx - 26, sy - 6); g.lineTo(sx + 26, sy - 6); g.stroke();
        g.strokeStyle = '#1d1914'; g.lineWidth = 6; g.setLineDash([7, 7]); g.beginPath(); g.moveTo(sx - 26, sy - 6); g.lineTo(sx + 26, sy - 6); g.stroke(); g.setLineDash([]);
      }
      g.restore();
    });
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
      if (!p.unlocked) {
        g.save();
        g.fillStyle = this.stage.lava ? 'rgba(80,45,30,.45)' : 'rgba(65,108,132,.48)';
        g.beginPath(); g.ellipse(p.x, p.y - 1, 32, 13, 0, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(220,235,245,.32)'; g.lineWidth = 1.2; g.setLineDash([4, 5]); g.stroke();
        g.restore();
        return;
      }
      if (p.rubble) {
        g.save();
        L.shadow(g, p.x + 2, p.y + 3, 30, 11, 0.45);
        g.fillStyle = p.rubble.kind === 'slag' ? '#4a352e' : p.rubble.kind === 'crane' ? '#585c62' : '#645c50';
        g.beginPath(); g.ellipse(p.x - 9, p.y - 4, 13, 8, -0.2, 0, TAU); g.ellipse(p.x + 10, p.y - 3, 12, 7, 0.25, 0, TAU); g.ellipse(p.x + 1, p.y - 10, 11, 8, 0, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(255,220,160,.45)'; g.lineWidth = 1.2;
        if (view.selPlot === i || view.hoveredPlot === i) {
          g.beginPath(); g.ellipse(p.x, p.y - 2, 39, 16, 0, 0, TAU); g.stroke();
        }
        if (p.rubble.holdSec && p.rubbleLeft < p.rubble.holdSec) {
          const prog = Math.max(0, Math.min(1, 1 - p.rubbleLeft / p.rubble.holdSec));
          g.strokeStyle = '#7fe698'; g.lineWidth = 3;
          g.beginPath(); g.arc(p.x, p.y - 10, 20, -Math.PI / 2, -Math.PI / 2 + prog * TAU); g.stroke();
        }
        g.restore();
        return;
      }
      if (used) return;
      if (view.hintPlot === i && view.selPlot !== i) {
        // A steady double ring, no pulse: easy to find, quiet once seen.
        g.lineWidth = 3; g.strokeStyle = 'rgba(255,248,232,.95)';
        g.beginPath(); g.ellipse(p.x, p.y - 1.5, 46, 19, 0, 0, TAU); g.stroke();
        g.lineWidth = 2; g.strokeStyle = 'rgba(40,30,22,.75)';
        g.beginPath(); g.ellipse(p.x, p.y - 1.5, 50, 21, 0, 0, TAU); g.stroke();
      }
      if (b.mods.tidePearl && p.nearWater && (view.selPlot === i || view.selPlot !== null)) {
        g.strokeStyle = 'rgba(110,198,228,.55)'; g.lineWidth = 2; g.setLineDash([5, 5]);
        g.beginPath(); g.ellipse(p.x, p.y - 1.5, 43, 17.5, 0, 0, TAU); g.stroke(); g.setLineDash([]);
      }
      if (view.selPlot === i) {
        g.strokeStyle = `rgba(255,214,140,${0.6 + 0.3 * Math.sin(T * 6)})`; g.lineWidth = 2.5;
        g.beginPath(); g.ellipse(p.x, p.y - 1.5, 39, 16, 0, 0, TAU); g.stroke();
      }
      // Subtle stone-and-brass build mark on open plots; vivid rust-red only when focused or hinted.
      if (canAfford && !b.over && (!p.gear || isGearUp(b, p.gear))) {
        const hot = view.selPlot === i || view.hintPlot === i;
        const x = p.x, y = p.y - 2;
        g.fillStyle = hot ? 'rgba(40,24,16,.28)' : 'rgba(40,30,20,.18)'; g.beginPath(); g.ellipse(x + 1, y + 2, 9.5, 4.5, 0, 0, TAU); g.fill();
        g.fillStyle = hot ? '#a63d26' : 'rgba(104,88,66,.84)'; g.beginPath(); g.arc(x, y - 4, hot ? 9 : 8, 0, TAU); g.fill();
        g.strokeStyle = hot ? 'rgba(255,240,225,.92)' : 'rgba(245,236,218,.68)'; g.lineWidth = 1.2; g.stroke();
        g.strokeStyle = hot ? '#fff6ea' : 'rgba(255,248,234,.88)'; g.lineWidth = hot ? 2.4 : 2; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x - 3.6, y - 4); g.lineTo(x + 3.6, y - 4); g.moveTo(x, y - 7.6); g.lineTo(x, y - 0.4); g.stroke(); g.lineCap = 'butt';
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

  private drawRune(r: { kind: keyof typeof RUNES; x: number; y: number; ttl: number }, T: number, calm: boolean) {
    const g = this.g, c = RUNES[r.kind].color, bob = Math.sin(T * 3) * 4;
    // About to fade: it blinks and counts down. With calm motion a steady ring stands in for the blink.
    const fading = r.ttl <= RUNE_WARN_SEC;
    const blink = fading && !calm ? 0.4 + 0.6 * Math.abs(Math.sin(T * 5)) : 1;
    L.shadow(g, r.x, r.y + 4, 16, 5, 0.5);
    g.save(); g.globalAlpha = blink; g.translate(r.x, r.y - 26 + bob); g.rotate(T);
    g.fillStyle = '#1a1c20'; g.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; g.lineTo(Math.cos(a) * 13, Math.sin(a) * 13); } g.fill();
    g.strokeStyle = c; g.lineWidth = 2.5; g.stroke();
    g.restore();
    g.save(); g.globalCompositeOperation = 'lighter'; L.glow(g, r.x, r.y - 26 + bob, 34, c, 0.55 * blink); g.restore();
    if (!fading) return;
    g.save();
    if (calm) { g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); g.ellipse(r.x, r.y + 3, 24, 9, 0, 0, TAU); g.stroke(); }
    const left = String(Math.max(1, Math.ceil(r.ttl)));
    g.font = '800 14px Barlow, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 3.5; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(left, r.x, r.y - 54);
    g.fillStyle = '#fff3d4'; g.fillText(left, r.x, r.y - 54);
    g.restore();
  }

  private drawTowerBase(t: Tower) {
    const g = this.g, S = Scene.towerScale(t);
    // A tower on a lowered gear plot sinks back and fades, so it reads as off, not as a smudge.
    if (t.down) { g.save(); g.globalAlpha = 0.42; }
    this.put(this.towerSprite(t), t.x, t.y);
    if (t.kind === 'cannon') X.cannonBarrel(g, t.x + 4 * S, t.y, S, t.aim, Math.max(0, 1 - t.fired * 4), 0);
    if (t.down) g.restore();
    // Integrated plinth rune gem for loaded elemental rounds (replaces floating badge dots).
    if (t.round) {
      const c = t.round === 'ember' ? '#ff8a3a' : t.round === 'frost' ? '#8fd0ff' : '#b9a8ff';
      g.save();
      g.fillStyle = '#1c1814'; g.beginPath(); g.arc(t.x, t.y - 5, 5.2, 0, TAU); g.fill();
      g.fillStyle = c; g.beginPath(); g.arc(t.x, t.y - 5, 3.6, 0, TAU); g.fill();
      g.restore();
    }
    if (t.down) {
      // Compact crescent sleep icon badge above tower plinth without boxy text strings.
      g.save();
      g.fillStyle = 'rgba(24,22,20,.88)'; g.beginPath(); g.arc(t.x, t.y - 26, 9, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(220,195,150,.75)'; g.lineWidth = 1.2; g.stroke();
      g.fillStyle = '#e8d4a6'; g.beginPath(); g.arc(t.x - 1, t.y - 26, 4.5, 0.6, TAU - 0.6); g.fill();
      g.restore();
    }
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
    const g = this.g, seed = this.seedOf(f);
    const m = this.gaits.get(f.id), kind = gaitOf(f), gt = GAIT[kind];
    const ph = m?.ph ?? seed, v = Math.min(1, m?.v ?? 1);
    // A turn shows as the body swinging through side on; never thinner than a quarter, so it never vanishes.
    const fs = m?.face ?? (f.dir || 1), face = Math.sign(fs || 1) * Math.max(0.25, Math.abs(fs));
    // Crowds spread across the road instead of walking in single file, and weave a little as they go.
    const hx = m?.hx ?? 1, hy = m?.hy ?? 0, hl = Math.hypot(hx, hy) || 1;
    const lane = f.def.traits?.boss || f.def.flying ? 0 : Math.max(-8, Math.min(8, f.off * 0.45)) + Math.sin(T * 0.9 + seed * 3) * 2 * v;
    const x = f.x - hy / hl * lane, y = f.y + hx / hl * lane * Y_SQUASH;
    // Held by Wren: rear back and strike instead of walking in place.
    const strike = f.blocked ? Math.max(0, Math.sin(T * 6 + seed)) ** 3 : 0;
    // Each footfall lifts and drops the body; at rest only a slow breath remains.
    const step = Math.abs(Math.sin(ph)) * gt.lift * v;
    const breath = Math.sin(T * 2.2 + seed) * 0.5;
    const by = y - step + breath * (1 - v);
    const bx = x + strike * 5 * Math.sign(face);
    // Nose up going up the screen, down going down; heavy walkers also rock side to side.
    const tilt = (hy / hl) * 0.16 * Math.sign(face) + Math.sin(ph) * gt.rock * v - strike * 0.12 * Math.sign(face);
    // Crawlers surge: stretch as they reach, bunch up as they pull.
    const surge = Math.sin(ph * 2) * gt.surge * v;
    const legs = f.blocked || v < 0.05 ? undefined : ph;
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
    g.save();
    g.translate(bx, by); g.rotate(tilt); g.scale(K * (1 + surge), K * (1 - surge * 0.8)); g.translate(-bx, -by);
    // Wings beat: seen from the front, a flap reads as the wings folding in and opening out.
    const flap = (k: number) => { g.save(); g.translate(bx, by); g.scale(1 - k * (0.5 + 0.5 * Math.sin(T * 13 + seed)), 1); g.translate(-bx, -by); };
    const mothY = by + Math.sin(T * 3 + seed) * 3 - Math.max(0, Math.sin(T * 13 + seed)) * 2;
    paintFoe(g, f.kind, bx, by, pass, seed, face, legs, { chilled: f.slowT > 0 || f.freezeT > 0, T, flap, mothY });
    // The green glow in their seams: the one strong colour the Hollow owns.
    if (pass === 'emit' && !hidden && !f.def.flying) { g.save(); g.globalCompositeOperation = 'lighter'; L.glow(g, bx, by - f.def.bar * 0.35, 12 + 6 * S, '#3be0b8', 0.28); g.restore(); }
    g.restore();
    g.globalAlpha = 1;
    if (pass === 'base') {
      if (f.rootT > 0) { g.fillStyle = '#182414'; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, rx = x + Math.cos(a) * 14 * S, ry = y + Math.sin(a) * 4; g.beginPath(); g.moveTo(rx - 3, ry); g.lineTo(rx + Math.cos(a) * 3, ry - 12 - f.rootT * 4); g.lineTo(rx + 3, ry); g.fill(); } }
      if (f.freezeT > 0) {
        // Faceted ice crystal cage for Hard Freeze
        g.fillStyle = 'rgba(185,232,255,.55)'; g.strokeStyle = 'rgba(240,252,255,.9)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x - 14 * S, y); g.lineTo(x - 10 * S, y - 22 * S); g.lineTo(x, y - 28 * S); g.lineTo(x + 11 * S, y - 20 * S); g.lineTo(x + 14 * S, y); g.closePath(); g.fill(); g.stroke();
      } else if (f.slowT > 0) {
        g.fillStyle = 'rgba(190,225,250,.35)'; g.beginPath(); g.ellipse(x, y + 2, 18 * S, 5 * S, 0, 0, TAU); g.fill();
      }
      if (f.burnT > 0) {
        // Multi-tongue rising ember flames
        for (let k = -1; k <= 1; k++) {
          const fh = 12 + Math.sin(T * 14 + k * 2) * 3;
          g.fillStyle = k === 0 ? 'rgba(255,195,80,.82)' : 'rgba(255,112,38,.72)';
          g.beginPath(); g.moveTo(x + k * 5 - 3, y - 4); g.quadraticCurveTo(x + k * 5 + Math.sin(T * 9 + k) * 3, y - 4 - fh, x + k * 5 + 3, y - 4); g.fill();
        }
      }
      if (f.vulnT > 0) {
        // Armor break / Sunder orange ring beneath foe
        g.strokeStyle = 'rgba(255,158,64,.82)'; g.lineWidth = 1.6; g.setLineDash([4, 3]);
        g.beginPath(); g.ellipse(x, y + 2, 19 * S, 6.5 * S, 0, 0, TAU); g.stroke(); g.setLineDash([]);
      }
    }
    if (pass === 'emit' && !hidden) {
      if (f.shielded) ringGlow(g, x, y - f.def.bar * 0.4, 20 * S, '90,220,185', 0.35 + 0.08 * Math.sin(T * 5));
      if (f.hp < f.max || f.def.traits?.boss) {
        const w = f.def.traits?.boss ? 90 : 34, hy = y - f.def.bar * K;
        bar0(g, x, hy, f.hp / f.max, f.def.traits?.boss ? '#e0503a' : f.shielded ? '#5ac8a8' : f.vulnT > 0 ? '#e88b3a' : '#c8552e', w);
      }
      if (f.hitT > 0) { g.save(); g.globalCompositeOperation = 'lighter'; L.glow(g, x, y - f.def.bar * 0.5, 16 * S, '#ffffff', f.hitT * 2); g.restore(); }
    }
  }

  private drawHero(b: Battle, pass: 'base' | 'emit', T: number, still = false) {
    const g = this.g, h = b.hero;
    if (pass === 'base') {
      // A pale ring of lantern light at her feet: the one unit you command never reads as a foe.
      g.save();
      g.fillStyle = 'rgba(255,244,214,.38)'; g.beginPath(); g.ellipse(h.x, h.y + 2, 30, 11, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,236,190,.95)'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(h.x, h.y + 2, 30, 11, 0, 0, TAU); g.stroke();
      for (let i = 0; i < h.items.length; i++) {
        const px = h.x - 10 + i * 10, py = h.y + 13;
        g.fillStyle = '#d49a38'; g.beginPath(); g.moveTo(px, py - 3.5); g.lineTo(px + 3.5, py); g.lineTo(px, py + 3.5); g.lineTo(px - 3.5, py); g.closePath(); g.fill();
      }
      g.restore();
      L.wren(g, h.x, h.y, 1.4, 'base', h.face || 1, h.moving ? T : h.swing);
      if (h.swing > 0) { g.strokeStyle = `rgba(220,235,250,${h.swing * 3})`; g.lineWidth = 3; g.beginPath(); g.arc(h.x + h.face * 12, h.y - 30, 30, h.face > 0 ? -1.4 : Math.PI + 1.4, h.face > 0 ? 0.3 : Math.PI - 0.3, h.face < 0); g.stroke(); }
      return;
    }
    L.wren(g, h.x, h.y, 1.4, 'emit', h.face || 1, h.moving ? T : h.swing);
    if (still) return;
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
      const waterBonus = b.mods.tidePearl && p.nearWater ? 0.15 : 0;
      ring(p.x, p.y, def.range[0] * (1 + b.mods.towerRange[view.preview] + b.mods.rangeAll + waterBonus) * (p.high ? 1.2 : 1), 'rgba(255,214,140,A)');
    }
    if (view.aimW) {
      const [x, y] = view.aimW;
      ring(b.hero.x, b.hero.y, SNARE.range, 'rgba(255,214,140,A)');
      ring(x, y, SNARE.radius, 'rgba(255,150,70,A)');
    }
    if (view.showLeash && !b.hero.dead) {
      ring(b.hero.anchorX, b.hero.anchorY, HERO.leash, 'rgba(255,214,140,A)');
      if (b.hero.ranks.e > 0) ring(b.hero.x, b.hero.y, ATTUNE.radius, 'rgba(130,220,145,A)');
    }
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

export function paintTower(c: CanvasRenderingContext2D, kind: TowerKind, x: number, y: number, s: number, pass: 'base' | 'emit', seed: number, lv = 1, split: 'a' | 'b' | null = null, drawBarrel = true) {
  if (pass === 'base' && lv >= 2) {
    // Reinforced iron/masonry plinth ring so upgraded towers carry clear visual weight from Lv 2+.
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = '#2d2924'; c.beginPath(); c.ellipse(0, -3, 38, 13.5, 0, 0, TAU); c.fill();
    c.strokeStyle = lv >= 3 ? 'rgba(218,168,78,.85)' : 'rgba(185,175,155,.5)'; c.lineWidth = 2.2;
    c.beginPath(); c.ellipse(0, -4, 37, 13, 0, 0, Math.PI); c.stroke();
    for (let k = -2; k <= 2; k++) { c.fillStyle = lv >= 3 ? '#d8a648' : '#78726a'; c.beginPath(); c.arc(k * 13, 6 - Math.abs(k) * 1.4, 2, 0, TAU); c.fill(); }
    c.restore();
  }
  switch (kind) {
    case 'watch': L.watchTower(c, x, y, s, pass, seed); break;
    case 'bell': L.frostBell(c, x, y, s, pass, seed); break;
    case 'pylon': L.stormPylon(c, x, y, s, pass, seed, null); break;
    case 'cannon': X.forgeCannon(c, x, y, s, pass, seed); if (pass === 'base' && drawBarrel) X.cannonBarrel(c, x + 4 * s, y, s, -0.3, 0, 0); break;
    case 'beacon': X.beaconTower(c, x, y, s, pass, seed); if (pass === 'emit') X.beaconFire(c, x, y, s, 1.3); break;
    case 'roots': X.rootGarden(c, x, y, s, pass, seed); if (pass === 'emit') X.rootPods(c, x, y, s, 1, 0.4); break;
  }
  if (pass === 'base' && split) {
    // Distinct Lv 4 specialization trim: Split A wears heavy bastion/crimson banners; Split B wears sleek arcane/copper finials.
    c.save(); c.translate(x, y); c.scale(s, s);
    if (split === 'a') {
      for (const sd of [-1, 1]) {
        c.fillStyle = '#9e3420'; c.beginPath(); c.moveTo(sd * 22, -46); c.lineTo(sd * 29, -44); c.lineTo(sd * 28, -26); c.lineTo(sd * 25, -30); c.lineTo(sd * 22, -26); c.closePath(); c.fill();
        c.strokeStyle = '#e0ac4c'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(sd * 21, -46); c.lineTo(sd * 30, -44); c.stroke();
      }
    } else {
      for (const sd of [-1, 1]) {
        c.fillStyle = '#485666'; c.beginPath(); c.moveTo(sd * 19, -40); c.lineTo(sd * 28, -58); c.lineTo(sd * 23, -36); c.closePath(); c.fill();
        c.strokeStyle = '#9ed8f5'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(sd * 20, -40); c.lineTo(sd * 27.5, -57); c.stroke();
      }
    }
    if (lv >= 5) {
      // Radiant Mastery crown halo at Lv 5
      c.strokeStyle = '#ffd978'; c.lineWidth = 1.6;
      c.beginPath(); c.ellipse(0, -138, 18, 5.5, 0, 0, TAU); c.stroke();
      c.fillStyle = '#fff5cf'; c.beginPath(); c.arc(0, -144, 3.2, 0, TAU); c.fill();
    }
    c.restore();
  }
}

export interface FoePaintOpts {
  chilled?: boolean;
  T?: number;
  flap?: (k: number) => void;
  mothY?: number;
  wings?: boolean;
  alt?: number;
}

/** Paints any of the 16 Hollow enemy kinds with distinct silhouettes, crests, and readable role accents. */
export function paintFoe(
  g: CanvasRenderingContext2D,
  kind: EnemyKind,
  bx: number,
  by: number,
  pass: 'base' | 'emit',
  seed: number,
  face = 1,
  legs?: number,
  opts: FoePaintOpts = {},
) {
  const T = opts.T ?? 0;
  const mothY = opts.mothY ?? by;
  const alt = opts.alt ?? 60;
  const dir = Math.sign(face || 1);
  switch (kind) {
    case 'grub':
      L.grub(g, bx, by, 0.42, pass, seed, face, legs);
      break;
    case 'skitter':
      // Swept arachnid outrigger legs + bright amber dorsal racing chevron.
      if (pass === 'base') {
        g.save(); g.translate(bx, by); g.scale(face, 1);
        g.strokeStyle = '#18120e'; g.lineWidth = 1.6; g.lineCap = 'round';
        for (let k = 0; k < 4; k++) {
          const lx = -10 + k * 6, lift = legs !== undefined ? Math.sin(legs * 2 + k * 1.5) * 2.5 : 0;
          g.beginPath(); g.moveTo(lx, -4); g.lineTo(lx - 4, -13 - lift); g.lineTo(lx - 9, 1 - lift * 0.5); g.stroke();
          g.fillStyle = '#e08e36'; g.beginPath(); g.arc(lx - 4, -13 - lift, 1.4, 0, TAU); g.fill();
        }
        g.restore();
      }
      L.grub(g, bx, by, 0.3, pass, seed + 3, face, legs);
      if (pass === 'base') {
        g.save(); g.translate(bx, by); g.scale(face, 1);
        g.fillStyle = '#e59438'; g.beginPath(); g.moveTo(-8, -9); g.lineTo(5, -8); g.lineTo(-2, -5); g.closePath(); g.fill();
        g.restore();
      } else {
        g.save(); g.globalCompositeOperation = 'lighter'; L.glow(g, bx + dir * 10, by - 6, 8, '#ff9d3b', 0.35); g.restore();
      }
      break;
    case 'mender':
      L.grub(g, bx, by, 0.46, pass, seed + 5, face, legs);
      // Bioluminescent emerald healing spore-fronds along its spine.
      if (pass === 'base') {
        g.save(); g.translate(bx, by); g.scale(face, 1);
        for (const [ox, h] of [[-10, 15], [-1, 19], [8, 14]]) {
          g.strokeStyle = '#284a2c'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(ox, -10); g.quadraticCurveTo(ox - 3, -10 - h * 0.6, ox - 1, -10 - h); g.stroke();
          g.fillStyle = '#72ea8e'; g.beginPath(); g.arc(ox - 1, -10 - h, 3.1, 0, TAU); g.fill();
        }
        g.restore();
      } else {
        ringGlow(g, bx, by - 12, 26, '120,230,140', 0.24 + 0.1 * Math.sin(T * 4));
        g.save(); g.globalCompositeOperation = 'lighter'; L.glow(g, bx, by - 24, 16, '#6ef08e', 0.42); g.restore();
      }
      break;
    case 'shade':
      // Tattered twilight wraith shroud + eerie violet seam luminescence.
      if (pass === 'base') {
        g.save(); g.translate(bx, by); g.scale(face, 1);
        const sg = g.createLinearGradient(-32, -16, 16, 0);
        sg.addColorStop(0, 'rgba(72,52,122,0)'); sg.addColorStop(0.5, 'rgba(64,48,112,.58)'); sg.addColorStop(1, 'rgba(28,22,48,.78)');
        g.fillStyle = sg;
        g.beginPath(); g.moveTo(14, -14); g.quadraticCurveTo(-8, -22, -32, -12); g.lineTo(-24, -5); g.lineTo(-34, -1); g.quadraticCurveTo(-8, 2, 14, -4); g.closePath(); g.fill();
        g.restore();
      }
      L.grub(g, bx, by, 0.4, pass, seed + 7, face, legs);
      if (pass === 'emit') {
        g.save(); g.globalCompositeOperation = 'lighter'; L.glow(g, bx - dir * 4, by - 10, 18, '#a688ff', 0.42); g.restore();
      }
      break;
    case 'splitter':
      L.grub(g, bx, by, 0.5, pass, seed + 1, face, legs);
      // Twin-lobed brood nodules divided by a bright jade cleavage fissure.
      if (pass === 'base') {
        g.save(); g.translate(bx, by); g.scale(face, 1);
        g.fillStyle = '#203832';
        g.beginPath(); g.ellipse(-6, -15, 7, 5, -0.2, 0, TAU); g.ellipse(6, -15, 7, 5, 0.2, 0, TAU); g.fill();
        g.strokeStyle = '#7cf5cf'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -21); g.lineTo(0, -5); g.stroke();
        g.restore();
      } else {
        ringGlow(g, bx, by - 14, 22, '150,245,210', 0.22);
      }
      break;
    case 'burrower':
      L.grub(g, bx, by, 0.42, pass, seed + 2, face, legs);
      // Heavy spiral ivory-and-iron auger horn + digging fore-claws.
      if (pass === 'base') {
        g.save(); g.translate(bx, by); g.scale(face, 1);
        g.fillStyle = '#d6c8ae'; g.beginPath(); g.moveTo(17, -9); g.lineTo(33, -4); g.lineTo(17, 1); g.closePath(); g.fill();
        g.strokeStyle = '#4a3f32'; g.lineWidth = 1.3;
        g.beginPath(); g.moveTo(20, -7.5); g.lineTo(22, -0.5); g.moveTo(25, -6); g.lineTo(27, -2); g.stroke();
        g.strokeStyle = '#9e9078'; g.lineWidth = 2; g.beginPath(); g.moveTo(12, 0); g.lineTo(19, 4); g.moveTo(8, 1); g.lineTo(14, 5); g.stroke();
        g.restore();
      }
      break;
    case 'shell':
      L.shellback(g, bx, by, 0.5, pass, seed, face, opts.chilled ? 1 : 0, legs);
      if (pass === 'base') {
        g.save(); g.translate(bx, by); g.scale(face, 1);
        g.strokeStyle = 'rgba(218,176,108,.45)'; g.lineWidth = 1.4;
        g.beginPath(); g.ellipse(0, -14, 24, 14, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
        g.restore();
      }
      break;
    case 'sapper':
      L.shellback(g, bx, by, 0.42, pass, seed + 4, face, 0, legs);
      // Strapped iron-hooped powder keg + burning fuse spark on its shell.
      if (pass === 'base') {
        g.save(); g.translate(bx, by); g.scale(face, 1);
        g.fillStyle = '#6e3820'; g.beginPath(); g.roundRect(-11, -29, 20, 14, 4); g.fill();
        g.strokeStyle = '#1c1816'; g.lineWidth = 2; g.beginPath(); g.moveTo(-6, -29); g.lineTo(-6, -15); g.moveTo(4, -29); g.lineTo(4, -15); g.stroke();
        g.strokeStyle = '#cbb99c'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-1, -29); g.quadraticCurveTo(-4, -36, 3, -38); g.stroke();
        g.fillStyle = '#ff9a38'; g.beginPath(); g.arc(3, -38, 2.6, 0, TAU); g.fill();
        g.restore();
      } else {
        g.save(); g.globalCompositeOperation = 'lighter';
        L.glow(g, bx + dir * 3, by - 38, 16, '#ff8a2a', 0.65 + 0.2 * Math.sin(T * 18));
        g.fillStyle = '#fff4c8'; g.beginPath(); g.arc(bx + dir * 3, by - 38, 2, 0, TAU); g.fill();
        g.restore();
      }
      break;
    case 'elite':
      L.shellback(g, bx, by, 0.58, pass, seed + 6, face, 0, legs);
      // Silvered Riftguard crest plate + swept champion horns.
      if (pass === 'base') {
        g.save(); g.translate(bx, by); g.scale(face, 1);
        g.fillStyle = 'rgba(175,190,210,.5)'; g.beginPath(); g.ellipse(0, -22, 26, 12, 0, Math.PI, TAU); g.fill();
        g.strokeStyle = '#dce6f2'; g.lineWidth = 2.2; g.lineCap = 'round';
        g.beginPath(); g.moveTo(16, -20); g.quadraticCurveTo(30, -30, 38, -25); g.moveTo(12, -24); g.quadraticCurveTo(24, -36, 31, -33); g.stroke();
        g.restore();
      }
      break;
    case 'warden':
      L.shellback(g, bx, by, 0.66, pass, 66, face, 0, legs);
      // Tri-spired obsidian ward-tuning crest cradling a suspended Rift prism.
      if (pass === 'base') {
        g.save(); g.translate(bx, by); g.scale(face, 1);
        g.strokeStyle = '#1d2628'; g.lineWidth = 2.8; g.lineCap = 'round';
        g.beginPath(); g.moveTo(-10, -28); g.lineTo(-14, -48); g.moveTo(0, -30); g.lineTo(0, -54); g.moveTo(10, -28); g.lineTo(14, -48); g.stroke();
        g.fillStyle = '#6cf0ce'; g.beginPath(); g.moveTo(0, -61); g.lineTo(5, -54); g.lineTo(0, -47); g.lineTo(-5, -54); g.closePath(); g.fill();
        g.restore();
      } else {
        ringGlow(g, bx, by - 24, 110 / Y_SQUASH * 0.6, '90,200,170', 0.22 + 0.08 * Math.sin(T * 3));
        g.save(); g.globalCompositeOperation = 'lighter'; L.glow(g, bx, by - 54, 22, '#5ce6c0', 0.55); g.restore();
      }
      break;
    case 'moth':
      if (opts.flap) opts.flap(0.35);
      L.moth(g, bx, mothY, 0.34, pass, seed, alt);
      if (opts.flap) g.restore();
      break;
    case 'ashmoth':
      if (opts.flap) opts.flap(0.35);
      L.moth(g, bx, mothY, 0.4, pass, seed + 9, alt);
      // Glowing ember-orange cinder spots & scorched wing streaks.
      if (pass === 'base') {
        g.save(); g.translate(bx, mothY);
        for (const sd of [-1, 1]) {
          g.fillStyle = 'rgba(255,118,42,.75)'; g.beginPath(); g.ellipse(sd * 18, -9, 4.2, 2.6, sd * 0.35, 0, TAU); g.fill();
          g.strokeStyle = 'rgba(255,168,76,.65)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(sd * 4, -2); g.lineTo(sd * 25, -13); g.stroke();
        }
        g.restore();
      }
      if (opts.flap) g.restore();
      if (pass === 'emit') {
        g.save(); g.globalCompositeOperation = 'lighter'; L.glow(g, bx, mothY - 4, 24, '#ff7a3a', 0.45); g.restore();
      }
      break;
    case 'mireking':
      L.grub(g, bx, by, 1.25, pass, 41, face, legs);
      // Gnarled bog-antler crown draped with swamp moss & glowing fen orbs.
      if (pass === 'base') {
        g.save(); g.translate(bx, by); g.scale(face, 1);
        g.strokeStyle = '#2b2218'; g.lineWidth = 4; g.lineCap = 'round';
        g.beginPath();
        g.moveTo(42, -24); g.quadraticCurveTo(36, -48, 22, -60); g.moveTo(35, -42); g.lineTo(46, -54);
        g.moveTo(48, -22); g.quadraticCurveTo(56, -44, 68, -52); g.moveTo(56, -38); g.lineTo(48, -48);
        g.stroke();
        g.fillStyle = '#5a8a42';
        for (const [mx, my] of [[-24, -28], [-4, -31], [16, -28], [26, -54], [62, -48]]) {
          g.beginPath(); g.ellipse(mx, my, 7, 3.5, 0, 0, TAU); g.fill();
        }
        g.restore();
      } else {
        g.save(); g.globalCompositeOperation = 'lighter';
        L.glow(g, bx + dir * 44, by - 48, 28, '#7af07a', 0.38);
        g.restore();
      }
      break;
    case 'tidewyrm':
      // Swept-back pelagic dorsal fins + abyssal cyan bioluminescence.
      if (pass === 'base') {
        g.save(); g.translate(bx, by); g.scale(face, 1);
        for (const [fx, fy, fh] of [[-38, -16, 18], [-16, -24, 24], [8, -23, 22], [28, -18, 15]]) {
          const fg = g.createLinearGradient(fx, fy - fh, fx, fy);
          fg.addColorStop(0, '#62c4de'); fg.addColorStop(1, '#1d4658');
          g.fillStyle = fg;
          g.beginPath(); g.moveTo(fx - 8, fy); g.quadraticCurveTo(fx - 2, fy - fh, fx - 12, fy - fh); g.quadraticCurveTo(fx + 6, fy - fh * 0.5, fx + 9, fy); g.closePath(); g.fill();
        }
        g.restore();
      }
      L.grub(g, bx, by, 1.05, pass, 47, face, legs);
      if (pass === 'emit') {
        ringGlow(g, bx, by, 60, '120,205,245', 0.26);
        g.save(); g.globalCompositeOperation = 'lighter'; L.glow(g, bx + dir * 46, by - 12, 22, '#5ad8ff', 0.45); g.restore();
      }
      break;
    case 'colossus':
      // Foundry Siege Engine: burnished bronze-brass plating, giant dorsal cogwheel & furnace stack (never frosty unless chilled).
      L.shellback(g, bx, by, 1.2, pass, 61, face, opts.chilled ? 1 : 0, legs);
      if (pass === 'base') {
        g.save(); g.translate(bx, by); g.scale(face, 1);
        // Warm metallic bronze sheen across the shell dome
        const bg = g.createLinearGradient(-50, -58, 50, -10);
        bg.addColorStop(0, 'rgba(225,168,78,.36)'); bg.addColorStop(0.6, 'rgba(168,108,42,.28)'); bg.addColorStop(1, 'rgba(60,36,16,0)');
        g.fillStyle = bg; g.beginPath(); g.ellipse(0, -18, 60, 40, 0, Math.PI, TAU); g.fill();
        // Dorsal clockwork cogwheel + iron furnace stack
        g.save(); g.translate(-8, -56); g.rotate(legs !== undefined ? legs * 0.5 : 0.3);
        g.strokeStyle = '#c8923a'; g.lineWidth = 4.5; g.beginPath(); g.arc(0, 0, 16, 0, TAU); g.stroke();
        for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; g.beginPath(); g.moveTo(Math.cos(a) * 15, Math.sin(a) * 15); g.lineTo(Math.cos(a) * 22, Math.sin(a) * 22); g.stroke(); }
        g.fillStyle = '#3a2c1e'; g.beginPath(); g.arc(0, 0, 7, 0, TAU); g.fill();
        g.restore();
        g.fillStyle = '#2a2624'; g.fillRect(16, -68, 11, 22); g.fillStyle = '#b88234'; g.fillRect(14, -70, 15, 4);
        g.restore();
      } else {
        g.save(); g.globalCompositeOperation = 'lighter';
        L.glow(g, bx + dir * 21, by - 72, 26, '#ff8a30', 0.55);
        L.glow(g, bx - dir * 8, by - 56, 18, '#ffb85c', 0.3);
        g.restore();
      }
      break;
    case 'queen':
      if (opts.wings !== false) {
        if (opts.flap) opts.flap(0.15);
        L.moth(g, bx, by, 0.95, pass, 51, 40);
        if (opts.flap) g.restore();
      }
      L.shellback(g, bx, by, 0.7, pass, 63, face, 0, legs);
      // Jagged obsidian-and-gold sovereign crown atop her armoured crest.
      if (pass === 'base') {
        g.save(); g.translate(bx, by); g.scale(face, 1);
        g.fillStyle = '#1c1620';
        g.beginPath(); g.moveTo(10, -28); g.lineTo(14, -46); g.lineTo(20, -34); g.lineTo(27, -52); g.lineTo(32, -34); g.lineTo(39, -45); g.lineTo(38, -26); g.closePath(); g.fill();
        g.strokeStyle = '#f0be52'; g.lineWidth = 1.8; g.stroke();
        g.fillStyle = '#5ef2cb'; g.beginPath(); g.arc(26, -38, 3, 0, TAU); g.fill();
        g.restore();
      } else {
        ringGlow(g, bx, by - 40, 80, '90,230,190', 0.25 + 0.1 * Math.sin(T * 2));
        g.save(); g.globalCompositeOperation = 'lighter'; L.glow(g, bx + dir * 26, by - 42, 26, '#ffe082', 0.45); g.restore();
      }
      break;
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
    for (const p of b.plots) if (Math.hypot(p.x - x, p.y - y) < 84 + pad * 0.5) return false;
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

interface Gait { x: number; y: number; ph: number; v: number; face: number; hx: number; hy: number; tick: number }
type GaitKind = 'crawl' | 'scuttle' | 'plod' | 'stomp' | 'fly';
/** Per kind of walker: stride is ground covered per full leg cycle (world px); lift, rock and surge shape the body. */
const GAIT: Record<GaitKind, { stride: number; lift: number; rock: number; surge: number }> = {
  crawl: { stride: 30, lift: 0.8, rock: 0, surge: 0.035 },
  scuttle: { stride: 16, lift: 2.2, rock: 0, surge: 0.02 },
  plod: { stride: 34, lift: 1.4, rock: 0.035, surge: 0 },
  stomp: { stride: 70, lift: 3, rock: 0.025, surge: 0.015 },
  fly: { stride: 60, lift: 0, rock: 0.04, surge: 0 },
};
function gaitOf(f: Foe): GaitKind {
  if (f.def.flying) return 'fly';
  if (f.def.traits?.boss) return 'stomp';
  switch (f.kind) {
    case 'skitter': return 'scuttle';
    case 'shell': case 'sapper': case 'elite': case 'warden': return 'plod';
    default: return 'crawl';
  }
}
