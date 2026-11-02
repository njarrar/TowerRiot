/**
 * The battle: a headless, deterministic simulation of one stage.
 * It knows nothing about canvas or the DOM. The renderer reads its state and
 * drains `events` each frame; the UI calls its command methods.
 */
import { makePath, pointAt, distToPath, smooth, type Path, type Vec } from './path';
import { makeRng } from './rng';
import { ENEMIES, armorScale, goldScale, hpScale, type EnemyDef, type EnemyKind } from './data/enemies';
import { TOWERS, BEACON_BUFF, type Element, type Rounds, type TowerKind } from './data/towers';
import { spawnsOf, type Road, type StageDef } from './data/stages';
import { HERO, xpToNext, SKILLS, SWEEP, SNARE, ATTUNE, SUNRISE, type SkillKey } from './data/hero';
import { ITEMS, ITEM_SLOTS, SELL_ITEM, RUNE_EVERY, RUNE_FIRST, RUNE_ORDER, RUNES, type ItemId, type RuneKind } from './data/shop';
import { baseMods, type Mods } from './mods';

/** The game is drawn in a 3/4 view: ranges are ellipses, squashed by this factor on y. */
export const Y_SQUASH = 1.25;
export const WAVE_GAP = 22;
/** Any tower sees hidden foes this close. */
export const TOWER_SIGHT = 130;
export const LIGHTHOUSE_RANGE = 380;
/** Share of each wave group sent on wave n of total: 55% on the first wave, all of it on the last. */
export const waveRamp = (n: number, total: number) => total <= 1 ? 1 : 0.55 + 0.45 * (n - 1) / (total - 1);
const ELEMENTS: Element[] = ['pierce', 'fire', 'frost', 'storm', 'nature'];
type DmgEl = Element | 'env';
export type TargetMode = 'first' | 'strong' | 'armored' | 'close';

export interface RoadRt {
  def: Road;
  path: Path;
  closed: boolean;
  /** Distance along the road where a tide or lava closure sits, if any. */
  closeAt: number | null;
  barrier: { hp: number; max: number; d: number; x: number; y: number } | null;
  belts: { from: number; to: number; mult: number }[];
}

export interface Foe {
  id: number;
  kind: EnemyKind;
  def: EnemyDef;
  road: RoadRt;
  d: number;
  x: number;
  y: number;
  dir: number;
  /** Small sideways offset so a crowd does not walk in single file. */
  off: number;
  hp: number;
  max: number;
  speed: number;
  slow: number;
  slowT: number;
  rootT: number;
  freezeT: number;
  freezeImmune: number;
  burnT: number;
  burnDps: number;
  vulnT: number;
  blocked: boolean;
  hidden: boolean;
  shielded: boolean;
  /** Underground (burrower) or under the tide (Tidewyrm). */
  under: boolean;
  underT: number;
  abilityT: number;
  phase: number;
  burstT: number;
  hitT: number;
  dead: boolean;
}

export interface Tower {
  id: number;
  kind: TowerKind;
  plot: number;
  x: number;
  y: number;
  lv: number;
  split: 'a' | 'b' | null;
  spent: number;
  cd: number;
  mode: TargetMode;
  round: Rounds | null;
  aim: number;
  high: boolean;
  /** Gear plot lowered this wave: the tower sleeps. */
  down: boolean;
  /** Seconds since its last attack, for the renderer. */
  fired: number;
}

export interface Shot {
  id: number;
  kind: 'bolt' | 'shell';
  tower: number;
  x0: number; y0: number;
  tx: number; ty: number;
  foe: number;
  t: number;
  dur: number;
  dmg: number;
  el: Element;
  splash: number;
  round: Rounds | null;
  crit: boolean;
}

export interface Cloud { x: number; y: number; r: number; dps: number; t: number }

export interface HeroState {
  x: number; y: number;
  tx: number; ty: number;
  anchorX: number; anchorY: number;
  hp: number;
  level: number;
  xp: number;
  points: number;
  ranks: Record<SkillKey, number>;
  cd: Record<SkillKey, number>;
  atkCd: number;
  dead: boolean;
  respawnT: number;
  focus: number | null;
  items: ItemId[];
  revived: boolean;
  haste: number;
  double: number;
  regenT: number;
  sunriseT: number;
  face: number;
  swing: number;
  moving: boolean;
}

export type BattleEvent =
  | { t: 'wave'; n: number; hint: string }
  | { t: 'shot'; tower: number; kind: 'bolt' | 'shell' }
  | { t: 'pulse'; tower: number; x: number; y: number; r: number }
  | { t: 'arc'; pts: Vec[] }
  | { t: 'boom'; x: number; y: number; r: number }
  | { t: 'root'; x: number; y: number }
  | { t: 'hit'; x: number; y: number; dmg: number; crit: boolean; el: DmgEl }
  | { t: 'kill'; x: number; y: number; kind: EnemyKind; gold: number; hero: boolean }
  | { t: 'leak'; x: number; y: number; lives: number; kind: EnemyKind; hpLeft: number }
  | { t: 'adapt'; el: Element; resist: number }
  | { t: 'shift'; label: string; on: boolean }
  | { t: 'barrier'; road: string; broken: boolean }
  | { t: 'vent'; x: number; y: number }
  | { t: 'build' | 'upgrade' | 'sell'; tower: number; x: number; y: number }
  | { t: 'heroHit'; x: number; y: number }
  | { t: 'heroDown' } | { t: 'heroUp' } | { t: 'revive' }
  | { t: 'level'; level: number }
  | { t: 'skill'; key: SkillKey; x: number; y: number }
  | { t: 'rune'; kind: RuneKind; picked: boolean }
  | { t: 'buy' | 'sellItem'; item: ItemId }
  | { t: 'phase'; n: number; x: number; y: number }
  | { t: 'dive'; x: number; y: number; under: boolean }
  | { t: 'boss'; kind: EnemyKind }
  | { t: 'gear'; up: 'a' | 'b' }
  | { t: 'sink'; plot: number }
  | { t: 'night'; on: boolean }
  | { t: 'interest'; gold: number }
  | { t: 'early'; gold: number }
  | { t: 'won'; stars: number } | { t: 'lost' };

export type Status = 'prep' | 'running' | 'won' | 'lost';

interface Queued { at: number; kind: EnemyKind; spawn?: string }

export interface BattleOptions { mods?: Mods; seed?: number }

export class Battle {
  readonly stage: StageDef;
  readonly mods: Mods;
  readonly roads: RoadRt[];
  readonly spawns: Map<string, RoadRt[]>;
  readonly plots: { x: number; y: number; high: boolean; nearWater: boolean; sunk: boolean; gear?: 'a' | 'b' }[];
  readonly gate: Vec[];
  readonly startLives: number;
  readonly scale: number;
  readonly rng: () => number;

  status: Status = 'prep';
  gold: number;
  lives: number;
  /** Seconds since the first wave was called. */
  clock = 0;
  /** Waves started so far (1-based number of the current wave). */
  wave = 0;
  /** Seconds left before the next wave starts on its own. Null while a wave is still spawning. */
  nextIn: number | null = null;
  night = false;
  speed = 1;
  paused = false;

  foes: Foe[] = [];
  towers: Tower[] = [];
  shots: Shot[] = [];
  clouds: Cloud[] = [];
  vents: { x: number; y: number; road: RoadRt; d: number; every: number; t: number; dmg: number }[] = [];
  hero: HeroState;
  rune: { kind: RuneKind; x: number; y: number } | null = null;
  nextRune = RUNE_FIRST;
  resist: Record<Element, number> = { pierce: 0, fire: 0, frost: 0, storm: 0, nature: 0, hero: 0 };
  dmgWindow: Record<Element, number> = { pierce: 0, fire: 0, frost: 0, storm: 0, nature: 0, hero: 0 };
  events: BattleEvent[] = [];
  kills = 0;
  leaks = 0;

