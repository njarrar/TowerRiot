/**
 * The battle: a headless, deterministic simulation of one stage.
 * It knows nothing about canvas or the DOM. The renderer reads its state and
 * drains `events` each frame; the UI calls its command methods.
 */
import { makePath, pointAt, distToPath, smooth, type Path, type Vec } from './path';
import { makeRng } from './rng';
import { ENEMIES, goldScale, hpScale, type EnemyDef, type EnemyKind } from './data/enemies';
import { MAX_TOWER_LEVEL, TOWERS, type Element, type Rounds, type TowerKind } from './data/towers';
import { SHIFTING_EARTH_REFUND,
  resolveStageVariant, spawnsOf,
  type OathId, type PortalDef, type Road, type RubbleDef, type StageDef, type StageVariant, type SwitchDef, type TerraformDef,
} from './data/stages';
import { HERO, heroRespawn, xpToNext, SKILLS, SWEEP, SNARE, ATTUNE, SUNRISE, type SkillKey } from './data/hero';
import { COURIER_SURCHARGE, ITEMS, ITEM_SLOTS, SELL_ITEM, RUNE_EVERY, RUNE_FIRST, RUNE_LIFETIME, RUNE_ORDER, RUNES, type ItemId, type RuneKind } from './data/shop';
import { baseMods, type Mods } from './mods';
import { deliverDamage, type AttributionBucket, type DamageBreakdown, type DmgEl } from './combat';
import { evalTowerStats, type TowerStats } from './tower-stats';

/** The game is drawn in a 3/4 view: ranges are ellipses, squashed by this factor on y. */
export const Y_SQUASH = 1.25;
export const WAVE_GAP = 22;
/** Any tower sees hidden foes this close. */
export const TOWER_SIGHT = 130;
export const LIGHTHOUSE_RANGE = 380;
/** Share of each wave group sent on wave n of total: 55% on the first wave, all of it on the last. */
export const waveRamp = (n: number, total: number) => total <= 1 ? 1 : 0.55 + 0.45 * (n - 1) / (total - 1);
const ELEMENTS: Element[] = ['pierce', 'fire', 'frost', 'storm', 'nature'];
export type TargetMode = 'first' | 'strong' | 'armored' | 'close';

export interface RoadRt {
  def: Road;
  path: Path;
  /** False until openAtWave / openOnPhase or terraform awakens it. */
  active: boolean;
  /** True 1 wave before openAtWave so renderers telegraph cracking soil/rift embers. */
  telegraph: boolean;
  /** False after closeAtWave or terraform closure; walkers already on road finish cleanly. */
  spawnOpen: boolean;
  closed: boolean;
  /** Distance along the road where a tide, lava, or gate closure sits, if any. */
  closeAt: number | null;
  barrier: { hp: number; max: number; d: number; x: number; y: number } | null;
  belts: { from: number; to: number; mult: number }[];
}

export interface PlotRt {
  x: number;
  y: number;
  high: boolean;
  nearWater: boolean;
  sunk: boolean;
  gear?: 'a' | 'b';
  unlocked: boolean;
  rubble: RubbleDef | null;
  rubbleLeft: number;
}

export interface SwitchRt {
  def: SwitchDef;
  state: 0 | 1;
  activeT: number;
  cdLeft: number;
  boosted: boolean;
}

export interface WaterRt {
  id?: string;
  w: number;
  path: Path;
  drained: boolean;
}

export interface PortalRt {
  def: PortalDef;
  fromRoad: RoadRt;
  toRoad: RoadRt;
  fromD: number;
  toD: number;
  fromPos: Vec;
  toPos: Vec;
  active: boolean;
  count: number;
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
  staggerT: number;
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
  /** Bitmask preventing cyclic or repeated jumps across the same portal. */
  warpedMask: number;
  /** Seconds left in a Cinder Hound's lunge. */
  lungeT: number;
  /** Glasshide panes left, seconds until the next one grows back, and a short gap so one burst breaks one pane. */
  panes: number;
  paneT: number;
  paneCd: number;
  /** Inside a Herald's aura this tick. */
  warded: boolean;
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
  /** Shot counter for Repeater Lv 5 every-4th twin bolt mastery. */
  shotCount: number;
  /** Seconds left stunned by a Hollow Ram's stamp. */
  stunT: number;
  /** Telemetry exposed in Tower Inspector & Result breakdown. */
  dmgDealt: number;
  kills: number;
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
  | { t: 'early'; gold: number }
  | { t: 'riftWarn'; road: string; wave: number }
  | { t: 'riftOpen'; road: string }
  | { t: 'clearPlot'; plot: number; free: boolean }
  | { t: 'switchFlip'; id: string; label: string; state: 0 | 1 }
  | { t: 'terraform'; label: string }
  | { t: 'warp'; fromX: number; fromY: number; toX: number; toY: number; kind: PortalDef['kind'] }
  | { t: 'gateShock'; x: number; y: number }
  | { t: 'stamp'; x: number; y: number; r: number }
  | { t: 'pane'; x: number; y: number; left: number }
  | { t: 'lunge'; x: number; y: number }
  | { t: 'won'; stars: number } | { t: 'lost' };

export type Status = 'prep' | 'running' | 'won' | 'lost';

interface Queued { at: number; kind: EnemyKind; spawn?: string }

export interface BattleOptions {
  mods?: Mods;
  seed?: number;
  variant?: StageVariant;
  oaths?: OathId[];
}

export class Battle {
  readonly stage: StageDef;
  readonly rawStage: StageDef;
  readonly variant: StageVariant;
  readonly oaths: OathId[];
  readonly mods: Mods;
  readonly roads: RoadRt[];
  readonly spawns: Map<string, RoadRt[]>;
  readonly plots: PlotRt[];
  readonly waters: WaterRt[];
  readonly switches: SwitchRt[];
  readonly portals: PortalRt[];
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
  rune: { kind: RuneKind; x: number; y: number; ttl: number } | null = null;
  nextRune = RUNE_FIRST;
  resist: Record<Element, number> = { pierce: 0, fire: 0, frost: 0, storm: 0, nature: 0, hero: 0 };
  dmgWindow: Record<Element, number> = { pierce: 0, fire: 0, frost: 0, storm: 0, nature: 0, hero: 0 };
  breakdown: DamageBreakdown = { towers: 0, hero: 0, skills: 0, status: 0 };
  events: BattleEvent[] = [];
  kills = 0;
  leaks = 0;

  private activeHigh: Vec[] | null;
  private appliedTerraforms = new Set<number>();
  private queue: Queued[] = [];
  private waveT = 0;
  private ids = 1;
  private shiftShift = 0;
  private leakedThisWave = false;
  private gateShockUsedWave = -1;
  private threatDirty = true;
  private threat = new Map<RoadRt, number>();
  private airThreat = new Map<RoadRt, number>();
  private shiftOn: boolean[] = [];