  private queue: Queued[] = [];
  private waveT = 0;
  private ids = 1;
  private shiftShift = 0;
  private leakedThisWave = false;
  private threatDirty = true;
  private threat = new Map<RoadRt, number>();
  private airThreat = new Map<RoadRt, number>();
  private shiftOn: boolean[] = [];

  constructor(stage: StageDef, opts: BattleOptions = {}) {
    this.stage = stage;
    this.mods = opts.mods ?? baseMods();
    this.rng = makeRng(opts.seed ?? 1234);
    this.scale = hpScale(stage.id) * (stage.hpMul ?? 1);
    this.roads = stage.roads.map(def => {
      const path = makePath(def.id, smooth(def.ctrl));
      const rt: RoadRt = { def, path, closed: false, closeAt: null, barrier: null, belts: [] };
      for (const s of stage.shifts ?? []) if (s.closes.includes(def.id)) rt.closeAt = nearestD(path, s.at);
      for (const b of stage.barriers ?? []) if (b.road === def.id) {
        const p = pointAt(path, path.tot * b.at);
        rt.barrier = { hp: b.hp * this.scale, max: b.hp * this.scale, d: path.tot * b.at, x: p.x, y: p.y };
      }
      for (const b of stage.belts ?? []) if (b.road === def.id) rt.belts.push({ from: path.tot * b.from, to: path.tot * b.to, mult: b.mult });
      return rt;
    });
    for (const v of stage.vents ?? []) {
      const road = this.roads.find(r => r.def.id === v.road)!;
      const d = road.path.tot * v.at, p = pointAt(road.path, d);
      this.vents.push({ x: p.x, y: p.y, road, d, every: v.every, t: v.every, dmg: v.dmg });
    }
    this.spawns = new Map([...spawnsOf(stage)].map(([k, rs]) => [k, rs.map(r => this.roads.find(x => x.def === r)!)]));
    const waters = stage.lava ? [] : stage.waters.map(w => ({ w, path: makePath('w', smooth(w.ctrl)) }));
    this.plots = stage.plots.map(p => ({
      x: p.at[0], y: p.at[1],
      high: !!stage.high && inPoly(p.at, stage.high),
      nearWater: waters.some(({ w, path }) => distToPath(path, p.at[0], p.at[1]) < w.w / 2 + 160),
      sunk: false, gear: p.gear,
    }));
    const ends = new Map<string, Vec>();
    for (const r of this.roads) { const e = r.path.pts[r.path.pts.length - 1]; ends.set(`${Math.round(e[0])},${Math.round(e[1])}`, e); }
    this.gate = [...ends.values()];
    this.startLives = stage.lives + this.mods.lives;
    this.lives = this.startLives;
    this.gold = stage.startGold + this.mods.gold;
    this.shiftOn = (stage.shifts ?? []).map(() => false);
    const lvl = 1 + this.mods.heroLevel;
    const [sx, sy] = this.heroStartPoint();
    this.hero = {
      x: sx, y: sy, tx: sx, ty: sy, anchorX: sx, anchorY: sy,
      hp: 0, level: lvl, xp: 0, points: lvl + this.mods.heroSkillPoints, ranks: { q: 0, w: 0, e: 0, r: 0 }, cd: { q: 0, w: 0, e: 0, r: 0 },
      atkCd: 0, dead: false, respawnT: 0, focus: null, items: [], revived: false, haste: 0, double: 0, regenT: 0, sunriseT: 0, face: 1, swing: 0, moving: false,
    };
    this.hero.hp = this.heroMaxHp();
    this.applyGears(1);
    for (const r of this.roads) { this.threat.set(r, 0); this.airThreat.set(r, 0); }
  }

  /**
   * Where Wren starts. A start placed by the gate moves out to the main road, past its middle,
   * so she meets the first foes and earns XP from the start.
   */
  private heroStartPoint(): Vec {
    const st = this.stage.heroStart;
    if (!this.gate.some(g => Math.hypot(g[0] - st[0], g[1] - st[1]) < 300)) return st;
    const r = [...this.roads].sort((a, z) => z.path.tot - a.path.tot)[0];
    const p = pointAt(r.path, r.path.tot * 0.62);
    return [p.x, p.y];
  }

  /* ------------------------------------------------------------------ commands */

  get totalWaves() { return this.stage.waves.length; }

  /** What the next wave will send, after the early-wave ramp. Null once every wave has started. */
  nextWave(): { n: number; hint: string; foes: { kind: EnemyKind; count: number }[] } | null {
    const n = this.wave + 1;
    const w = this.stage.waves[n - 1];
    if (!w) return null;
    const ramp = waveRamp(n, this.totalWaves);
    const foes: { kind: EnemyKind; count: number }[] = [];
    for (const g of w.groups) {
      const count = Math.max(1, Math.round(g.n * ramp));
      const had = foes.find(f => f.kind === g.kind);
      if (had) had.count += count; else foes.push({ kind: g.kind, count });
    }
    return { n, hint: w.hint, foes };
  }

  /** True if the Hollow adapts when wave `n` starts. */
  adaptsAt(n: number): boolean {
    if (this.stage.region === 0 && this.stage.adaptEvery === undefined) return false;
    const every = this.stage.adaptEvery ?? 3;
    return n > 1 && n <= this.totalWaves && (n - 1) % every === 0;
  }

  /** The element the Hollow would harden against if it adapted now, if any. */
  adaptLean(): Element | null {
    let total = 0, top: Element | null = null;
    for (const e of ELEMENTS) { total += this.dmgWindow[e]; if (!top || this.dmgWindow[e] > this.dmgWindow[top]) top = e; }
    return top && total > 0 && this.dmgWindow[top] / total > 0.42 ? top : null;
  }

  /** Start the next wave. Early calls pay gold and shave hero cooldowns for the time saved. */
  callWave(): boolean {
    if (this.status === 'won' || this.status === 'lost') return false;
    if (this.wave >= this.totalWaves) return false;
    if (this.status === 'running' && this.nextIn === null) return false;
    if (this.status === 'running' && this.nextIn !== null && this.nextIn > 0) {
      const bonus = Math.ceil(this.nextIn * 2 * (1 + this.mods.early));
      this.gold += bonus;
      const saved = this.nextIn * 0.35;
      for (const k of ['q', 'w', 'r'] as SkillKey[]) this.hero.cd[k] = Math.max(0, this.hero.cd[k] - saved);
      if (this.hero.dead) this.hero.respawnT = Math.max(0.1, this.hero.respawnT - saved);
      this.events.push({ t: 'early', gold: bonus });
    }
    this.status = 'running';
    this.startWave();
    return true;
  }

  costOf(kind: TowerKind, level = 1): number {
    const def = TOWERS[kind];
    return Math.round(def.cost[level - 1] * (1 + this.mods.costMul));
  }

  splitCost(kind: TowerKind, which: 'a' | 'b'): number {
    const s = TOWERS[kind].splits.find(x => x.id === which)!;
    return Math.round(s.cost * (1 + this.mods.costMul));
  }

  canBuild(plot: number, kind: TowerKind): boolean {
    const p = this.plots[plot];
    return !!p && !p.sunk && this.stage.towers.includes(kind) && !this.towers.some(t => t.plot === plot) && this.gold >= this.costOf(kind);
  }

  build(plot: number, kind: TowerKind): Tower | null {
    if (!this.canBuild(plot, kind)) return null;
    const p = this.plots[plot], cost = this.costOf(kind);
    this.gold -= cost;
    const t: Tower = { id: this.ids++, kind, plot, x: p.x, y: p.y, lv: 1, split: null, spent: cost, cd: 0.4, mode: 'first', round: null, aim: 0, high: p.high, down: false, fired: 9 };
    t.down = !!p.gear && !this.gearUp(p.gear);
    this.towers.push(t);
    this.threatDirty = true;
    this.events.push({ t: 'build', tower: t.id, x: t.x, y: t.y });
    return t;
  }

  upgradeCost(t: Tower): number | null {
    if (t.lv < 3) return this.costOf(t.kind, t.lv + 1);
    if (t.split !== null && t.lv < 6) return Math.round(160 * (t.lv - 3) * (1 + this.mods.costMul));
    return null;
  }

  upgrade(id: number): boolean {
    const t = this.tower(id);
    if (!t) return false;
    const c = this.upgradeCost(t);
    if (c === null || this.gold < c) return false;
    this.gold -= c; t.spent += c; t.lv++;
    this.threatDirty = true;
    this.events.push({ t: 'upgrade', tower: t.id, x: t.x, y: t.y });
    return true;
  }

  splitTower(id: number, which: 'a' | 'b'): boolean {
    const t = this.tower(id);
    if (!t || t.lv !== 3 || !this.mods.splits) return false;
    const c = this.splitCost(t.kind, which);
    if (this.gold < c) return false;
    this.gold -= c; t.spent += c; t.lv = 4; t.split = which;
    this.threatDirty = true;
    this.events.push({ t: 'upgrade', tower: t.id, x: t.x, y: t.y });
    return true;
  }

  sellValue(t: Tower): number { return Math.floor(t.spent * (0.7 + this.mods.sell)); }

  sell(id: number): boolean {
    const t = this.tower(id);
    if (!t) return false;
    this.gold += this.sellValue(t);
    this.towers = this.towers.filter(x => x !== t);
    this.threatDirty = true;
    this.events.push({ t: 'sell', tower: t.id, x: t.x, y: t.y });
    return true;
  }

  setMode(id: number, mode: TargetMode) { const t = this.tower(id); if (t) t.mode = mode; }

  setRound(id: number, round: Rounds | null) {
    const t = this.tower(id);
    if (t && (round === null || this.mods.rounds.includes(round)) && t.kind !== 'beacon' && t.kind !== 'bell') t.round = round;
  }

  tower(id: number) { return this.towers.find(t => t.id === id); }

  /** Send Wren to a point. She holds there and fights what comes. */
  moveHero(x: number, y: number) {
    const h = this.hero;
    if (h.dead) return;
    h.tx = clamp(x, 20, 1260); h.ty = clamp(y, 50, 705);
    h.anchorX = h.tx; h.anchorY = h.ty;
    h.focus = null;
  }

  /** Tell Wren to fight one foe. */
  attackFoe(id: number) {
    const f = this.foes.find(x => x.id === id);
    if (!f || this.hero.dead) return;
    this.hero.focus = id;
    this.hero.anchorX = f.x; this.hero.anchorY = f.y;
  }

  canLearn(key: SkillKey): boolean {
    const h = this.hero, s = SKILLS[key], r = h.ranks[key];
    if (h.points < 1 || r >= s.maxRank) return false;
    if (key === 'w' && !this.mods.skillW) return false;
    if (key === 'r' && !this.mods.skillR) return false;
    return h.level >= s.needLevel(r + 1);
  }

  learn(key: SkillKey): boolean {
    if (!this.canLearn(key)) return false;
    this.hero.points--; this.hero.ranks[key]++;
    return true;
  }

  /** Spend free points the way most players would: ultimate first, then Q, E and W in turn. */
  autoLearn() {
    const order: SkillKey[] = ['r', 'q', 'e', 'w', 'q', 'e', 'w'];
    let guard = 40;
    while (this.hero.points > 0 && guard-- > 0) {
      const k = order.find(x => this.canLearn(x)) ?? (['q', 'w', 'e', 'r'] as SkillKey[]).find(x => this.canLearn(x));
      if (!k) break;
      this.learn(k);
    }
  }

  skillReady(key: SkillKey): boolean {
    const h = this.hero;
    return !h.dead && h.ranks[key] > 0 && h.cd[key] <= 0 && key !== 'e';
  }

  castQ(): boolean {
    if (!this.skillReady('q')) return false;
    const h = this.hero, r = h.ranks.q;
    const dmg = SWEEP.dmg[r - 1] * (1 + this.mods.sweep) * this.heroDmgMul();
    for (const f of this.foes) if (this.reachable(f, true) && ell(f.x - h.x, f.y - h.y) < SWEEP.radius) this.damage(f, dmg, 'hero', true);
    h.cd.q = SKILLS.q.cd[r - 1];
    h.swing = 0.35;
    this.events.push({ t: 'skill', key: 'q', x: h.x, y: h.y });
    return true;
  }

  castW(x: number, y: number): boolean {
    if (!this.skillReady('w')) return false;
    const h = this.hero, r = h.ranks.w;
    const dx = x - h.x, dy = y - h.y, dist = Math.hypot(dx, dy);
    if (dist > SNARE.range) { x = h.x + dx / dist * SNARE.range; y = h.y + dy / dist * SNARE.range; }
    const hold = SNARE.hold[r - 1] + this.mods.snare;
    for (const f of this.foes) if (this.reachable(f, true) && !f.def.flying && ell(f.x - x, f.y - y) < SNARE.radius) {
      if (!f.def.traits?.boss) f.rootT = Math.max(f.rootT, hold);
      this.damage(f, SNARE.dmg[r - 1] * this.heroDmgMul(), 'hero', true);
    }
    h.cd.w = SKILLS.w.cd[r - 1];
    this.events.push({ t: 'skill', key: 'w', x, y });
    return true;
  }

  castR(): boolean {
    if (!this.skillReady('r')) return false;
    const h = this.hero, r = h.ranks.r;
    h.sunriseT = SUNRISE.dur[r - 1] + this.mods.sunrise;
    h.cd.r = SKILLS.r.cd[r - 1];
    this.events.push({ t: 'skill', key: 'r', x: h.x, y: h.y });
    return true;
  }

  /** Wren heals faster at the gate. */
  nearGate(): boolean {
    const h = this.hero;
    return !h.dead && this.gate.some(g => Math.hypot(g[0] - h.x, g[1] - h.y) < HERO.gateRadius);
  }

  /** Wren can trade at the gate any time, or anywhere via gate courier during prep and between waves. */
  canShop(): boolean {
    return !this.hero.dead && (this.nearGate() || this.status === 'prep' || this.nextIn !== null);
  }

  canBuy(id: ItemId): boolean {
    const it = ITEMS[id];
    return this.canShop() && this.hero.items.length < ITEM_SLOTS && this.gold >= it.cost && this.mods.shopAfter >= it.after && !this.hero.items.includes(id);
  }

  buy(id: ItemId): boolean {
    if (!this.canBuy(id)) return false;
    const before = this.heroMaxHp();
    this.gold -= ITEMS[id].cost;
    this.hero.items.push(id);
    this.hero.hp += this.heroMaxHp() - before;
    this.events.push({ t: 'buy', item: id });
    return true;
  }

  sellItem(id: ItemId): boolean {
    if (!this.canShop() || !this.hero.items.includes(id)) return false;
    this.hero.items = this.hero.items.filter(x => x !== id);
    this.gold += Math.floor(ITEMS[id].cost * SELL_ITEM);
    this.hero.hp = Math.min(this.hero.hp, this.heroMaxHp());
    this.events.push({ t: 'sellItem', item: id });
    return true;
  }

  /* ------------------------------------------------------------------ hero numbers */

  heroMaxHp(): number {
    const h = this.hero;
    return HERO.hp + HERO.hpPerLevel * (h.level - 1) + sumItems(h.items, 'hp');
  }
  heroDmg(): number {
    const h = this.hero;
    return (HERO.dmg + HERO.dmgPerLevel * (h.level - 1) + sumItems(h.items, 'dmg')) * this.heroDmgMul();
  }
  heroDmgMul(): number { return this.hero.double > 0 ? 2 : 1; }
  heroSpeed(): number { return HERO.speed * (1 + sumItems(this.hero.items, 'speed')) * (this.hero.haste > 0 ? 2 : 1); }
  heroSight(): number { return HERO.sight + sumItems(this.hero.items, 'sight'); }
  xpNeeded(): number { return xpToNext(this.hero.level); }