  constructor(rawStage: StageDef, opts: BattleOptions = {}) {
    this.rawStage = rawStage;
    this.variant = opts.variant ?? 'standard';
    this.oaths = opts.oaths ?? [];
    const stage = resolveStageVariant(rawStage, this.variant, this.oaths);
    this.stage = stage;
    this.mods = opts.mods ?? baseMods();
    this.rng = makeRng(opts.seed ?? 1234);
    this.scale = hpScale(stage.id) * (stage.hpMul ?? 1);
    this.activeHigh = stage.high ? stage.high.map(p => [...p] as Vec) : null;

    this.roads = stage.roads.map(def => {
      const path = makePath(def.id, smooth(def.ctrl));
      const openWave = def.openAtWave ?? 1;
      const active = openWave <= 1 && !def.openOnPhase;
      const rt: RoadRt = {
        def, path,
        active,
        telegraph: openWave === 2,
        spawnOpen: active && (def.closeAtWave === undefined || def.closeAtWave > 1),
        closed: false,
        closeAt: null,
        barrier: null,
        belts: [],
      };
      for (const s of stage.shifts ?? []) if (s.closes.includes(def.id)) rt.closeAt = nearestD(path, s.at);
      // A gate switch holds walkers at its boom, exactly like a tide holds them at a ford.
      for (const sw of stage.switches ?? []) {
        if (sw.mode === 'gate' && rt.closeAt === null && (sw.closesB ?? []).includes(def.id)) rt.closeAt = nearestD(path, sw.at);
      }
      for (const b of stage.barriers ?? []) if (b.road === def.id) {
        const p = pointAt(path, path.tot * b.at);
        rt.barrier = { hp: b.hp * this.scale, max: b.hp * this.scale, d: path.tot * b.at, x: p.x, y: p.y };
      }
      for (const b of stage.belts ?? []) if (b.road === def.id) rt.belts.push({ from: path.tot * b.from, to: path.tot * b.to, mult: b.mult });
      return rt;
    });

    for (const v of stage.vents ?? []) {
      const road = this.roads.find(r => r.def.id === v.road);
      if (!road) continue;
      const d = road.path.tot * v.at, p = pointAt(road.path, d);
      this.vents.push({ x: p.x, y: p.y, road, d, every: v.every, t: v.every, dmg: v.dmg });
    }

    this.spawns = new Map([...spawnsOf(stage)].map(([k, rs]) => [k, rs.map(r => this.roads.find(x => x.def === r)!)]));

    this.waters = stage.waters.map(w => ({
      id: w.id,
      w: w.w,
      path: makePath(w.id ?? 'w', smooth(w.ctrl)),
      drained: false,
    }));

    this.plots = stage.plots.map(p => ({
      x: p.at[0], y: p.at[1],
      high: false,
      nearWater: false,
      sunk: false,
      gear: p.gear,
      unlocked: (p.openAtWave ?? 1) <= 1,
      rubble: p.rubble ? { ...p.rubble } : null,
      rubbleLeft: p.rubble?.holdSec ?? 0,
    }));
    this.recomputePlotTraits();

    this.switches = (stage.switches ?? []).map(def => ({ def, state: 0, activeT: 0, cdLeft: 0, boosted: false }));
    this.portals = (stage.portals ?? []).map(def => {
      const fromRoad = this.roads.find(r => r.def.id === def.fromRoad)!;
      const toRoad = this.roads.find(r => r.def.id === def.toRoad)!;
      const fromD = fromRoad.path.tot * def.fromAt;
      const toD = toRoad.path.tot * def.toAt;
      const fp = pointAt(fromRoad.path, fromD);
      const tp = pointAt(toRoad.path, toD);
      return { def, fromRoad, toRoad, fromD, toD, fromPos: [fp.x, fp.y], toPos: [tp.x, tp.y], active: (def.openAtWave ?? 1) <= 1, count: 0 };
    });

    const ends = new Map<string, Vec>();
    for (const r of this.roads) { const e = r.path.pts[r.path.pts.length - 1]; ends.set(`${Math.round(e[0])},${Math.round(e[1])}`, e); }
    this.gate = [...ends.values()];
    this.startLives = stage.lives + this.mods.lives;
    this.lives = this.startLives;
    this.gold = stage.startGold + this.mods.gold;
    this.shiftOn = (stage.shifts ?? []).map(() => false);
    if (this.oaths.includes('longNight')) this.night = true;

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

  private recomputePlotTraits() {
    const activeWaters = this.stage.lava ? [] : this.waters.filter(w => !w.drained);
    this.plots.forEach(p => {
      p.high = !!this.activeHigh && inPoly([p.x, p.y], this.activeHigh);
      p.nearWater = activeWaters.some(w => distToPath(w.path, p.x, p.y) < w.w / 2 + 160);
    });
    for (const t of this.towers) if (this.plots[t.plot]) t.high = this.plots[t.plot].high;
  }

  /**
   * Where Wren starts. Keeps Stage 1 near the Keep gate so the tutorial prompt teaches dragging her
   * onto the crossing; later stages place her near the heroStart or 0.62 point if parked at gate.
   */
  private heroStartPoint(): Vec {
    const st = this.stage.heroStart;
    if (this.stage.id === 1) return st;
    if (!this.gate.some(g => Math.hypot(g[0] - st[0], g[1] - st[1]) < 300)) return st;
    const r = [...this.roads].filter(x => x.active).sort((a, z) => z.path.tot - a.path.tot)[0] ?? this.roads[0];
    const p = pointAt(r.path, r.path.tot * 0.62);
    return [p.x, p.y];
  }

  setPaused(v: boolean) { this.paused = v; }
  setSpeed(v: number) { this.speed = clamp(v, 1, 3); }
  setPreviewGold(v: number) { this.gold = v; }

  /* ------------------------------------------------------------------ commands */

  get totalWaves() { return this.stage.waves.length; }

  /** What the next wave will send, after early-wave ramp, including which rifts open/telegraph. */
  nextWave(): { n: number; hint: string; foes: { kind: EnemyKind; count: number }[]; spawns: string[]; openingRoads: string[] } | null {
    const n = this.wave + 1;
    const w = this.stage.waves[n - 1];
    if (!w) return null;
    const ramp = waveRamp(n, this.totalWaves);
    const foes: { kind: EnemyKind; count: number }[] = [];
    const spawnSet = new Set<string>();
    for (const g of w.groups) {
      const count = Math.max(1, Math.round(g.n * ramp));
      const had = foes.find(f => f.kind === g.kind);
      if (had) had.count += count; else foes.push({ kind: g.kind, count });
      if (g.spawn) spawnSet.add(g.spawn);
    }
    if (spawnSet.size === 0) for (const k of this.spawns.keys()) spawnSet.add(k);
    const openingRoads = this.roads.filter(r => r.def.openAtWave === n).map(r => r.def.id);
    return { n, hint: w.hint, foes, spawns: [...spawnSet], openingRoads };
  }

  /** True if the Hollow adapts when wave `n` starts. */
  adaptsAt(n: number): boolean {
    if (this.stage.region === 0 && this.stage.adaptEvery === undefined) return false;
    const every = this.stage.adaptEvery ?? 3;
    return n > 1 && n <= this.totalWaves && (n - 1) % every === 0;
  }

  /** A Herald's aura cuts damage from the element the player leans on most right now. */
  private readonly heraldCut = ENEMIES.herald.traits!.aura!.cut;
  heraldEl(): Element | null {
    const { top, share } = this.adaptationShare();
    return share > 0 ? top : null;
  }

  /** Current leading element pressure toward the 42% adaptation threshold. */
  adaptationShare(): { top: Element | null; share: number; threshold: number } {
    let total = 0;
    let top: Element | null = null;
    for (const e of ELEMENTS) {
      total += this.dmgWindow[e];
      if (!top || this.dmgWindow[e] > this.dmgWindow[top]) top = e;
    }
    const share = top && total > 0 ? this.dmgWindow[top] / total : 0;
    return { top, share, threshold: 0.42 };
  }

  /** The element the Hollow would harden against if it adapted now, if any. */
  adaptLean(): Element | null {
    const { top, share, threshold } = this.adaptationShare();
    return share > threshold ? top : null;
  }

  /** Start the next wave. Early calls pay bonus gold WITHOUT shaving skill cooldowns. */
  callWave(): boolean {
    if (this.status === 'won' || this.status === 'lost') return false;
    if (this.wave >= this.totalWaves) return false;
    if (this.status === 'running' && this.nextIn === null) return false;
    if (this.status === 'running' && this.nextIn !== null && this.nextIn > 0) {
      const bonus = Math.ceil(this.nextIn * 2 * (1 + this.mods.early));
      this.gold += bonus;
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

  masteryCost(kind: TowerKind, which: 'a' | 'b'): number {
    const s = TOWERS[kind].splits.find(x => x.id === which)!;
    return Math.round(s.masteryCost * (1 + this.mods.costMul));
  }

  canBuild(plot: number, kind: TowerKind): boolean {
    const p = this.plots[plot];
    return !!p && p.unlocked && !p.sunk && !p.rubble && this.stage.towers.includes(kind) && !this.towers.some(t => t.plot === plot) && this.gold >= this.costOf(kind);
  }

  build(plot: number, kind: TowerKind): Tower | null {
    if (!this.canBuild(plot, kind)) return null;
    const p = this.plots[plot], cost = this.costOf(kind);
    this.gold -= cost;
    const t: Tower = {
      id: this.ids++, kind, plot, x: p.x, y: p.y, lv: 1, split: null, spent: cost, cd: 0.4,
      mode: 'first', round: null, aim: 0, high: p.high, down: false, fired: 9, shotCount: 0, stunT: 0, dmgDealt: 0, kills: 0,
    };
    t.down = !!p.gear && !this.gearUp(p.gear);
    this.towers.push(t);
    this.threatDirty = true;
    this.events.push({ t: 'build', tower: t.id, x: t.x, y: t.y });
    return t;
  }

  canClearPlot(plot: number): boolean {
    const p = this.plots[plot];
    return !!p && p.unlocked && !p.sunk && !!p.rubble && this.gold >= p.rubble.cost;
  }

  clearPlot(plot: number, free = false): boolean {
    const p = this.plots[plot];
    if (!p || !p.unlocked || p.sunk || !p.rubble) return false;
    if (!free && this.gold < p.rubble.cost) return false;
    if (!free) this.gold -= p.rubble.cost;
    p.rubble = null;
    p.rubbleLeft = 0;
    this.events.push({ t: 'clearPlot', plot, free });
    return true;
  }

  /** Toggle a player map switch ('fork' diverts spawn branch, 'gate' seals for `dur`s, 'belt' brakes belts). */
  toggleSwitch(index: number): boolean {
    const sw = this.switches[index];
    if (!sw || sw.cdLeft > 0) return false;
    if (sw.def.mode !== 'fork' && sw.activeT > 0) return false;
    sw.state = sw.state === 0 ? 1 : 0;
    if (sw.def.mode === 'fork') {
      sw.cdLeft = sw.def.cd;
    } else {
      sw.activeT = sw.def.dur ?? 10;
      sw.cdLeft = sw.def.cd;
    }
    this.threatDirty = true;
    this.updateShifts();
    this.events.push({ t: 'switchFlip', id: sw.def.id, label: sw.def.label, state: sw.state });
    return true;
  }

  upgradeCost(t: Tower): number | null {
    if (t.lv < 3) return this.costOf(t.kind, t.lv + 1);
    if (t.split !== null && t.lv === 4 && t.lv < MAX_TOWER_LEVEL) return this.masteryCost(t.kind, t.split);
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

  /** Pin Wren to a post. She holds there and engages foes inside her 90 px leash without dropping road block. */
  moveHero(x: number, y: number) {
    const h = this.hero;
    if (h.dead || !Number.isFinite(x) || !Number.isFinite(y)) return;
    h.tx = clamp(x, 20, 1260); h.ty = clamp(y, 85, 705);
    h.anchorX = h.tx; h.anchorY = h.ty;
    h.focus = null;
  }

  /** Tell Wren to fight one foe (explicit tap or boss focus updates post anchor so she commits). */
  attackFoe(id: number) {
    const f = this.foes.find(x => x.id === id);
    if (!f || this.hero.dead) return;
    this.hero.focus = id;
    this.hero.tx = clamp(f.x, 20, 1260);
    this.hero.ty = clamp(f.y, 85, 705);
    this.hero.anchorX = this.hero.tx;
    this.hero.anchorY = this.hero.ty;
  }

  canLearn(key: SkillKey): boolean {
    const h = this.hero, s = SKILLS[key], r = h.ranks[key];
    if (h.points < 1 || r >= s.maxRank) return false;
    if (key === 'w' && !this.mods.skillW) return false;
    if (key === 'r' && !this.mods.skillR) return false;
    return h.level >= s.needLevel[r];
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
    for (const f of this.foes) if (this.reachable(f, true) && ell(f.x - h.x, f.y - h.y) < SWEEP.radius) {
      this.damage(f, dmg, 'hero', true, false, false, undefined, 'skills');
    }
    h.cd.q = SKILLS.q.cd[r - 1];
    h.swing = 0.35;
    this.events.push({ t: 'skill', key: 'q', x: h.x, y: h.y });
    return true;
  }

  /** Lantern Snare: tightened 200 px reach (2x leash), roots non-bosses, and applies documented 2.0 s burn DoT! */
  castW(x: number, y: number): boolean {
    if (!this.skillReady('w')) return false;
    const h = this.hero, r = h.ranks.w;
    const dx = x - h.x, dy = y - h.y, dist = Math.hypot(dx, dy);
    if (dist > SNARE.range) { x = h.x + dx / dist * SNARE.range; y = h.y + dy / dist * SNARE.range; }
    const hold = SNARE.hold[r - 1] + this.mods.snare;
    const burst = SNARE.dmg[r - 1] * this.heroDmgMul();
    const burnDps = burst * SNARE.burnDpsMul;
    for (const f of this.foes) if (this.reachable(f, true) && !f.def.flying && ell(f.x - x, f.y - y) < SNARE.radius) {
      if (!f.def.traits?.boss) f.rootT = Math.max(f.rootT, hold);
      f.burnT = Math.max(f.burnT, SNARE.burnSec);
      f.burnDps = Math.max(f.burnDps, burnDps);
      this.damage(f, burst, 'hero', true, false, false, undefined, 'skills');
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

  /** Courier buys away from the gate during active combat cost +20% surcharge; free at gate, prep, or cleared wave. */
  itemCost(id: ItemId): number {
    const base = ITEMS[id].cost;
    const freeCourier = this.nearGate() || this.status === 'prep' || (this.nextIn !== null && this.foes.length === 0);
    return freeCourier ? base : Math.round(base * (1 + COURIER_SURCHARGE));
  }

  canShop(): boolean {
    return !this.hero.dead;
  }

  canBuy(id: ItemId): boolean {
    const it = ITEMS[id];
    return this.canShop() && this.hero.items.length < ITEM_SLOTS && this.gold >= this.itemCost(id) && this.mods.shopAfter >= it.after && !this.hero.items.includes(id);
  }

  buy(id: ItemId): boolean {
    if (!this.canBuy(id)) return false;
    const before = this.heroMaxHp();
    this.gold -= this.itemCost(id);
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

  /** Final numbers for a tower right now, via the pure single source of truth `evalTowerStats()`. */
  stats(t: Tower, lvOverride?: number, splitOverride?: 'a' | 'b' | null): TowerStats {
    return evalTowerStats(
      {
        kind: t.kind,
        lv: t.lv,
        split: t.split,
        high: t.high,
        nearWater: this.plots[t.plot]?.nearWater ?? false,
        x: t.x,
        y: t.y,
        down: t.down,
      },
      {
        mods: this.mods,
        beacons: this.towers.filter(b => b.kind === 'beacon').map(b => ({
          kind: b.kind, lv: b.lv, split: b.split, high: b.high,
          nearWater: this.plots[b.plot]?.nearWater ?? false, x: b.x, y: b.y, down: b.down,
        })),
        hero: {
          dead: this.hero.dead, x: this.hero.x, y: this.hero.y,
          rankE: this.hero.ranks.e, items: this.hero.items, double: this.hero.double, sunriseT: this.hero.sunriseT,
        },
        night: this.night,
        weather: this.stage.weather,
        inLighthouse: (x, y) => this.inLighthouse(x, y),
        ell,
      },
      lvOverride,
      splitOverride,
    );
  }

  /** Highest-damage tower built so far, for Result Card MVP badge. */
  mvpTower(): Tower | null {
    let best: Tower | null = null;
    for (const t of this.towers) if (!best || t.dmgDealt > best.dmgDealt) best = t;
    return best && best.dmgDealt > 0 ? best : null;
  }

  /* ------------------------------------------------------------------ the loop */

  /** Advance the battle. Large steps are split so fast-forward stays stable at 1/30 s. */
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
    this.updateSwitches(dt);
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
    if (this.lives <= 0) this.finish(false);
    else if (running && this.wave >= this.totalWaves && this.queue.length === 0 && this.foes.length === 0) this.finish(true);
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

  /* waves & dynamic map milestones */

  private startWave() {
    const n = ++this.wave, w = this.stage.waves[n - 1];
    this.waveT = 0;
    this.leakedThisWave = false;
    const ramp = waveRamp(n, this.totalWaves);
    for (const g of w.groups) {
      const count = Math.max(1, Math.round(g.n * ramp));
      for (let i = 0; i < count; i++) this.queue.push({ at: g.delay + i * g.gap / ramp, kind: g.kind, spawn: g.spawn });
    }
    this.queue.sort((a, b) => a.at - b.at);
    this.nextIn = null;
    this.events.push({ t: 'wave', n, hint: w.hint });
    if (n > 1) this.gold += 15 + n * 3;
    if (this.adaptsAt(n)) this.adapt();
    this.applyGears(n);

    // Unlock scheduled roads & telegraph upcoming wave breaches (1 wave early).
    for (const r of this.roads) {
      if (!r.active && r.def.openAtWave !== undefined && n >= r.def.openAtWave) {
        this.openRoad(r, r.def.closeAtWave === undefined || n < r.def.closeAtWave);
      }
      if (r.active && r.def.closeAtWave !== undefined && n >= r.def.closeAtWave) {
        r.spawnOpen = false;
      }
      if (!r.active && r.def.openAtWave === n + 1) {
        r.telegraph = true;
        this.events.push({ t: 'riftWarn', road: r.def.id, wave: n + 1 });
      }
    }

    // Unlock dry-bed / surfaced plots & portals scheduled for wave n.
    this.plots.forEach((p, i) => {
      const def = this.stage.plots[i];
      if (!p.unlocked && (def.openAtWave ?? 1) <= n) p.unlocked = true;
      if (def.sinkAt === n && !p.sunk) this.sinkPlot(i);
    });
    for (const pt of this.portals) {
      if (!pt.active && (pt.def.openAtWave ?? 1) <= n) pt.active = true;
    }

    // Drain water flags even if stage has no explicit terraform entry.
    let waterChanged = false;
    this.stage.waters.forEach((wd, idx) => {
      if (wd.drainAtWave === n && this.waters[idx] && !this.waters[idx].drained) {
        this.waters[idx].drained = true;
        waterChanged = true;
      }
    });
    if (waterChanged) this.recomputePlotTraits();

    // Apply wave-triggered Terraforms.
    (this.stage.terraforms ?? []).forEach((tf, idx) => {
      if (tf.atWave === n && !this.appliedTerraforms.has(idx)) {
        this.appliedTerraforms.add(idx);
        this.applyTerraform(tf);
      }
    });

    if (this.stage.night) {
      const on = this.oaths.includes('longNight') ? true : n % 2 === 0;
      if (on !== this.night) { this.night = on; this.events.push({ t: 'night', on }); this.threatDirty = true; }
    }
  }

  /** Open a road for good. A fork switch that was holding the new road shut flips onto it, so the road is really used. */
  private openRoad(r: RoadRt, spawnOpen: boolean) {
    r.active = true;
    r.telegraph = false;
    r.spawnOpen = spawnOpen;
    for (const sw of this.switches) {
      if (sw.def.mode !== 'fork') continue;
      const shut = sw.state === 0 ? sw.def.closesA : sw.def.closesB;
      if ((shut ?? []).includes(r.def.id)) sw.state = sw.state === 0 ? 1 : 0;
    }
    this.threatDirty = true;
    this.updateShifts();
    this.events.push({ t: 'riftOpen', road: r.def.id });
  }

  private sinkPlot(i: number) {
    const p = this.plots[i];
    if (!p || p.sunk) return;
    p.sunk = true;
    const t = this.towers.find(x => x.plot === i);
    if (t) {
      // A sinking plot refunds its tower in full, except under the Shifting Earth oath.
      this.gold += this.oaths.includes('shiftingEarth') ? Math.round(t.spent * SHIFTING_EARTH_REFUND) : t.spent;
      this.towers = this.towers.filter(x => x !== t);
      this.threatDirty = true;
    }
    this.events.push({ t: 'sink', plot: i });
  }

  private applyTerraform(tf: TerraformDef) {
    let traitRefresh = false;
    if (tf.waters?.length) {
      for (const w of this.waters) if (w.id && tf.waters.includes(w.id)) { w.drained = tf.kind === 'drain'; traitRefresh = true; }
    }
    for (const id of tf.openRoads ?? []) {
      const r = this.roads.find(x => x.def.id === id);
      if (r && !r.active) this.openRoad(r, true);
      else if (r) r.spawnOpen = true;
    }
    for (const id of tf.closeRoads ?? []) {
      const r = this.roads.find(x => x.def.id === id);
      if (r) { r.spawnOpen = false; }
    }
    for (const i of tf.openPlots ?? []) {
      if (this.plots[i]) { this.plots[i].unlocked = true; traitRefresh = true; }
    }
    for (const i of tf.sinkPlots ?? []) this.sinkPlot(i);
    if (tf.highPoly) { this.activeHigh = tf.highPoly.map(p => [...p] as Vec); traitRefresh = true; }
    if (traitRefresh) this.recomputePlotTraits();
    this.threatDirty = true;
    this.events.push({ t: 'terraform', label: tf.label });
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
      // Generous 12 s tactical respite when the field clears rather than 8 s scramble.
      if (this.foes.length === 0) this.nextIn = Math.min(this.nextIn, 12);
      this.nextIn -= dt;
      if (this.nextIn <= 0) { this.nextIn = 0; this.startWave(); }
    }
  }

  /** Spawn a foe at a rift. On a fork it takes an open road weighted away from tower threat. */
  spawn(kind: EnemyKind, spawnId?: string, at?: { road: RoadRt; d: number }): Foe {
    const def = ENEMIES[kind];
    let road: RoadRt, d = 0;
    if (at) { road = at.road; d = at.d; } else {
      const activeSpawns = [...this.spawns.entries()].filter(([, rs]) => rs.some(r => r.active && r.spawnOpen)).map(([k]) => k);
      const chosenId = (spawnId && this.spawns.get(spawnId)?.some(r => r.active && r.spawnOpen))
        ? spawnId
        : (activeSpawns[0] ?? [...this.spawns.keys()][0]);
      const options = this.spawns.get(chosenId) ?? this.roads.filter(r => r.active);
      road = this.pickRoad(options, def);
    }
    const isBoss = !!def.traits?.boss;
    const hp = def.hp * this.scale;
    const p = pointAt(road.path, d);
    const f: Foe = {
      id: this.ids++, kind, def, road, d, x: p.x, y: p.y, dir: p.dir, off: isBoss ? 0 : (this.rng() - 0.5) * road.def.w * 0.5,
      hp, max: hp, speed: def.speed * (0.94 + this.rng() * 0.12), slow: 0, slowT: 0, rootT: 0, staggerT: 0, freezeT: 0, freezeImmune: 0,
      burnT: 0, burnDps: 0, vulnT: 0, blocked: false, hidden: false, shielded: false, under: false,
      underT: def.traits?.burrow ? def.traits.burrow[1] : def.traits?.dive?.every ?? 0,
      abilityT: def.traits?.summon?.every ?? def.traits?.lunge?.every ?? def.traits?.stamp?.every ?? 2, phase: 0, burstT: 0, hitT: 0, dead: false, warpedMask: 0,
      lungeT: 0, panes: def.traits?.panes?.n ?? 0, paneT: 0, paneCd: 0, warded: false,
    };
    this.foes.push(f);
    if (isBoss) this.events.push({ t: 'boss', kind });
    return f;
  }

  private pickRoad(options: RoadRt[], def: EnemyDef): RoadRt {
    const active = options.filter(r => r.active && r.spawnOpen);
    const pool = active.length ? active : options.filter(r => r.active);
    const cand = pool.length ? pool : options;
    if (cand.length === 1) return cand[0];
    const sapper = !!def.traits?.sapper;
    let open = cand.filter(r => !r.closed && (sapper || !r.barrier || r.barrier.hp <= 0));
    if (sapper) { const walled = open.filter(r => r.barrier && r.barrier.hp > 0); if (walled.length) return walled[0]; }
    if (open.length === 0) open = cand.filter(r => !r.barrier || r.barrier.hp <= 0);
    if (open.length === 0) open = cand;
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

  private updateSwitches(dt: number) {
    const h = this.hero;
    for (const sw of this.switches) {
      sw.boosted = !h.dead && Math.hypot(h.x - sw.def.at[0], h.y - sw.def.at[1]) < 48;
      if (sw.activeT > 0) {
        sw.activeT = Math.max(0, sw.activeT - dt);
        if (sw.activeT === 0 && sw.def.mode !== 'fork') {
          sw.state = 0;
          this.threatDirty = true;
        }
      }
      if (sw.cdLeft > 0 && (sw.def.mode === 'fork' || sw.activeT <= 0)) {
        sw.cdLeft = Math.max(0, sw.cdLeft - dt * (sw.boosted ? 2 : 1));
      }
    }
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
    for (const sw of this.switches) {
      if (sw.def.mode === 'fork') {
        const list = sw.state === 0 ? sw.def.closesA : sw.def.closesB;
        for (const id of list ?? []) closed.add(id);
      } else if (sw.def.mode === 'gate' && sw.activeT > 0) {
        for (const id of sw.def.closesB ?? []) closed.add(id);
      }
    }
    for (const r of this.roads) r.closed = closed.has(r.def.id);
  }

  /** True while a shift is active, for the renderer. */
  shiftActive(i: number) { return !!this.shiftOn[i]; }

  private updateRunes(dt: number) {
    this.nextRune -= dt;
    if (this.nextRune <= 0) {
      this.nextRune = RUNE_EVERY;
      const kind = RUNE_ORDER[Math.floor(this.rng() * RUNE_ORDER.length)];
      this.rune = { kind, x: this.stage.rune[0], y: this.stage.rune[1], ttl: RUNE_LIFETIME };
      this.events.push({ t: 'rune', kind, picked: false });
    }
    const h = this.hero, r = this.rune;
    if (r) {
      r.ttl -= dt;
      if (!h.dead && Math.hypot(r.x - h.x, r.y - h.y) < 40) {
        this.rune = null;
        if (r.kind === 'haste') h.haste = RUNES.haste.dur;
        if (r.kind === 'double') h.double = RUNES.double.dur;
        if (r.kind === 'regen') h.regenT = RUNES.regen.dur;
        if (r.kind === 'bounty') { const g = 30 + this.wave * 6; this.gold += g; this.giveXp(40 + this.wave * 20); }
        if (this.mods.runeAttune) { h.sunriseT = Math.max(h.sunriseT, 3); }
        this.events.push({ t: 'rune', kind: r.kind, picked: true });
      } else if (r.ttl <= 0) {
        this.rune = null;
      }
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
      for (const f of this.foes) if (!f.def.flying && !f.under && ell(f.x - v.x, f.y - v.y) < 56) this.damage(f, v.dmg * this.scale, 'env', false, false, false, undefined, 'status');
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
    const heralds = this.foes.filter(f => f.def.traits?.aura && !f.dead && !f.under);
    const beacons = this.towers.filter(t => t.kind === 'beacon' && !t.down);
    let blocking = 0;
    const sight = this.heroSight();

    for (const f of this.foes) {
      if (f.dead) continue;
      const tr = f.def.traits;
      f.slowT = Math.max(0, f.slowT - dt); if (f.slowT === 0) f.slow = 0;
      f.rootT = Math.max(0, f.rootT - dt);
      f.staggerT = Math.max(0, f.staggerT - dt);
      f.freezeT = Math.max(0, f.freezeT - dt);
      f.freezeImmune = Math.max(0, f.freezeImmune - dt);
      f.vulnT = Math.max(0, f.vulnT - dt);
      f.burstT = Math.max(0, f.burstT - dt);
      f.hitT = Math.max(0, f.hitT - dt);
      f.paneCd = Math.max(0, f.paneCd - dt);
      if (tr?.panes && f.panes < tr.panes.n) {
        f.paneT -= dt;
        if (f.paneT <= 0) { f.panes++; f.paneT = tr.panes.regrow; }
      }
      if (f.burnT > 0) {
        f.burnT -= dt;
        this.damage(f, f.burnDps * dt, 'fire', false, true, false, undefined, 'status');
        if (f.dead) continue;
        if (f.burnT <= 0) { f.burnT = 0; f.burnDps = 0; }
      }

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
      if (tr?.summon) {
        f.abilityT -= dt;
        if (f.abilityT <= 0) {
          f.abilityT = tr.summon.every;
          for (let i = 0; i < tr.summon.n; i++) this.spawn(tr.summon.kind, undefined, { road: f.road, d: Math.max(0, f.d - 20 - i * 18) });
        }
      }
      const held = f.rootT > 0 || f.freezeT > 0 || f.staggerT > 0;
      if (tr?.lunge) {
        f.lungeT = Math.max(0, f.lungeT - dt);
        if (f.slow > 0 || held || f.blocked) f.lungeT = 0;
        f.abilityT -= dt;
        if (f.abilityT <= 0) {
          f.abilityT = tr.lunge.every;
          if (f.slow <= 0 && !held && !f.blocked) { f.lungeT = tr.lunge.dur; this.events.push({ t: 'lunge', x: f.x, y: f.y }); }
        }
      }
      if (tr?.stamp) {
        f.abilityT -= dt;
        if (f.abilityT <= 0) {
          f.abilityT = tr.stamp.every;
          if (!held) {
            for (const t of this.towers) if (ell(t.x - f.x, t.y - f.y) < tr.stamp.r) t.stunT = Math.max(t.stunT, tr.stamp.stun);
            this.events.push({ t: 'stamp', x: f.x, y: f.y, r: tr.stamp.r });
          }
        }
      }
      if (tr?.heal) {
        f.abilityT -= dt;
        if (f.abilityT <= 0) {
          f.abilityT = 2;
          for (const o of this.foes) if (!o.dead && ell(o.x - f.x, o.y - f.y) < 100) o.hp = Math.min(o.max, o.hp + o.max * tr.heal);
        }
      }

      // Boss phase breaks (now actually awaken openOnPhase roads + atPhase terraforms!).
      if (tr?.phases && f.phase < tr.phases.length && f.hp / f.max < tr.phases[f.phase]) {
        f.phase++;
        f.burstT = 4;
        this.shiftShift += 20;
        for (const r of this.roads) {
          if (!r.active && r.def.openOnPhase !== undefined && f.phase >= r.def.openOnPhase) this.openRoad(r, true);
        }
        (this.stage.terraforms ?? []).forEach((tf, idx) => {
          if (tf.atPhase === f.phase && !this.appliedTerraforms.has(idx)) {
            this.appliedTerraforms.add(idx);
            this.applyTerraform(tf);
          }
        });
        const brood = tr.summon?.kind;
        if (brood) for (let i = 0; i < 6; i++) this.spawn(brood, undefined, { road: f.road, d: Math.max(0, f.d - 30 - i * 16) });
        this.events.push({ t: 'phase', n: f.phase, x: f.x, y: f.y });
      }

      f.shielded = !tr?.shield && wardens.some(w => ell(w.x - f.x, w.y - f.y) < (w.def.traits!.shield ?? 0));
      f.warded = !tr?.aura && heralds.some(w => ell(w.x - f.x, w.y - f.y) < w.def.traits!.aura!.r);
      f.hidden = !!tr?.stealth && !(
        (!h.dead && Math.hypot(h.x - f.x, h.y - f.y) < sight) ||
        h.sunriseT > 0 ||
        this.inLighthouse(f.x, f.y) ||
        (!tr?.veil && this.towers.some(t => ell(t.x - f.x, t.y - f.y) < TOWER_SIGHT)) ||
        beacons.some(b => ell(b.x - f.x, b.y - f.y) < TOWERS.beacon.range[Math.min(b.lv, 3) - 1])
      );

      // Pin + Leash Hold: stepping inside <= 36 px of pinned anchor NEVER breaks Wren's `blocks: 2` guard!
      f.blocked = false;
      const inLeash = Math.hypot(h.x - h.anchorX, h.y - h.anchorY) <= 36;
      if (!h.dead && (!h.moving || inLeash) && !f.def.flying && !f.under && blocking < HERO.blocks && Math.hypot(h.x - f.x, h.y - f.y) < 30 + f.def.size * 10) {
        f.blocked = true; blocking++;
        const armor = Math.min(0.6, sumItems(h.items, 'armor'));
        h.hp -= f.def.dps * this.scale * 0.6 * (1 - armor) * dt;
      }

      // Movement & portal jumps.
      let mul = f.slow > 0 ? 1 - f.slow : 1;
      if (f.rootT > 0 || f.freezeT > 0 || f.staggerT > 0 || f.blocked) mul = 0;
      if (f.burstT > 0) mul *= 1.6;
      if (f.lungeT > 0 && tr?.lunge) mul *= tr.lunge.mult;
      const activeBrake = this.switches.find(sw => sw.def.mode === 'belt' && sw.activeT > 0 && sw.def.targetRoad === f.road.def.id);
      if (activeBrake) mul *= activeBrake.def.beltMult ?? 0.55;
      else for (const b of f.road.belts) if (f.d >= b.from && f.d <= b.to) mul *= b.mult;
      if (f.under && tr?.burrow) mul *= 1.4;
      let nd = f.d + f.speed * mul * dt;
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

      // Deterministic portal / chute warp.
      if (!f.def.traits?.boss) {
        for (let pi = 0; pi < this.portals.length; pi++) {
          const pt = this.portals[pi];
          if (!pt.active || !pt.toRoad.active) continue;
          if ((pt.def.groundOnly ?? true) && f.def.flying) continue;
          if (f.road !== pt.fromRoad || (f.warpedMask & (1 << pi))) continue;
          if (f.d >= pt.fromD && f.d <= pt.fromD + 28) {
            pt.count++;
            if (pt.count % (pt.def.everyNth ?? 1) === 0) {
              const oldX = f.x, oldY = f.y;
              f.warpedMask |= (1 << pi);
              f.road = pt.toRoad;
              f.d = pt.toD;
              const tp = pointAt(f.road.path, f.d);
              f.x = tp.x; f.y = tp.y; f.dir = tp.dir;
              this.events.push({ t: 'warp', fromX: oldX, fromY: oldY, toX: f.x, toY: f.y, kind: pt.def.kind });
              break;
            }
            f.warpedMask |= (1 << pi);
          }
        }
      }

      const p = pointAt(f.road.path, f.d);
      const nx = p.x + f.off * 0.3, ny = p.y + f.off * 0.3;
      if (Math.abs(nx - f.x) > 0.01) f.dir = Math.sign(nx - f.x);
      f.x = nx; f.y = ny;
      if (f.d >= f.road.path.tot - 2) this.leak(f);
    }
  }

  private leak(f: Foe) {
    f.dead = true;
    if ((this.mods.ironGate || this.mods.gateShock) && !this.leakedThisWave && !f.def.traits?.boss) {
      this.leakedThisWave = true;
      if (this.mods.gateShock && this.gateShockUsedWave !== this.wave) {
        this.gateShockUsedWave = this.wave;
        this.events.push({ t: 'gateShock', x: f.x, y: f.y });
        for (const o of this.foes) {
          if (!o.dead && !o.def.traits?.boss && Math.hypot(o.x - f.x, o.y - f.y) < 160) o.rootT = Math.max(o.rootT, 2.5);
        }
      }
      return;
    }
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

  /** Deal damage via pure `deliverDamage()` (with overkill clamp + attribution metrics). */
  damage(
    f: Foe,
    amount: number,
    el: DmgEl,
    byHero: boolean,
    quiet = false,
    crit = false,
    sourceTower?: Tower,
    bucket?: AttributionBucket,
    armorPierceExtra = 0,
  ): number {
    if (!this.reachable(f, true) || amount <= 0) return 0;
    if (f.panes > 0) {
      // Each hit breaks one pane and does no harm. Burns and vents only scratch the glass;
      // a spore cloud breaks a pane now and then.
      const tick = bucket === 'status';
      if (tick && el !== 'nature') return 0;
      if (f.paneCd > 0) return 0;
      f.panes--;
      f.paneCd = tick ? 0.6 : 0.12;
      f.paneT = f.def.traits?.panes?.regrow ?? 2.5;
      this.events.push({ t: 'pane', x: f.x, y: f.y - f.def.bar * 0.6, left: f.panes });
      return 0;
    }
    if (f.warded && el !== 'hero' && el !== 'env' && el === this.heraldEl()) amount *= 1 - this.heraldCut;
    const { applied, clamped } = deliverDamage(
      { stageId: this.stage.id, mods: this.mods, resist: this.resist, dmgWindow: this.dmgWindow, breakdown: this.breakdown },
      f, amount, el, { byHero, quiet, armorPierceExtra, bucket },
    );
    if (applied <= 0) return 0;
    if (sourceTower) sourceTower.dmgDealt += clamped;
    if (!quiet) this.events.push({ t: 'hit', x: f.x, y: f.y - f.def.bar * 0.6, dmg: applied, crit, el });
    if (f.hp <= 0) this.kill(f, byHero, sourceTower);
    return applied;
  }

  private kill(f: Foe, byHero: boolean, sourceTower?: Tower) {
    if (f.dead) return;
    f.dead = true;
    this.kills++;
    if (sourceTower) sourceTower.kills++;
    const gold = Math.round(f.def.gold * goldScale(this.stage.id) * (byHero ? 1 + HERO.lastHit + this.mods.lastHit : 1));
    this.gold += gold;
    this.events.push({ t: 'kill', x: f.x, y: f.y, kind: f.kind, gold, hero: byHero });
    const h = this.hero;
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

  private heroInheritedRound(): Rounds | null {
    if (!this.mods.roundInherit) return null;
    const h = this.hero;
    let best: Tower | undefined, bestD = ATTUNE.radius;
    for (const t of this.towers) {
      if (!t.round || t.down) continue;
      const d = ell(t.x - h.x, t.y - h.y);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best?.round ?? null;
  }

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
        h.dead = true; h.hp = 0; h.respawnT = heroRespawn(h.level); h.focus = null; h.moving = false;
        this.events.push({ t: 'heroDown' });
        return;
      }
    }

    // Wren clears an adjacent rubble plot free of charge when standing stationary beside it!
    for (let pi = 0; pi < this.plots.length; pi++) {
      const p = this.plots[pi];
      if (!p.unlocked || p.sunk || !p.rubble || !p.rubble.holdSec) continue;
      if (this.status === 'running' && !h.moving && Math.hypot(p.x - h.x, p.y - h.y) <= 48) {
        p.rubbleLeft -= dt;
        if (p.rubbleLeft <= 0) this.clearPlot(pi, true);
      } else {
        p.rubbleLeft = p.rubble.holdSec;
      }
    }

    // Engage targets within pinned leash (`HERO.leash = 90`), or focus target.
    let target: Foe | undefined;
    if (h.focus !== null) target = this.foes.find(f => f.id === h.focus && this.reachable(f, true));
    if (!target) {
      h.focus = null;
      let best = Infinity;
      for (const f of this.foes) {
        if (!this.reachable(f, true)) continue;
        const dPost = Math.hypot(f.x - h.anchorX, f.y - h.anchorY);
        if (dPost > HERO.leash) continue;
        const score = Math.hypot(f.x - h.x, f.y - h.y) - (f.blocked ? 200 : 0);
        if (score < best) { best = score; target = f; }
      }
    }

    let gx = h.tx, gy = h.ty;
    if (target) {
      const dist = Math.hypot(target.x - h.x, target.y - h.y);
      const reach = HERO.reach + target.def.size * 6;
      if (dist > reach) {
        // Stay clamped inside pin leash unless pursuing an explicit focus.
        const toTarget = Math.hypot(target.x - h.anchorX, target.y - h.anchorY);
        if (h.focus !== null || toTarget <= HERO.leash) { gx = target.x; gy = target.y + 4; }
      } else {
        gx = h.x; gy = h.y;
      }
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
      this.damage(target, dmg, 'hero', true, false, false, undefined, 'hero');
      const inherited = this.heroInheritedRound();
      if (inherited && !target.dead) this.applyRound(inherited, target, dmg);
      if (sumItems(h.items, 'sunder') > 0 && !target.dead) {
        target.burnT = Math.max(target.burnT, 2.5);
        target.burnDps = Math.max(target.burnDps, dmg * 0.2);
        target.vulnT = Math.max(target.vulnT, 2.5);
      }
      const cleave = sumItems(h.items, 'cleave');
      if (cleave > 0) for (const o of this.foes) if (o !== target && this.reachable(o, true) && ell(o.x - target.x, o.y - target.y) < 70) {
        this.damage(o, dmg * cleave, 'hero', true, true, false, undefined, 'hero');
      }
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
      if (t.stunT > 0) { t.stunT = Math.max(0, t.stunT - dt); continue; }
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

  private attack(t: Tower, target: Foe, s: TowerStats) {
    const el = TOWERS[t.kind].element;
    t.shotCount++;
    switch (t.kind) {
      case 'watch': {
        const bolts = t.lv >= MAX_TOWER_LEVEL && t.split === 'b' && t.shotCount % 4 === 0 ? 2 : 1;
        for (let b = 0; b < bolts; b++) {
          const crit = s.crit > 0 && this.rng() < s.crit;
          const dist = Math.hypot(target.x - t.x, target.y - t.y);
          this.shots.push({
            id: this.ids++, kind: 'bolt', tower: t.id,
            x0: t.x + b * 6, y0: t.y - 110 * (t.split ? 1.08 : 1),
            tx: target.x, ty: target.y, foe: target.id,
            t: -b * 0.05, dur: Math.max(0.12, dist / 950),
            dmg: s.dmg * (crit ? 3 : 1), el, splash: 0, round: t.round, crit,
          });
        }
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
          this.shots.push({
            id: this.ids++, kind: 'shell', tower: t.id, x0: t.x, y0: t.y - 44, tx: p.x, ty: p.y,
            foe: target.id, t: -i * 0.08, dur, dmg: s.dmg, el, splash: s.splash, round: t.round, crit: false,
          });
        }
        this.events.push({ t: 'shot', tower: t.id, kind: 'shell' });
        break;
      }
      case 'bell': {
        const slow = Math.min(0.75, 0.4 + this.mods.slow);
        const freezeDur = t.lv >= MAX_TOWER_LEVEL && t.split === 'a' ? 1.3 : 0.9;
        for (const f of this.foes) {
          if (!this.targetable(t, f, s.range, true)) continue;
          f.slow = Math.max(f.slow, f.def.traits?.boss ? slow * 0.5 : slow);
          f.slowT = Math.max(f.slowT, 1.6);
          if (t.split === 'a' && f.freezeImmune <= 0 && !f.def.traits?.boss) { f.freezeT = freezeDur; f.freezeImmune = 2.6; }
          if (t.split === 'b') f.vulnT = 2;
          this.damage(f, s.dmg, el, false, true, false, t, 'towers');
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
        const pierceExtra = t.lv >= MAX_TOWER_LEVEL && t.split === 'b' && !target.def.traits?.boss ? 0.3 : 0;
        let jumps = t.split === 'b' ? 0 : s.jumps + (this.mods.overload && held ? 2 : 0);
        const reach = this.stage.weather === 'rain' ? 220 : 120;
        while (cur) {
          hit.add(cur.id);
          pts.push([cur.x, cur.y - 14]);
          this.damage(cur, dmg, el, false, false, false, t, 'towers', pierceExtra);
          if (cur === target) this.applyRound(t.round, cur, dmg, t);
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
        const catchR = t.lv >= MAX_TOWER_LEVEL && t.split === 'a' ? 90 : 70;
        const caught = t.split === 'a'
          ? this.foes.filter(f => this.reachable(f) && !f.def.flying && Math.hypot(f.x - target.x, f.y - target.y) < catchR)
          : [target];
        for (const f of caught) {
          if (!f.def.traits?.boss) f.rootT = Math.max(f.rootT, hold);
          this.damage(f, s.dmg, el, false, false, false, t, 'towers');
          this.applyRound(t.round, f, s.dmg, t);
        }
        if (t.split === 'b') {
          const cloudDur = t.lv >= MAX_TOWER_LEVEL ? 4 : 3;
          this.clouds.push({ x: target.x, y: target.y, r: 64, dps: s.dmg * 0.9, t: cloudDur });
        }
        this.events.push({ t: 'root', x: target.x, y: target.y });
        break;
      }
    }
  }

  private applyRound(round: Rounds | null, f: Foe, dmg: number, sourceTower?: Tower) {
    if (!round || f.dead) return;
    if (round === 'ember') { f.burnT = 2; f.burnDps = Math.max(f.burnDps, dmg * 0.25); }
    if (round === 'frost') { f.slow = Math.max(f.slow, 0.2); f.slowT = Math.max(f.slowT, 1); }
    if (round === 'storm' && this.rng() < 0.18) {
      let next: Foe | undefined, bd = 100;
      for (const o of this.foes) { if (o === f || !this.reachable(o)) continue; const d = Math.hypot(o.x - f.x, o.y - f.y); if (d < bd) { bd = d; next = o; } }
      if (next) {
        this.damage(next, dmg * 0.5, 'storm', false, false, false, sourceTower, 'towers');
        this.events.push({ t: 'arc', pts: [[f.x, f.y - 14], [next.x, next.y - 14]] });
      }
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
      const src = this.tower(s.tower);
      if (s.kind === 'bolt') {
        if (f && this.reachable(f)) {
          if (s.crit && src && src.lv >= MAX_TOWER_LEVEL && src.split === 'a' && !f.def.traits?.boss) {
            f.staggerT = Math.max(f.staggerT, 0.35);
          }
          this.damage(f, s.dmg, s.el, false, false, s.crit, src, 'towers');
          this.applyRound(s.round, f, s.dmg, src);
        }
      } else {
        this.events.push({ t: 'boom', x: s.tx, y: s.ty, r: s.splash });
        for (const o of this.foes) {
          if (o.dead || o.def.flying || !this.reachable(o)) continue;
          const d = ell(o.x - s.tx, o.y - s.ty);
          if (d > s.splash) continue;
          const dmg = s.dmg * (d < s.splash * 0.4 ? 1 : 0.6);
          this.damage(o, dmg, s.el, false, false, false, src, 'towers');
          this.applyRound(s.round, o, dmg, src);
        }
      }
    }
    this.shots = this.shots.filter(s => s.t > -50);
  }

  private updateClouds(dt: number) {
    for (const c of this.clouds) {
      c.t -= dt;
      for (const f of this.foes) if (!f.dead && !f.def.flying && ell(f.x - c.x, f.y - c.y) < c.r) {
        this.damage(f, c.dps * dt, 'nature', false, true, false, undefined, 'status');
      }
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