  /* ------------------------------------------------------------------ tower numbers */

  /** Final numbers for a tower right now, after levels, splits, trees, beacons, night and Wren. */
  stats(t: Tower) {
    const def = TOWERS[t.kind], i = Math.min(t.lv, 3) - 1;
    const waterBonus = this.mods.tidePearl && (this.plots[t.plot]?.nearWater ?? false) ? 0.15 : 0;
    let dmg = def.dmg[i] * (1 + this.mods.towerDmg[t.kind] + this.mods.dmgAll);
    let range = def.range[i] * (1 + this.mods.towerRange[t.kind] + this.mods.rangeAll + waterBonus) * (t.high ? 1.2 : 1);
    let rate = def.rate[i];
    let crit = 0, jumps = 2 + this.mods.jumps, splash = 60 * (1 + this.mods.blast), shells = 1;
    if (t.split) {
      const s = `${t.kind}:${t.split}`;
      if (s === 'watch:a') { range *= 1.3; crit = 0.25; dmg *= 1.2; }
      if (s === 'watch:b') { rate *= 0.42; dmg *= 0.75; }
      if (s === 'cannon:a') { range *= 1.5; dmg *= 1.5; splash *= 1.3; }
      if (s === 'cannon:b') { shells = 3; dmg *= 0.65; }
      if (s === 'bell:a' || s === 'bell:b') { dmg *= 1.3; range *= 1.1; }
      if (s === 'pylon:a') { jumps += 3; dmg *= 1.1; }
      if (s === 'pylon:b') { jumps = 0; dmg *= 5; rate *= 1.3; }
      if (s === 'roots:a' || s === 'roots:b') { dmg *= 1.3; }
      if (t.kind === 'beacon') range *= 1.1;
      if (t.lv >= 4 && t.kind !== 'beacon') {
        const temper = t.lv === 5 ? 1.18 : t.lv >= 6 ? 1.3924 : 1;
        dmg *= 1.25 * temper;
      }
      if (t.lv > 4 && (t.kind === 'beacon' || t.kind === 'bell')) {
        range *= t.lv === 5 ? 1.06 : 1.1236;
      }
    }
    // Beacons: more damage, and for the splits more speed or more range.
    let rateMul = 1 + this.mods.rateAll;
    if (t.kind !== 'beacon') {
      let buff = 0, drum = 0, fire = 0;
      for (const b of this.towers) {
        if (b.kind !== 'beacon' || b.down) continue;
        const bw = this.mods.tidePearl && (this.plots[b.plot]?.nearWater ?? false) ? 0.15 : 0;
        const br = b.lv === 5 ? 1.06 : b.lv >= 6 ? 1.1236 : 1;
        const bs = TOWERS.beacon.range[Math.min(b.lv, 3) - 1] * (b.split ? 1.1 : 1) * br * (1 + this.mods.rangeAll + bw) * (b.high ? 1.2 : 1);
        if (ell(b.x - t.x, b.y - t.y) > bs) continue;
        buff = Math.max(buff, BEACON_BUFF[Math.min(b.lv, 3) - 1] + (b.lv >= 4 ? 0.05 + (b.lv - 4) * 0.04 : 0));
        if (b.split === 'a') drum = 0.2;
        if (b.split === 'b') fire = 0.25;
      }
      dmg *= 1 + buff; rateMul += drum; range *= 1 + fire;
      if (this.night && buff === 0 && !this.inLighthouse(t.x, t.y)) range *= 0.85;
    }
    const h = this.hero;
    if (!h.dead && ell(h.x - t.x, h.y - t.y) < ATTUNE.radius) {
      if (h.ranks.e > 0) rateMul += ATTUNE.rate[h.ranks.e - 1] + this.mods.attune;
      const aura = sumItems(h.items, 'auraDmg');
      if (aura > 0) dmg *= 1 + aura;
      if (h.double > 0) dmg *= 2;
    }
    if (h.sunriseT > 0) rateMul *= 2;
    if (this.stage.weather === 'rain' && def.element === 'fire') dmg *= 0.8;
    return { dmg, range, rate: rate / rateMul, crit, jumps, splash, shells, hitsFlying: def.hitsFlying };
  }

  /* ------------------------------------------------------------------ the loop */

  /** Advance the battle. Large steps are split so fast-forward stays stable. */
  step(dt: number) {
    if (this.paused || this.status === 'won' || this.status === 'lost') return;
    let left = dt * this.speed;
    while (left > 1e-6) {
      const s = Math.min(left, 1 / 30);
      this.tick(s);
      left -= s;
      if (this.over) break;
    }
  }

  get over(): boolean { return this.status === 'won' || this.status === 'lost'; }

  private tick(dt: number) {
    const running = this.status === 'running';
    if (running) this.clock += dt;
    this.updateShifts();
    if (running) this.updateWave(dt);
    if (running) this.updateRunes(dt);
    this.updateVents(dt);
    this.updateFoes(dt);
    this.updateHero(dt);
    this.updateTowers(dt);
    this.updateShots(dt);
    this.updateClouds(dt);
    this.foes = this.foes.filter(f => !f.dead);
    if (running && this.wave >= this.totalWaves && this.queue.length === 0 && this.foes.length === 0) this.finish(true);
    if (this.lives <= 0) this.finish(false);
  }

  private finish(won: boolean) {
    if (won) {
      this.status = 'won';
      const share = this.lives / this.startLives;
      this.events.push({ t: 'won', stars: share >= 0.9 ? 3 : share >= 0.5 ? 2 : 1 });
    } else {
      this.status = 'lost';
      this.lives = 0;
      this.events.push({ t: 'lost' });
    }
  }

  get stars(): number {
    if (this.status !== 'won') return 0;
    const share = this.lives / this.startLives;
    return share >= 0.9 ? 3 : share >= 0.5 ? 2 : 1;
  }

  /* waves */

  private startWave() {
    const n = ++this.wave, w = this.stage.waves[n - 1];
    this.waveT = 0;
    this.leakedThisWave = false;
    // Early waves of a stage send a share of each group; the last wave sends all of it.
    const ramp = waveRamp(n, this.totalWaves);
    for (const g of w.groups) {
      const count = Math.max(1, Math.round(g.n * ramp));
      for (let i = 0; i < count; i++) this.queue.push({ at: g.delay + i * g.gap / ramp, kind: g.kind, spawn: g.spawn });
    }
    this.queue.sort((a, b) => a.at - b.at);
    this.nextIn = null;
    this.events.push({ t: 'wave', n, hint: w.hint });
    if (n > 1) this.gold += 15 + n * 3;
    // Interest on banked gold.
    if (n > 1 && this.mods.interest > 0) {
      const g = Math.min(40, Math.floor(this.gold * this.mods.interest));
      if (g > 0) { this.gold += g; this.events.push({ t: 'interest', gold: g }); }
    }
    // The Hollow adapts to the element that hurt it most.
    if (this.adaptsAt(n)) this.adapt();
    this.applyGears(n);
    this.plots.forEach((p, i) => {
      if (this.stage.plots[i].sinkAt === n && !p.sunk) {
        p.sunk = true;
        const t = this.towers.find(x => x.plot === i);
        if (t) { this.gold += t.spent; this.towers = this.towers.filter(x => x !== t); this.threatDirty = true; }
        this.events.push({ t: 'sink', plot: i });
      }
    });
    if (this.stage.night) {
      const on = n % 2 === 0;
      if (on !== this.night) { this.night = on; this.events.push({ t: 'night', on }); this.threatDirty = true; }
    }
  }

  private adapt() {
    let total = 0, top: Element | null = null;
    for (const e of ELEMENTS) { total += this.dmgWindow[e]; if (!top || this.dmgWindow[e] > this.dmgWindow[top]) top = e; }
    if (top && total > 0 && this.dmgWindow[top] / total > 0.42) {
      for (const e of ELEMENTS) this.resist[e] = e === top ? Math.min(0.6, this.resist[e] + 0.2) : Math.max(0, this.resist[e] - 0.1);
      this.events.push({ t: 'adapt', el: top, resist: this.resist[top] });
    }
    for (const e of ELEMENTS) this.dmgWindow[e] = 0;
  }

  private gearUp(g: 'a' | 'b') { return (Math.max(1, this.wave) % 2 === 1) === (g === 'a'); }

  private applyGears(n: number) {
    if (!this.stage.plots.some(p => p.gear)) return;
    for (const t of this.towers) { const g = this.plots[t.plot].gear; t.down = !!g && !this.gearUp(g); }
    if (n > 0) this.events.push({ t: 'gear', up: n % 2 === 1 ? 'a' : 'b' });
    this.threatDirty = true;
  }

  private updateWave(dt: number) {
    this.waveT += dt;
    while (this.queue.length && this.queue[0].at <= this.waveT) {
      const q = this.queue.shift()!;
      this.spawn(q.kind, q.spawn);
    }
    if (this.queue.length === 0 && this.nextIn === null && this.wave < this.totalWaves) this.nextIn = WAVE_GAP;
    if (this.nextIn !== null) {
      // When the field is clear, the next wave comes sooner.
      if (this.foes.length === 0) this.nextIn = Math.min(this.nextIn, 8);
      this.nextIn -= dt;
      if (this.nextIn <= 0) { this.nextIn = 0; this.startWave(); }
    }
  }

  /** Spawn a foe at a rift. On a fork it takes the road with the least threat. */
  spawn(kind: EnemyKind, spawnId?: string, at?: { road: RoadRt; d: number }): Foe {
    const def = ENEMIES[kind];
    let road: RoadRt, d = 0;
    if (at) { road = at.road; d = at.d; } else {
      const id = spawnId ?? [...this.spawns.keys()][Math.floor(this.rng() * this.spawns.size)];
      road = this.pickRoad(this.spawns.get(id) ?? [...this.spawns.values()][0], def);
    }
    const isBoss = !!def.traits?.boss;
    const hp = def.hp * this.scale;
    const p = pointAt(road.path, d);
    const f: Foe = {
      id: this.ids++, kind, def, road, d, x: p.x, y: p.y, dir: p.dir, off: isBoss ? 0 : (this.rng() - 0.5) * road.def.w * 0.5,
      hp, max: hp, speed: def.speed * (0.94 + this.rng() * 0.12), slow: 0, slowT: 0, rootT: 0, freezeT: 0, freezeImmune: 0,
      burnT: 0, burnDps: 0, vulnT: 0, blocked: false, hidden: false, shielded: false, under: false,
      underT: def.traits?.burrow ? def.traits.burrow[1] : def.traits?.dive?.every ?? 0,
      abilityT: def.traits?.summon?.every ?? 2, phase: 0, burstT: 0, hitT: 0, dead: false,
    };
    this.foes.push(f);
    if (isBoss) this.events.push({ t: 'boss', kind });
    return f;
  }

  private pickRoad(options: RoadRt[], def: EnemyDef): RoadRt {
    if (options.length === 1) return options[0];
    const sapper = !!def.traits?.sapper;
    let open = options.filter(r => !r.closed && (sapper || !r.barrier || r.barrier.hp <= 0));
    if (sapper) { const walled = open.filter(r => r.barrier && r.barrier.hp > 0); if (walled.length) return walled[0]; }
    if (open.length === 0) open = options.filter(r => !r.barrier || r.barrier.hp <= 0);
    if (open.length === 0) open = options;
    if (open.length === 1) return open[0];
    if (this.threatDirty) this.computeThreat();
    const map = def.flying ? this.airThreat : this.threat;
    const w = open.map(r => { const k = 20 + (map.get(r) ?? 0) / 40; return 1 / (k * k); });
    let x = this.rng() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < open.length; i++) { x -= w[i]; if (x <= 0) return open[i]; }
    return open[open.length - 1];
  }

  /** How much tower fire covers each road: damage per second times the length it covers. */
  private computeThreat() {
    this.threatDirty = false;
    for (const r of this.roads) {
      let ground = 0, air = 0;
      for (const t of this.towers) {
        if (t.kind === 'beacon' || t.down) continue;
        const s = this.stats(t);
        let cover = 0;
        for (let d = 0; d < r.path.tot; d += 24) { const p = pointAt(r.path, d); if (ell(p.x - t.x, p.y - t.y) < s.range) cover++; }
        if (cover === 0) continue;
        const dps = t.kind === 'bell' ? 18 : (s.dmg * s.shells / s.rate) * (t.kind === 'pylon' ? 1 + 0.35 * s.jumps : 1);
        const val = cover * dps;
        ground += val;
        if (s.hitsFlying) air += val;
      }
      this.threat.set(r, ground);
      this.airThreat.set(r, air);
    }
  }

  /** Threat per road id, for the HUD and for tests. */
  roadThreat(): Record<string, number> {
    if (this.threatDirty) this.computeThreat();
    return Object.fromEntries(this.roads.map(r => [r.def.id, this.threat.get(r) ?? 0]));
  }

  private updateShifts() {
    const shifts = this.stage.shifts ?? [];
    const closed = new Set<string>();
    shifts.forEach((s, i) => {
      const t = this.clock + this.shiftShift;
      const on = this.status === 'running' && ((t - s.start) % s.every + s.every) % s.every < s.dur;
      if (on !== this.shiftOn[i]) { this.shiftOn[i] = on; this.events.push({ t: 'shift', label: on ? s.label : 'The way is open again', on }); }
      if (on) s.closes.forEach(c => closed.add(c));
    });
    for (const r of this.roads) r.closed = closed.has(r.def.id);
  }

  /** True while a shift is active, for the renderer. */
  shiftActive(i: number) { return !!this.shiftOn[i]; }

  private updateRunes(dt: number) {
    this.nextRune -= dt;
    if (this.nextRune <= 0) {
      this.nextRune = RUNE_EVERY;
      const kind = RUNE_ORDER[Math.floor(this.rng() * RUNE_ORDER.length)];
      this.rune = { kind, x: this.stage.rune[0], y: this.stage.rune[1] };
      this.events.push({ t: 'rune', kind, picked: false });
    }
    const h = this.hero, r = this.rune;
    if (r && !h.dead && Math.hypot(r.x - h.x, r.y - h.y) < 40) {
      this.rune = null;
      if (r.kind === 'haste') h.haste = RUNES.haste.dur;
      if (r.kind === 'double') h.double = RUNES.double.dur;
      if (r.kind === 'regen') h.regenT = RUNES.regen.dur;
      if (r.kind === 'bounty') { const g = 30 + this.wave * 6; this.gold += g; this.giveXp(40 + this.wave * 20); }
      this.events.push({ t: 'rune', kind: r.kind, picked: true });
    }
  }

  private updateVents(dt: number) {
    const h = this.hero;
    for (const v of this.vents) {
      const boosted = !h.dead && Math.hypot(h.x - v.x, h.y - v.y) < 44;
      v.t -= dt * (boosted ? 2 : 1);
      if (v.t > 0) continue;
      v.t = v.every;
      this.events.push({ t: 'vent', x: v.x, y: v.y });
      for (const f of this.foes) if (!f.def.flying && !f.under && ell(f.x - v.x, f.y - v.y) < 56) this.damage(f, v.dmg * this.scale, 'env', false);
    }
  }

  /* foes */

  private inLighthouse(x: number, y: number) {
    const L = this.stage.lighthouse;
    return !!L && ell(L[0] - x, L[1] - y) < LIGHTHOUSE_RANGE;
  }

  private updateFoes(dt: number) {
    const h = this.hero;
    const wardens = this.foes.filter(f => f.def.traits?.shield && !f.dead);
    const beacons = this.towers.filter(t => t.kind === 'beacon' && !t.down);
    let blocking = 0;
    const sight = this.heroSight();
    for (const f of this.foes) {
      if (f.dead) continue;
      const tr = f.def.traits;
      f.slowT = Math.max(0, f.slowT - dt); if (f.slowT === 0) f.slow = 0;
      f.rootT = Math.max(0, f.rootT - dt);
      f.freezeT = Math.max(0, f.freezeT - dt);
      f.freezeImmune = Math.max(0, f.freezeImmune - dt);
      f.vulnT = Math.max(0, f.vulnT - dt);
      f.burstT = Math.max(0, f.burstT - dt);
      f.hitT = Math.max(0, f.hitT - dt);
      if (f.burnT > 0) { f.burnT -= dt; this.damage(f, f.burnDps * dt, 'fire', false, true); if (f.dead) continue; }

      // Burrow and dive.
      if (tr?.burrow) {
        f.underT -= dt;
        if (f.underT <= 0) { f.under = !f.under; f.underT = f.under ? tr.burrow[0] : tr.burrow[1]; }
      }
      if (tr?.dive) {
        f.underT -= dt;
        if (f.underT <= 0) {
          f.under = !f.under; f.underT = f.under ? tr.dive.dur : tr.dive.every;
          this.events.push({ t: 'dive', x: f.x, y: f.y, under: f.under });
        }
        if (f.under) f.hp = Math.min(f.max, f.hp + f.max * 0.01 * dt);
      }
      // Summons.
      if (tr?.summon) {
        f.abilityT -= dt;
        if (f.abilityT <= 0) {
          f.abilityT = tr.summon.every;
          for (let i = 0; i < tr.summon.n; i++) this.spawn(tr.summon.kind, undefined, { road: f.road, d: Math.max(0, f.d - 20 - i * 18) });
        }
      }
      // Healing.
      if (tr?.heal) {
        f.abilityT -= dt;
        if (f.abilityT <= 0) {
          f.abilityT = 2;
          for (const o of this.foes) if (!o.dead && ell(o.x - f.x, o.y - f.y) < 100) o.hp = Math.min(o.max, o.hp + o.max * tr.heal);
        }
      }
      // Queen phases.
      if (tr?.phases && f.phase < tr.phases.length && f.hp / f.max < tr.phases[f.phase]) {
        f.phase++;
        f.burstT = 4;
        this.shiftShift += 20;
        for (let i = 0; i < 6; i++) this.spawn('shade', undefined, { road: f.road, d: Math.max(0, f.d - 30 - i * 16) });
        this.events.push({ t: 'phase', n: f.phase, x: f.x, y: f.y });
      }

      f.shielded = !tr?.shield && wardens.some(w => ell(w.x - f.x, w.y - f.y) < (w.def.traits!.shield ?? 0));
      f.hidden = !!tr?.stealth && !(
        (!h.dead && Math.hypot(h.x - f.x, h.y - f.y) < sight) ||
        h.sunriseT > 0 ||
        this.inLighthouse(f.x, f.y) ||
        this.towers.some(t => ell(t.x - f.x, t.y - f.y) < TOWER_SIGHT) ||
        beacons.some(b => ell(b.x - f.x, b.y - f.y) < TOWERS.beacon.range[Math.min(b.lv, 3) - 1])
      );

      // Wren holds ground foes that walk into her.
      f.blocked = false;
      if (!h.dead && !h.moving && !f.def.flying && !f.under && blocking < HERO.blocks && Math.hypot(h.x - f.x, h.y - f.y) < 30 + f.def.size * 10) {
        f.blocked = true; blocking++;
        const armor = Math.min(0.6, sumItems(h.items, 'armor'));
        h.hp -= f.def.dps * this.scale * 0.6 * (1 - armor) * dt;
      }

      // Movement.
      let mul = f.slow > 0 ? 1 - f.slow : 1;
      if (f.rootT > 0 || f.freezeT > 0 || f.blocked) mul = 0;
      if (f.burstT > 0) mul *= 1.6;
      for (const b of f.road.belts) if (f.d >= b.from && f.d <= b.to) mul *= b.mult;
      if (f.under && tr?.burrow) mul *= 1.4;
      let nd = f.d + f.speed * mul * dt;
      // A closed ford or lava pass holds foes on this side until it opens.
      if (f.road.closed && f.road.closeAt !== null && f.d < f.road.closeAt - 30 && !f.def.flying) nd = Math.min(nd, f.road.closeAt - 40);
      const bar = f.road.barrier;
      if (bar && bar.hp > 0 && !f.def.flying && f.d < bar.d) {
        nd = Math.min(nd, bar.d - 26);
        if (tr?.sapper && nd >= bar.d - 30) {
          bar.hp -= 40 * dt;
          if (bar.hp <= 0) { bar.hp = 0; this.threatDirty = true; this.events.push({ t: 'barrier', road: f.road.def.id, broken: true }); }
        }
      }
      f.d = nd;
      const p = pointAt(f.road.path, f.d);
      const nx = p.x + f.off * 0.3, ny = p.y + f.off * 0.3;
      if (Math.abs(nx - f.x) > 0.01) f.dir = Math.sign(nx - f.x);
      f.x = nx; f.y = ny;
      if (f.d >= f.road.path.tot - 2) this.leak(f);
    }
  }

  private leak(f: Foe) {
    f.dead = true;
    if (this.mods.ironGate && !this.leakedThisWave && !f.def.traits?.boss) { this.leakedThisWave = true; return; }
    this.leakedThisWave = true;
    this.lives = Math.max(0, this.lives - f.def.leak);
    this.leaks += f.def.leak;
    this.events.push({ t: 'leak', x: f.x, y: f.y, lives: f.def.leak, kind: f.kind, hpLeft: f.hp / f.max });
  }

  /** Can this foe be hit right now? */
  reachable(f: Foe, byHero = false): boolean {
    if (f.dead || f.under) return false;
    if (f.hidden && !byHero) return false;
    return true;
  }

  /** Deal damage after every rule: weakness, adaptation, shields, armor, plates. Returns damage done. */
  damage(f: Foe, amount: number, el: DmgEl, byHero: boolean, quiet = false, crit = false): number {
    if (!this.reachable(f, true) || amount <= 0) return 0;
    let m = el === 'env' ? 1 : (f.def.takes?.[el] ?? 1);
    if (el !== 'env' && el !== 'hero') m *= 1 - this.resist[el];
    if (f.shielded) m *= 0.6;
    if (f.vulnT > 0) m *= 1.25;
    const chilled = f.slowT > 0 || f.freezeT > 0;
    if (el === 'fire' && chilled && this.mods.shatter) m *= 1.5;
    if (f.def.traits?.plated && !chilled) m *= f.def.traits.plated;
    let dmg = amount * m;
    const armor = f.def.traits?.armor;
    if (armor && !quiet) dmg = Math.max(dmg * 0.15, dmg - armor * armorScale(this.stage.id) * (1 - this.mods.armorPierce));
    if (dmg <= 0) return 0;
    f.hp -= dmg;
    f.hitT = 0.12;
    if (el !== 'env' && el !== 'hero') this.dmgWindow[el] += dmg;
    if (!quiet) this.events.push({ t: 'hit', x: f.x, y: f.y - f.def.bar * 0.6, dmg, crit, el });
    if (f.hp <= 0) this.kill(f, byHero);
    return dmg;
  }

  private kill(f: Foe, byHero: boolean) {
    if (f.dead) return;
    f.dead = true;
    this.kills++;
    const gold = Math.round(f.def.gold * goldScale(this.stage.id) * (byHero ? 1 + HERO.lastHit + this.mods.lastHit : 1));
    this.gold += gold;
    this.events.push({ t: 'kill', x: f.x, y: f.y, kind: f.kind, gold, hero: byHero });
    const h = this.hero;
    // Full XP for kills near Wren, a share for kills anywhere else, so she grows wherever the fight is.
    if (!h.dead) this.giveXp(f.def.hp * 0.45 * this.scale * (Math.hypot(h.x - f.x, h.y - f.y) < HERO.xpRadius ? 1 : HERO.xpFar));
    const sp = f.def.traits?.splitInto;
    if (sp) for (let i = 0; i < sp.n; i++) {
      const c = this.spawn(sp.kind, undefined, { road: f.road, d: Math.max(0, f.d - i * 14) });
      c.off = (i - 1) * 12;
    }
    if (h.focus === f.id) h.focus = null;
  }

  private giveXp(xp: number) {
    const h = this.hero;
    h.xp += xp;
    while (h.level < HERO.maxLevel && h.xp >= xpToNext(h.level)) {
      h.xp -= xpToNext(h.level);
      const before = this.heroMaxHp();
      h.level++; h.points++;
      h.hp += this.heroMaxHp() - before;
      this.events.push({ t: 'level', level: h.level });
    }
    if (h.level >= HERO.maxLevel) h.xp = 0;
  }

  /* hero */

  private updateHero(dt: number) {
    const h = this.hero;
    for (const k of ['q', 'w', 'r'] as SkillKey[]) h.cd[k] = Math.max(0, h.cd[k] - dt);
    h.haste = Math.max(0, h.haste - dt); h.double = Math.max(0, h.double - dt); h.regenT = Math.max(0, h.regenT - dt);
    h.sunriseT = Math.max(0, h.sunriseT - dt); h.swing = Math.max(0, h.swing - dt);
    if (h.dead) {
      h.respawnT -= dt;
      if (h.respawnT <= 0) {
        h.dead = false; h.hp = this.heroMaxHp();
        const g = this.gate[0];
        h.x = h.tx = h.anchorX = g[0] - 60; h.y = h.ty = h.anchorY = g[1] - 20;
        this.events.push({ t: 'heroUp' });
      }
      return;
    }
    const max = this.heroMaxHp();
    let regen = HERO.regen + sumItems(h.items, 'regen');
    if (this.nearGate()) regen += HERO.gateRegen;
    if (h.regenT > 0) regen += max * 0.12;
    h.hp = Math.min(max, h.hp + regen * dt);
    if (h.hp <= 0) {
      if (h.items.includes('seconddawn') && !h.revived) {
        h.revived = true; h.items = h.items.filter(i => i !== 'seconddawn'); h.hp = max;
        this.events.push({ t: 'revive' });
      } else {
        h.dead = true; h.hp = 0; h.respawnT = HERO.respawn(h.level); h.focus = null; h.moving = false;
        this.events.push({ t: 'heroDown' });
        return;
      }
    }

    // Pick a fight: her focus, then a foe she holds, then the nearest within reach of her post.
    let target: Foe | undefined;
    if (h.focus !== null) target = this.foes.find(f => f.id === h.focus && this.reachable(f, true));
    if (!target) {
      h.focus = null;
      let best = Infinity;
      for (const f of this.foes) {
        if (!this.reachable(f, true)) continue;
        const dPost = Math.hypot(f.x - h.anchorX, f.y - h.anchorY);
        if (dPost > HERO.aggro) continue;
        const score = Math.hypot(f.x - h.x, f.y - h.y) - (f.blocked ? 200 : 0);
        if (score < best) { best = score; target = f; }
      }
    }
    // Walk: to her post, or a little way out to meet a foe.
    let gx = h.tx, gy = h.ty;
    if (target) {
      const dist = Math.hypot(target.x - h.x, target.y - h.y);
      const reach = HERO.reach + target.def.size * 6;
      if (dist > reach) { gx = target.x; gy = target.y + 4; } else { gx = h.x; gy = h.y; }
    }
    const dx = gx - h.x, dy = gy - h.y, dist = Math.hypot(dx, dy), stepLen = this.heroSpeed() * dt;
    h.moving = dist > 3;
    if (dist > 0.5) {
      const k = Math.min(1, stepLen / dist);
      h.x += dx * k; h.y += dy * k;
      if (Math.abs(dx) > 1) h.face = Math.sign(dx);
    }
    if (!target) { h.atkCd = Math.max(0, h.atkCd - dt); return; }
    h.atkCd -= dt;
    const reach = HERO.reach + target.def.size * 6;
    if (Math.hypot(target.x - h.x, target.y - h.y) <= reach && h.atkCd <= 0) {
      h.atkCd = HERO.atkRate / (1 + sumItems(h.items, 'atkSpeed'));
      h.swing = 0.25;
      h.face = Math.sign(target.x - h.x) || h.face;
      const dmg = this.heroDmg();
      this.damage(target, dmg, 'hero', true);
      if (sumItems(h.items, 'sunder') > 0 && !target.dead) {
        target.burnT = Math.max(target.burnT, 2.5);
        target.burnDps = Math.max(target.burnDps, dmg * 0.2);
        target.vulnT = Math.max(target.vulnT, 2.5);
      }
      const cleave = sumItems(h.items, 'cleave');
      if (cleave > 0) for (const o of this.foes) if (o !== target && this.reachable(o, true) && ell(o.x - target.x, o.y - target.y) < 70) this.damage(o, dmg * cleave, 'hero', true, true);
      this.events.push({ t: 'heroHit', x: target.x, y: target.y - 18 });
    }
  }

  /* towers */

  private targetable(t: Tower, f: Foe, range: number, flying: boolean) {
    if (!this.reachable(f) || (f.def.flying && !flying)) return false;
    return ell(f.x - t.x, f.y - t.y) < range;
  }

  private pick(t: Tower, range: number, flying: boolean): Foe | undefined {
    let best: Foe | undefined, score = -Infinity;
    for (const f of this.foes) {
      if (!this.targetable(t, f, range, flying)) continue;
      const s = t.mode === 'first' ? f.d / f.road.path.tot + (f.def.traits?.boss ? 0.01 : 0)
        : t.mode === 'strong' ? f.hp
        : t.mode === 'armored' ? (f.def.traits?.armor ?? 0) * 1000 + (f.def.traits?.plated ? 500 : 0) + f.hp * 0.001
        : -ell(f.x - t.x, f.y - t.y);
      if (s > score) { score = s; best = f; }
    }
    return best;
  }

  private updateTowers(dt: number) {
    for (const t of this.towers) {
      t.fired += dt;
      if (t.kind === 'beacon' || t.down) continue;
      const s = this.stats(t);
      t.cd -= dt;
      const target = this.pick(t, s.range, s.hitsFlying);
      if (target && t.kind === 'cannon') {
        const want = Math.atan2(target.y - t.y, target.x - t.x);
        let da = want - t.aim;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        t.aim += da * Math.min(1, dt * 7);
      } else if (target) t.aim = Math.atan2(target.y - t.y, target.x - t.x);
      if (t.cd > 0 || !target) continue;
      t.cd = s.rate;
      t.fired = 0;
      this.attack(t, target, s);
    }
  }

  private attack(t: Tower, target: Foe, s: ReturnType<Battle['stats']>) {
    const el = TOWERS[t.kind].element;
    switch (t.kind) {
      case 'watch': {
        const crit = s.crit > 0 && this.rng() < s.crit;
        const dist = Math.hypot(target.x - t.x, target.y - t.y);
        this.shots.push({ id: this.ids++, kind: 'bolt', tower: t.id, x0: t.x, y0: t.y - 110 * (t.split ? 1.08 : 1), tx: target.x, ty: target.y, foe: target.id, t: 0, dur: Math.max(0.12, dist / 950), dmg: s.dmg * (crit ? 3 : 1), el, splash: 0, round: t.round, crit });
        this.events.push({ t: 'shot', tower: t.id, kind: 'bolt' });
        break;
      }
      case 'cannon': {
        const dur = t.split === 'a' ? 0.65 : 0.68;
        let belt = 1;
        for (const b of target.road.belts) if (target.d >= b.from && target.d <= b.to) belt *= b.mult;
        const lead = target.rootT > 0 || target.freezeT > 0 || target.blocked ? 0 : target.speed * (1 - target.slow) * belt * dur;
        for (let i = 0; i < s.shells; i++) {
          const off = s.shells > 1 ? (i - 1) * 54 : 0;
          const p = pointAt(target.road.path, target.d + lead + off);
          this.shots.push({ id: this.ids++, kind: 'shell', tower: t.id, x0: t.x, y0: t.y - 44, tx: p.x, ty: p.y, foe: target.id, t: -i * 0.08, dur, dmg: s.dmg, el, splash: s.splash, round: t.round, crit: false });
        }
        this.events.push({ t: 'shot', tower: t.id, kind: 'shell' });
        break;
      }
      case 'bell': {
        const slow = Math.min(0.75, 0.4 + this.mods.slow);
        for (const f of this.foes) {
          if (!this.targetable(t, f, s.range, true)) continue;
          f.slow = Math.max(f.slow, f.def.traits?.boss ? slow * 0.5 : slow);
          f.slowT = Math.max(f.slowT, 1.6);
          if (t.split === 'a' && f.freezeImmune <= 0 && !f.def.traits?.boss) { f.freezeT = 0.9; f.freezeImmune = 2.6; }
          if (t.split === 'b') f.vulnT = 2;
          this.damage(f, s.dmg, el, false, true);
        }
        this.events.push({ t: 'pulse', tower: t.id, x: t.x, y: t.y, r: s.range });
        break;
      }
      case 'pylon': {
        const pts: Vec[] = [[t.x, t.y - 100]];
        const hit = new Set<number>();
        const held = target.rootT > 0 || target.freezeT > 0;
        let cur: Foe | undefined = target;
        let dmg = t.split === 'b' && held ? s.dmg * 1.35 : s.dmg;
        let jumps = t.split === 'b' ? 0 : s.jumps + (this.mods.overload && held ? 2 : 0);
        const reach = this.stage.weather === 'rain' ? 220 : 120;
        while (cur) {
          hit.add(cur.id);
          pts.push([cur.x, cur.y - 14]);
          this.damage(cur, dmg, el, false);
          if (cur === target) this.applyRound(t.round, cur, dmg);
          if (jumps-- <= 0) break;
          dmg *= 0.75;
          let next: Foe | undefined, bd = reach;
          for (const f of this.foes) {
            if (hit.has(f.id) || !this.reachable(f)) continue;
            const d = Math.hypot(f.x - cur.x, f.y - cur.y);
            if (d < bd) { bd = d; next = f; }
          }
          cur = next;
        }
        this.events.push({ t: 'arc', pts });
        break;
      }
      case 'roots': {
        const hold = 1.2 + this.mods.hold;
        const caught = t.split === 'a'
          ? this.foes.filter(f => this.reachable(f) && !f.def.flying && Math.hypot(f.x - target.x, f.y - target.y) < 70)
          : [target];
        for (const f of caught) {
          if (!f.def.traits?.boss) f.rootT = Math.max(f.rootT, hold);
          this.damage(f, s.dmg, el, false);
          this.applyRound(t.round, f, s.dmg);
        }
        if (t.split === 'b') this.clouds.push({ x: target.x, y: target.y, r: 64, dps: s.dmg * 0.9, t: 3 });
        this.events.push({ t: 'root', x: target.x, y: target.y });
        break;
      }
    }
  }

  private applyRound(round: Rounds | null, f: Foe, dmg: number) {
    if (!round || f.dead) return;
    if (round === 'ember') { f.burnT = 2; f.burnDps = Math.max(f.burnDps, dmg * 0.25); }
    if (round === 'frost') { f.slow = Math.max(f.slow, 0.2); f.slowT = Math.max(f.slowT, 1); }
    if (round === 'storm' && this.rng() < 0.18) {
      let next: Foe | undefined, bd = 100;
      for (const o of this.foes) { if (o === f || !this.reachable(o)) continue; const d = Math.hypot(o.x - f.x, o.y - f.y); if (d < bd) { bd = d; next = o; } }
      if (next) { this.damage(next, dmg * 0.5, 'storm', false); this.events.push({ t: 'arc', pts: [[f.x, f.y - 14], [next.x, next.y - 14]] }); }
    }
  }

  private updateShots(dt: number) {
    for (const s of this.shots) {
      s.t += dt;
      if (s.t < 0) continue;
      let f = this.foes.find(x => x.id === s.foe);
      if (s.kind === 'bolt') {
        if (!f || !this.reachable(f)) {
          let bd = 65;
          f = undefined;
          for (const o of this.foes) {
            if (!this.reachable(o)) continue;
            const d = Math.hypot(o.x - s.tx, o.y - s.ty);
            if (d < bd) { bd = d; f = o; }
          }
          if (f) s.foe = f.id;
        }
        if (f && !f.dead) { s.tx = f.x; s.ty = f.y; }
      }
      if (s.t < s.dur) continue;
      s.t = -99;
      if (s.kind === 'bolt') {
        if (f && this.reachable(f)) { this.damage(f, s.dmg, s.el, false, false, s.crit); this.applyRound(s.round, f, s.dmg); }
      } else {
        this.events.push({ t: 'boom', x: s.tx, y: s.ty, r: s.splash });
        for (const o of this.foes) {
          if (o.dead || o.def.flying || !this.reachable(o)) continue;
          const d = ell(o.x - s.tx, o.y - s.ty);
          if (d > s.splash) continue;
          const dmg = s.dmg * (d < s.splash * 0.4 ? 1 : 0.6);
          this.damage(o, dmg, s.el, false);
          this.applyRound(s.round, o, dmg);
        }
      }
    }
    this.shots = this.shots.filter(s => s.t > -50);
  }

  private updateClouds(dt: number) {
    for (const c of this.clouds) {
      c.t -= dt;
      for (const f of this.foes) if (!f.dead && !f.def.flying && ell(f.x - c.x, f.y - c.y) < c.r) this.damage(f, c.dps * dt, 'nature', false, true);
    }
    this.clouds = this.clouds.filter(c => c.t > 0);
  }

  /** Remove and return the events since the last call. */
  drain(): BattleEvent[] { const e = this.events; this.events = []; return e; }
}

/* ------------------------------------------------------------------ helpers */

/** Distance in the 3/4 view, where ranges are ellipses. */
export function ell(dx: number, dy: number) { return Math.hypot(dx, dy * Y_SQUASH); }
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function sumItems(items: ItemId[], key: 'hp' | 'dmg' | 'speed' | 'regen' | 'armor' | 'atkSpeed' | 'cleave' | 'sight' | 'sunder' | 'auraDmg'): number {
  let s = 0;
  for (const id of items) s += ITEMS[id][key] ?? 0;
  return s;
}

function nearestD(p: Path, at: Vec): number {
  let best = Infinity, bd = 0;
  for (let d = 0; d <= p.tot; d += 6) { const q = pointAt(p, d); const k = Math.hypot(q.x - at[0], q.y - at[1]); if (k < best) { best = k; bd = d; } }
  return bd;
}

export function inPoly(pt: Vec, poly: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export { distToPath };

/** The fewest lives that still earn 3 and 2 stars, by the same rule as finish(): 90% and 50% of the lives you start with. */
export function starLives(start: number) {
  let three = start, two = start;
  while (three > 0 && (three - 1) / start >= 0.9) three--;
  while (two > 0 && (two - 1) / start >= 0.5) two--;
  return { three, two };
}
