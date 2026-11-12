import type { Vec } from '../path';
import type { TowerKind } from './towers';
import { waves, type WaveDef } from './waves';

export type Region = 0 | 1 | 2 | 3;
export type OathId = 'twinRifts' | 'shiftingEarth' | 'longNight';
export type StageVariant = 'standard' | 'alt';

export interface RubbleDef {
  kind: 'ruin' | 'crane' | 'boulder' | 'slag';
  cost: number;
  /** Optional seconds for Wren standing within 48 px to clear this plot for free (0 gold). */
  holdSec?: number;
}

export interface Road {
  id: string;
  /** Which rift the road starts from. Roads that share a spawn are a fork: foes pick the safer one. */
  spawn: string;
  ctrl: Vec[];
  w: number;
  /** Wave (1-based) when this road begins accepting spawns (default 1). Telegraphed 1 wave early. */
  openAtWave?: number;
  /** Wave (1-based) when new spawns stop using this road cleanly. */
  closeAtWave?: number;
  /** Boss phase index (1-based) that immediately breaks open this road mid-fight. */
  openOnPhase?: number;
}

export interface Plot {
  at: Vec;
  /** Gear plots are only up on matching waves: 'a' on odd waves, 'b' on even waves. */
  gear?: 'a' | 'b';
  /** The plot sinks at the start of this wave. Any tower on it is refunded 100%. */
  sinkAt?: number;
  /** Wave (1-based) when an initially submerged/buried plot becomes buildable (default 1). */
  openAtWave?: number;
  /** Optional obstacle blocking the plot until cleared for gold or by Wren standing beside it. */
  rubble?: RubbleDef;
}

export interface Water {
  id?: string;
  ctrl: Vec[];
  w: number;
  /** Wave (1-based) when this body of water drains away, updating nearWater/Tide Pearl cleanly. */
  drainAtWave?: number;
}

/** A timed rule that closes roads: a tide over a ford, lava over a pass, steam in a hall. */
export interface Shift {
  kind: 'tide' | 'lava' | 'steam';
  closes: string[];
  every: number;
  start: number;
  dur: number;
  at: Vec;
  r: number;
  label: string;
}

/** A wreck that blocks a road until Sappers chew through it. */
export interface Barrier { road: string; at: number; hp: number }
/** A conveyor belt: foes on it move faster. Distances are shares of the road (0 to 1). */
export interface Belt { road: string; from: number; to: number; mult: number }
/** A steam vent on a road. It blasts foes standing on it. */
export interface Vent { road: string; at: number; every: number; dmg: number }

/** Player-controlled tactical map mechanism (fork switch, timed boom gate, or foundry belt brake). */
export interface SwitchDef {
  id: string;
  label: string;
  at: Vec;
  mode: 'fork' | 'gate' | 'belt';
  closesA?: string[];
  closesB?: string[];
  /** Auto-open/reset duration in seconds for gate & belt modes so players can never soft-lock. */
  dur?: number;
  cd: number;
  targetRoad?: string;
  beltMult?: number;
}

/** One-shot milestone terraforming event (wave or boss phase) reshaping water, roads, plots & high ground. */
export interface TerraformDef {
  atWave?: number;
  atPhase?: number;
  kind: 'drain' | 'flood' | 'quakelow' | 'raisehigh' | 'overdrivebelts';
  label: string;
  waters?: string[];
  openRoads?: string[];
  closeRoads?: string[];
  openPlots?: number[];
  sinkPlots?: number[];
  highPoly?: Vec[];
}

/** Deterministic teleport / chute / tunnel moving everyNth matching foe forward. */
export interface PortalDef {
  id: string;
  kind: 'tunnel' | 'rift' | 'chute';
  fromRoad: string;
  fromAt: number;
  toRoad: string;
  toAt: number;
  openAtWave?: number;
  everyNth?: number;
  groundOnly?: boolean;
}

/** Curated Replay Variant B configuration unlocked per stage after clearing (or directly selectable). */
export interface StageAlt {
  name: string;
  twist: string;
  reverseRoads?: string[];
  openAtWave?: Record<string, number>;
  rubblePlots?: ({ plot: number } & RubbleDef)[];
  sinkPlots?: number[];
  swapGears?: boolean;
  heroStart?: Vec;
  night?: boolean;
  weather?: 'rain';
  adaptEvery?: number;
  /** Every portal opens on this wave instead of its own. */
  portalOpenAtWave?: number;
  /** Tides, lava and steam cycle this much faster or slower (0.8 = every 40 s instead of 50 s). */
  shiftEveryMul?: number;
  /** Foe health for this layout, on top of the stage's own `hpMul`. */
  hpMul?: number;
}

export interface StageDef {
  id: number;
  name: string;
  region: Region;
  twist: string;
  newFoe: string;
  /** Text shown on the stage card about what this stage unlocks. */
  unlocks: string;
  startGold: number;
  lives: number;
  towers: TowerKind[];
  roads: Road[];
  waters: Water[];
  /** Lava instead of water (region 4). */
  lava?: boolean;
  high?: Vec[];
  plots: Plot[];
  bridges: [number, number, number, number][];
  /** Where runes appear. */
  rune: Vec;
  heroStart: Vec;
  shifts?: Shift[];
  barriers?: Barrier[];
  belts?: Belt[];
  vents?: Vent[];
  switches?: SwitchDef[];
  terraforms?: TerraformDef[];
  portals?: PortalDef[];
  alt?: StageAlt;
  weather?: 'rain';
  /** Night falls on even waves (or all waves under longNight). */
  night?: boolean;
  /** A fixed lighthouse that lights a wide circle. */
  lighthouse?: Vec;
  /** Extra foe health for this stage, on top of the usual climb. Default 1. */
  hpMul?: number;
  /** The Hollow adapts every n waves. Default 3. */
  adaptEvery?: number;
  waves: WaveDef[];
}

export const REGIONS = [
  { name: 'Mosslight Vale', rule: 'Forks, night and the swamp', color: '#7fae6a' },
  { name: 'Saltglass Coast', rule: 'Tides, wrecks and storms', color: '#5fa8d0' },
  { name: 'Cogwheel Foundry', rule: 'Belts, gears and steam', color: '#d99a3a' },
  { name: 'Ashen Rift', rule: 'Lava, high ground and the Queen', color: '#d0603a' },
] as const;

const P = (...pts: Vec[]): Plot[] => pts.map(at => ({ at }));
const ALL: TowerKind[] = ['watch', 'cannon', 'bell', 'pylon', 'roots', 'beacon'];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Reverse a road's control points cleanly so the new gate stays inside [65..1215, 115..655] and the new spawn exits outside if originally offscreen. */
function reverseCtrl(ctrl: Vec[]): Vec[] {
  const rev = [...ctrl].reverse().map(p => [...p] as Vec);
  const last = rev.length - 1;
  rev[last] = [clamp(rev[last][0], 85, 1195), clamp(rev[last][1], 115, 650)];
  return rev;
}

/** Speed a shift cycle up or down. The phase of each shift scales with it, and a cycle never gets so short that two half-phase shifts overlap. */
function scaleShifts(shifts: Shift[], mul: number): Shift[] {
  return shifts.map(s => {
    const every = Math.max(Math.ceil(s.dur * 2.1), Math.round(s.every * mul));
    return { ...s, every, start: Math.round(s.start * every / s.every) };
  });
}

/** Twin Rifts: every foe is this much tougher. More foes would also pay more gold, which made the oath easier, not harder. */
export const TWIN_RIFTS_HP = 1.15;
/** Shifting Earth: tides, lava and steam hold a road shut for this share of their usual time. */
export const SHIFTING_EARTH_DUR = 0.6;
/** Shifting Earth: a tower lost to a sinking plot refunds this share of what was spent on it (normally all of it). */
export const SHIFTING_EARTH_REFUND = 0.5;

/**
 * A road that now opens before any wave is sent to its rift would stand empty.
 * Each wave from its new opening until the first wave already aimed at that rift sends a splinter group there.
 */
function seedEarlyRifts(out: StageDef, orig: StageDef): WaveDef[] {
  const list = out.waves.map(w => ({ ...w, groups: w.groups.map(g => ({ ...g })) }));
  const seeded = new Set<string>();
  for (const r of out.roads) {
    const was = orig.roads.find(o => o.id === r.id);
    if (!was || r.openOnPhase !== undefined || seeded.has(r.spawn)) continue;
    const now = r.openAtWave ?? 1;
    if (now >= (was.openAtWave ?? 1) && was.openOnPhase === undefined) continue;
    let first = list.findIndex(w => w.groups.some(g => g.spawn === r.spawn));
    if (first < 0) continue; // untagged stage: the rift is shared and already fed
    seeded.add(r.spawn);
    for (let wi = now - 1; wi < first; wi++) {
      const crowd = list[wi].groups.filter(g => g.n >= 3).sort((a, b) => b.n - a.n)[0];
      if (!crowd) continue;
      list[wi].groups.push({ kind: crowd.kind, n: Math.max(2, Math.ceil(crowd.n * 0.4)), gap: crowd.gap, spawn: r.spawn, delay: crowd.delay + 2 });
    }
  }
  return list;
}

/** Shifting Earth: the two open plots closest to a road sink mid-battle. */
function shiftingPlots(out: StageDef): number[] {
  const bends: Vec[] = [];
  for (const r of out.roads) {
    if (r.openOnPhase !== undefined) continue;
    for (let i = 1; i < r.ctrl.length - 1; i++) bends.push(r.ctrl[i]);
  }
  const cand = out.plots
    .map((pl, i) => ({ i, pl, d: Math.min(...bends.map(b => Math.hypot(b[0] - pl.at[0], b[1] - pl.at[1]))) }))
    .filter(c => c.pl.sinkAt === undefined && !c.pl.gear && !c.pl.rubble && (c.pl.openAtWave ?? 1) <= 1)
    .sort((a, b) => a.d - b.d || a.i - b.i);
  if (cand.length < 4) return [];
  const a = cand[0];
  const b = cand.find(c => c !== a && Math.hypot(c.pl.at[0] - a.pl.at[0], c.pl.at[1] - a.pl.at[1]) >= 220) ?? cand[1];
  return [a.i, b.i];
}

/** True when this layout differs from the standard one in a way the sim acts on. Used by tests to prove no variant or oath is a no-op. */
export function stageSignature(st: StageDef): string {
  return JSON.stringify({
    roads: st.roads, plots: st.plots, waves: st.waves, shifts: st.shifts ?? [], portals: st.portals ?? [],
    night: !!st.night, weather: st.weather ?? null, adaptEvery: st.adaptEvery ?? null, hpMul: st.hpMul ?? 1,
  });
}

/** Apply Replay Variant B (`alt`) and Challenge Oaths deterministically (zero RNG) before battle setup or static stage validation. */
export function resolveStageVariant(st: StageDef, variant: StageVariant = 'standard', oaths: OathId[] = []): StageDef {
  let out: StageDef = {
    ...st,
    roads: st.roads.map(r => ({ ...r, ctrl: r.ctrl.map(p => [...p] as Vec) })),
    waters: st.waters.map(w => ({ ...w, ctrl: w.ctrl.map(p => [...p] as Vec) })),
    plots: st.plots.map(p => ({ ...p, at: [...p.at] as Vec, rubble: p.rubble ? { ...p.rubble } : undefined })),
    heroStart: [...st.heroStart] as Vec,
  };

  if (variant === 'alt' && st.alt) {
    const a = st.alt;
    out.twist = `${a.name}: ${a.twist}`;
    if (a.reverseRoads?.length) {
      const set = new Set(a.reverseRoads);
      out.roads = out.roads.map(r => (set.has(r.id) ? { ...r, ctrl: reverseCtrl(r.ctrl) } : r));
    }
    if (a.openAtWave) {
      // A road given a wave to open on no longer waits for a boss phase.
      out.roads = out.roads.map(r => {
        if (a.openAtWave![r.id] === undefined) return r;
        const { openOnPhase: _phase, ...rest } = r;
        return { ...rest, openAtWave: a.openAtWave![r.id] };
      });
    }
    if (a.rubblePlots) {
      for (const rp of a.rubblePlots) {
        if (out.plots[rp.plot]) out.plots[rp.plot].rubble = { kind: rp.kind, cost: rp.cost, holdSec: rp.holdSec };
      }
    }
    if (a.sinkPlots) {
      for (const idx of a.sinkPlots) if (out.plots[idx]) out.plots[idx].sinkAt = out.plots[idx].sinkAt ?? 5;
    }
    if (a.swapGears) {
      out.plots = out.plots.map(p => (p.gear ? { ...p, gear: p.gear === 'a' ? 'b' : 'a' } : p));
    }
    if (a.heroStart) out.heroStart = [...a.heroStart] as Vec;
    if (a.night !== undefined) out.night = a.night;
    if (a.weather !== undefined) out.weather = a.weather;
    if (a.adaptEvery !== undefined) out.adaptEvery = a.adaptEvery;
    if (a.portalOpenAtWave !== undefined) out.portals = out.portals?.map(pt => ({ ...pt, openAtWave: a.portalOpenAtWave }));
    if (a.shiftEveryMul !== undefined && out.shifts?.length) out.shifts = scaleShifts(out.shifts, a.shiftEveryMul);
    if (a.hpMul !== undefined) out.hpMul = (st.hpMul ?? 1) * a.hpMul;
  }

  if (oaths.includes('twinRifts')) {
    // Roads and portals wake at once. Plots keep their own schedule: early ground would be a gift, not a challenge.
    // A road a boss breaks open at a health phase still waits for the boss.
    out.roads = out.roads.map(r => (r.openOnPhase !== undefined ? r : { ...r, openAtWave: 1 }));
    out.portals = out.portals?.map(pt => ({ ...pt, openAtWave: 1 }));
    out.hpMul = (out.hpMul ?? 1) * TWIN_RIFTS_HP;
  }
  if (oaths.includes('shiftingEarth')) {
    // A tide that holds foes at a ford is the player's friend, so the oath cuts every closure short.
    if (out.shifts?.length) out.shifts = out.shifts.map(s => ({ ...s, dur: Math.max(4, Math.round(s.dur * SHIFTING_EARTH_DUR)) }));
    const n = out.waves.length;
    const first = Math.max(2, Math.round(n * 0.4));
    const at = [first, Math.max(first + 1, Math.round(n * 0.7))];
    shiftingPlots(out).forEach((pi, k) => { out.plots[pi] = { ...out.plots[pi], sinkAt: at[k] }; });
  }
  if (oaths.includes('longNight')) {
    out.night = true;
  }

  if (variant === 'alt' || oaths.includes('twinRifts')) out.waves = seedEarlyRifts(out, st);

  return out;
}

/* =========================== Region 1: Mosslight Vale =========================== */

const s1: StageDef = {
  id: 1, name: 'Lantern Road', region: 0,
  twist: 'Drag Wren onto the road to hold the crossing. Rebuild the ruined bend plot with gold or Wren field work.',
  newFoe: 'Grub', unlocks: 'Frost bell & Wren\'s Lantern Snare (W)',
  startGold: 240, lives: 20, towers: ['watch', 'cannon'],
  roads: [{ id: 'main', spawn: 'w', w: 54, ctrl: [[-40, 185], [200, 195], [300, 330], [210, 515], [340, 595], [485, 455], [630, 355], [810, 245], [1010, 235], [1055, 415], [1150, 565]] }],
  waters: [{ id: 'brook', w: 64, ctrl: [[860, -40], [760, 140], [630, 355], [500, 560], [410, 770]] }],
  plots: [
    { at: [140, 290] }, { at: [140, 440] },
    { at: [335, 455], rubble: { kind: 'ruin', cost: 30, holdSec: 3 } },
    { at: [410, 295] }, { at: [635, 495] }, { at: [760, 395] },
    { at: [925, 365] }, { at: [960, 495] }, { at: [1175, 325] }, { at: [895, 130] },
  ],
  bridges: [[630, 355, -0.55, 64]], rune: [755, 540], heroStart: [1030, 490],
  alt: {
    name: 'Uphill March',
    twist: 'The Hollow marches backward from the Keep end toward the western woods.',
    reverseRoads: ['main'], heroStart: [260, 260],
  },
  waves: waves([
    ['Grubs crawl in', '8 grub /1.3'],
    ['More grubs', '12 grub /1'],
    ['Two waves close behind', '14 grub /0.85'],
    ['A thicker pack', '18 grub /0.7'],
    ['Heavy trail', '22 grub /0.65'],
    ['Bulwark march', '26 grub /0.55'],
  ]),
};

const s2: StageDef = {
  id: 2, name: 'Fork in the Moss', region: 0,
  twist: 'The roads cross in a central pinwheel. At Wave 5 the moss pond drains and a third north rift breaches.',
  newFoe: 'Skitter', unlocks: 'Root garden & Wren talent tree',
  startGold: 280, lives: 20, towers: ['watch', 'cannon', 'bell'],
  roads: [
    { id: 'north', spawn: 'w', w: 50, ctrl: [[-40, 220], [210, 220], [420, 125], [740, 140], [860, 270], [660, 385], [520, 520], [760, 610], [1050, 560], [1165, 430]] },
    { id: 'south', spawn: 'w', w: 50, ctrl: [[-40, 220], [210, 220], [200, 440], [350, 560], [540, 450], [660, 385], [880, 360], [1080, 390], [1165, 430]] },
    { id: 'bog',   spawn: 'n', w: 42, openAtWave: 5, ctrl: [[640, -40], [640, 185], [660, 385], [880, 360], [1080, 390], [1165, 430]] },
  ],
  waters: [
    { id: 'pond', w: 56, drainAtWave: 5, ctrl: [[430, 305], [535, 300], [630, 290]] },
    { id: 'pool_e', w: 52, ctrl: [[830, 495], [930, 485]] },
  ],
  plots: [
    ...P([110, 330], [320, 430], [295, 295], [560, 215], [535, 365], [715, 480], [735, 225], [445, 610], [1045, 480], [885, 130], [960, 265], [925, 655]),
    { at: [510, 285], openAtWave: 5 },
  ],
  bridges: [], rune: [435, 385], heroStart: [980, 415],
  terraforms: [
    { atWave: 5, kind: 'drain', label: 'The moss pond drains! A northern breach tears open!', waters: ['pond'], openRoads: ['bog'], openPlots: [12] },
  ],
  alt: {
    name: 'Dusk on the Bog',
    twist: 'Night falls on even waves, the north breach awakens on Wave 2, and inner bends start ruined.',
    night: true, openAtWave: { bog: 2 },
    rubblePlots: [{ plot: 4, kind: 'ruin', cost: 45, holdSec: 4 }, { plot: 5, kind: 'ruin', cost: 45, holdSec: 4 }],
  },
  waves: waves([
    ['Grubs test the X-crossing', '10 grub @w /1.1'],
    ['Skitters sprint the curves', '12 skitter @w /0.7'],
    ['Mixed pack', '12 grub @w /0.9, 8 skitter @w +5 /0.6'],
    ['Twin lane pressure', '20 skitter @w /0.45'],
    ['The pond drains: north breach!', '16 grub @w /0.6, 10 grub @n /0.8'],
    ['Fast packs from north and west', '14 skitter @n /0.5, 14 grub @w +4 /0.7'],
    ['Swarm across the pinwheel', '22 skitter @w /0.35, 12 skitter @n +4 /0.5'],
    ['Everything converges', '20 skitter @w /0.4, 18 grub @n +4 /0.5, 16 grub @w +8 /0.5'],
  ]),
};

const s3: StageDef = {
  id: 3, name: 'Switchback Hill', region: 0,
  twist: 'The road plunges north-to-south down terraced cliffs. Clear spine boulders or brace for the Wave 5 scree chute.',
  newFoe: 'Shellback', unlocks: 'Beacon tower',
  startGold: 300, lives: 20, towers: ['watch', 'cannon', 'bell', 'roots'],
  roads: [{ id: 'main', spawn: 'w', w: 50, ctrl: [[360, -40], [360, 110], [540, 130], [890, 145], [960, 240], [870, 330], [520, 335], [330, 360], [310, 465], [460, 530], [790, 535], [860, 610], [660, 640]] }],
  waters: [
    { w: 44, ctrl: [[150, -40], [155, 290], [160, 770]] },
    { w: 44, ctrl: [[1120, -40], [1125, 260], [1110, 770]] },
  ],
  high: [[240, 0], [1040, 0], [1040, 270], [800, 285], [460, 285], [240, 270], [240, 0]],
  plots: [
    ...P([275, 130], [470, 232], [645, 232]),
    { at: [820, 232], rubble: { kind: 'boulder', cost: 50, holdSec: 4 } },
    ...P([1005, 135], [425, 435]),
    { at: [600, 435], rubble: { kind: 'boulder', cost: 50, holdSec: 4 } },
    ...P([775, 435], [960, 420], [245, 515], [505, 625], [950, 610]),
  ],
  bridges: [], rune: [965, 315], heroStart: [640, 520],
  portals: [{ id: 'scree_chute', kind: 'chute', fromRoad: 'main', fromAt: 0.3, toRoad: 'main', toAt: 0.72, openAtWave: 5, everyNth: 3, groundOnly: true }],
  alt: {
    name: 'Uphill Climb',
    twist: 'Foes climb upward from the southern basin toward the cliff summit.',
    reverseRoads: ['main'], heroStart: [640, 260],
  },
  waves: waves([
    ['Grubs down the hill', '12 grub /1'],
    ['Skitters', '16 skitter /0.5'],
    ['The first Shellback', '2 shell /3, 10 grub +2'],
    ['A long column', '24 grub /0.6'],
    ['Scree chute opens!', '4 shell /2.4, 18 skitter +5 /0.4'],
    ['Fast and heavy', '20 skitter /0.35, 4 shell +6'],
    ['A wall of shells', '8 shell /1.8'],
    ['Everything rolls down', '6 shell /2, 24 grub +2 /0.5, 24 skitter +12 /0.35'],
  ]),
};

const s4: StageDef = {
  id: 4, name: 'Firefly Night', region: 0,
  twist: 'Opposite pincers meet in the dark. Unlit shrines hide plots until cleared, and an eastern breach wakes at Wave 5.',
  newFoe: 'Shade', unlocks: 'Swamp boss stage',
  startGold: 340, lives: 20, towers: ['watch', 'cannon', 'bell', 'roots', 'beacon'], night: true,
  roads: [
    { id: 'north', spawn: 'n', w: 50, ctrl: [[1150, -40], [1120, 130], [920, 165], [760, 260], [640, 350], [420, 315], [145, 230]] },
    { id: 'south', spawn: 's', w: 50, ctrl: [[-40, 600], [280, 605], [580, 575], [760, 495], [640, 350], [420, 315], [145, 230]] },
    { id: 'east_breach', spawn: 's', w: 42, openAtWave: 5, ctrl: [[1320, 460], [980, 420], [760, 495], [640, 350], [420, 315], [145, 230]] },
  ],
  waters: [{ w: 54, ctrl: [[980, 520], [1060, 580], [1140, 630]] }],
  plots: [
    ...P([250, 145], [255, 365], [480, 215], [510, 430]),
    { at: [645, 225], rubble: { kind: 'ruin', cost: 45, holdSec: 4 } },
    ...P([815, 130], [860, 350], [980, 260], [135, 495], [435, 655], [860, 575]),
    { at: [630, 480], rubble: { kind: 'ruin', cost: 45, holdSec: 4 } },
  ],
  bridges: [], rune: [980, 385], heroStart: [380, 310],
  alt: {
    name: 'Long Dusk',
    twist: 'The eastern breach opens on Wave 2 and fallen shrines bury two more plots.',
    openAtWave: { east_breach: 2 },
    rubblePlots: [{ plot: 3, kind: 'ruin', cost: 50, holdSec: 4 }, { plot: 6, kind: 'ruin', cost: 50, holdSec: 4 }],
  },
  waves: waves([
    ['Two opposite rifts', '8 grub @n, 8 grub @s +1'],
    ['Night: Shades slip in', '6 shade @n /1.4, 10 grub @s'],
    ['Shellbacks at dawn', '3 shell @n /3, 3 shell @s /3 +1, 10 skitter @n +6'],
    ['Night: Shade pack', '10 shade @s /1, 10 skitter @n'],
    ['Eastern reeds tear open', '20 skitter @n /0.4, 20 grub @s /0.6'],
    ['Night: shadows and shells', '8 shade @n /1.1, 4 shell @s, 8 shade @s +8'],
    ['Daybreak column', '6 shell @n /2, 24 grub @s /0.5, 12 skitter @n +10'],
    ['Night: the long dark', '16 shade @n /0.8, 16 shade @s /0.8 +2, 6 shell @n +10'],
  ]),
};

const s5: StageDef = {
  id: 5, name: 'The Mire King', region: 0,
  twist: 'Boss. The swamp swallows outer plots while draining its moat at Wave 5; when the King wakes, an inner causeway opens.',
  newFoe: 'The Mire King', unlocks: 'Storm pylon & Relic: Mire crown (+10% tower damage)',
  startGold: 420, lives: 20, towers: ['watch', 'cannon', 'bell', 'roots', 'beacon'],
  roads: [
    { id: 'main',  spawn: 'w', w: 50, ctrl: [[1320, 510], [1130, 515], [1120, 220], [920, 100], [500, 100], [190, 195], [150, 415], [270, 560], [640, 570], [925, 515], [910, 355], [760, 290], [640, 350]] },
    { id: 'inner', spawn: 'w', w: 40, openOnPhase: 1, ctrl: [[1320, 510], [1130, 515], [1120, 220], [910, 355], [760, 290], [640, 350]] },
  ],
  waters: [{ id: 'moat', w: 58, drainAtWave: 5, ctrl: [[560, 240], [405, 275], [375, 395], [485, 500], [735, 495], [820, 380], [800, 255]] }],
  plots: [
    { at: [540, 385] }, { at: [665, 415], sinkAt: 8 }, { at: [375, 195] },
    { at: [585, 168] }, { at: [795, 180] }, { at: [1015, 360], sinkAt: 6 },
    { at: [1015, 595] }, { at: [640, 645] }, { at: [435, 640] },
    { at: [245, 370], sinkAt: 4 }, { at: [85, 290] }, { at: [1200, 390] },
    { at: [1210, 600] }, { at: [470, 470], openAtWave: 5 },
  ],
  bridges: [], rune: [530, 305], heroStart: [740, 355],
  terraforms: [
    { atWave: 5, kind: 'drain', label: 'The crescent moat drains, uncovering a dry island mound!', waters: ['moat'], openPlots: [13] },
    { atPhase: 1, kind: 'quakelow', label: 'The Mire King smashes an inner causeway straight to the Keep!', openRoads: ['inner'] },
  ],
  alt: {
    name: 'Sunken Crown',
    twist: 'Night falls on even waves and sinkholes swallow two more plots at Wave 5.',
    hpMul: 1.2,
    night: true, sinkPlots: [0, 3],
  },
  waves: waves([
    ['The swamp stirs', '14 grub /0.8'],
    ['Skitters skim the mud', '20 skitter /0.45'],
    ['Shells in the reeds', '5 shell /2.2, 10 grub +4'],
    ['Shades at dusk', '10 shade /1, 10 grub +3'],
    ['The moat drains!', '6 shell /2, 24 skitter +4 /0.35'],
    ['The court of the King', '8 shell /1.8, 20 grub +2 /0.5, 8 shade +10'],
    ['The Mire King rises', '1 mireking, 20 grub +5 /1, 6 shell +20 /3'],
  ]),
};

/* =========================== Region 2: Saltglass Coast =========================== */

const s6: StageDef = {
  id: 6, name: 'Low Tide', region: 1,
  twist: 'Two tidal islands feeding west. Pull the Harbor Boom to seal the north bridge, or watch the Wave 6 cliff detour open.',
  newFoe: 'Moth', unlocks: 'Sapper & Shipwreck Cove',
  startGold: 420, lives: 20, towers: ALL,
  high: [[0, 235], [310, 250], [340, 460], [260, 500], [0, 500], [0, 235]],
  roads: [
    { id: 'north',  spawn: 'n', w: 50, ctrl: [[1120, -40], [1090, 125], [840, 130], [640, 185], [580, 295], [410, 360], [135, 360]] },
    { id: 'south',  spawn: 's', w: 50, ctrl: [[1120, 760], [1010, 585], [830, 565], [640, 480], [410, 360], [135, 360]] },
    { id: 'detour', spawn: 's', w: 34, openAtWave: 6, ctrl: [[1120, 760], [1010, 585], [1140, 440], [1110, 260], [840, 130], [640, 185], [580, 295], [410, 360], [135, 360]] },
  ],
  waters: [
    { w: 64, ctrl: [[720, -40], [675, 100], [625, 210], [510, 265], [340, 235], [140, 165], [-40, 130]] },
    { w: 66, ctrl: [[1320, 690], [1000, 675], [830, 565], [660, 625], [420, 610], [220, 540], [-40, 570]] },
  ],
  plots: P([250, 290], [255, 435], [460, 495], [505, 175], [770, 235], [710, 360], [985, 355], [965, 230], [940, 495], [1220, 350], [1215, 175]),
  bridges: [[640, 185, 2.07, 62]], rune: [720, 445], heroStart: [310, 360],
  shifts: [{ kind: 'tide', closes: ['south'], every: 40, start: 18, dur: 16, at: [830, 565], r: 52, label: 'The tide floods the south ford' }],
  switches: [{ id: 'boom', label: 'North Boom', at: [640, 185], mode: 'gate', closesB: ['north'], dur: 11, cd: 20 }],
  alt: {
    name: 'Rip Tide',
    twist: 'The cliff detour wakes on Wave 2 and tidal sandbars bury inner plots under coastal ruins.',
    openAtWave: { detour: 2 },
    rubblePlots: [{ plot: 4, kind: 'ruin', cost: 60, holdSec: 5 }],
  },
  waves: waves([
    ['Two island rifts open', '8 grub @n /1.2, 8 grub @s /1.2 +2'],
    ['Skitters cross the shoals', '10 skitter @n /0.7, 10 skitter @s /0.7 +1'],
    ['Moths over the straits', '8 moth @n /1, 12 grub @s /0.9'],
    ['Shellbacks, armored', '3 shell @s /3, 14 grub @n /0.8'],
    ['Rising swells', '16 grub @n /0.7, 14 skitter @s +3 /0.6'],
    ['Detour cliff breaches!', '22 skitter @n /0.4, 22 skitter @s +2 /0.4'],
    ['Heavy tide march', '6 shell @n /2.2, 16 skitter @s /0.45'],
    ['Moth cloud', '20 moth @n /0.55, 12 moth @s +3 /0.7'],
    ['Full estuary assault', '8 shell @s /2, 24 grub @n +2 /0.5, 14 moth @s +6 /0.6'],
  ]),
};

const s7: StageDef = {
  id: 7, name: 'Shipwreck Cove', region: 1,
  twist: 'Salvage cove wrecks for plots, trigger the Shoal Boom gate, and defend when Wave 5 ebb tide drains the harbor reef.',
  newFoe: 'Sapper', unlocks: 'Armory tree & Wren\'s Sunrise (R)',
  startGold: 440, lives: 20, towers: ALL, hpMul: 1.02,
  roads: [
    { id: 'cliff', spawn: 'w', w: 50, ctrl: [[1320, 520], [1120, 510], [1080, 280], [920, 155], [640, 145], [340, 165], [240, 300], [250, 520], [130, 565]] },
    { id: 'beach', spawn: 'w', w: 50, ctrl: [[1320, 520], [1120, 510], [910, 440], [635, 325], [430, 440], [250, 520], [130, 565]] },
    { id: 'reef',  spawn: 'w', w: 40, openAtWave: 5, ctrl: [[1320, 520], [1120, 510], [925, 470], [740, 610], [530, 610], [250, 520], [130, 565]] },
  ],
  waters: [{ id: 'cove', w: 96, drainAtWave: 5, ctrl: [[635, 770], [635, 580], [635, 445]] }],
  plots: [
    { at: [440, 290], rubble: { kind: 'ruin', cost: 65, holdSec: 5 } },
    { at: [640, 225] },
    { at: [835, 290], rubble: { kind: 'ruin', cost: 65, holdSec: 5 } },
    ...P([980, 295], [1005, 575], [765, 470], [465, 510], [360, 415], [135, 415], [160, 175], [1185, 360], [325, 650]),
    { at: [635, 495], openAtWave: 5 },
  ],
  bridges: [], rune: [810, 620], heroStart: [310, 500],
  barriers: [{ road: 'beach', at: 0.44, hp: 500 }],
  switches: [{ id: 'cove_boom', label: 'Shoal Boom', at: [635, 325], mode: 'gate', closesB: ['beach'], dur: 11, cd: 20 }],
  terraforms: [
    { atWave: 5, kind: 'drain', label: 'Ebb tide exposes the outer reef road and sandbar!', waters: ['cove'], openRoads: ['reef'], openPlots: [12] },
  ],
  alt: {
    name: 'Westward Landing',
    twist: 'Every landing reverses: waves come ashore at the west cove and march east, and the outer reef opens on Wave 2.',
    hpMul: 1.57,
    reverseRoads: ['cliff', 'beach', 'reef'], openAtWave: { reef: 2 }, heroStart: [980, 500],
  },
  waves: waves([
    ['The high headland', '12 grub /0.9'],
    ['Sappers rush the wreck', '2 sapper /3, 10 skitter +3 /0.6'],
    ['Moths off the sea', '10 moth /0.8, 10 grub +2'],
    ['More Sappers', '4 sapper /2, 14 grub +2 /0.7'],
    ['Ebb tide exposes the reef!', '4 shell /2.4, 16 skitter +3 /0.4'],
    ['Sappers and shells', '18 grub /0.6, 3 sapper +2 /2.5, 4 shell +4 /2'],
    ['Moth cloud', '24 moth /0.5'],
    ['Harbor push', '6 shell /2, 4 sapper +2 /2, 20 skitter +8 /0.35'],
    ['The storm fleet', '6 shell /1.8, 16 moth +4 /0.6, 4 sapper +6 /2.5, 22 grub +10 /0.5'],
  ]),
};

const s8: StageDef = {
  id: 8, name: 'Lighthouse Rock', region: 1,
  twist: '360° sea-stack siege onto the central Lighthouse island. Clear citadel ruins before Wave 6 wakes the sea-cave tunnel.',
  newFoe: 'Splitter', unlocks: 'Tower splits at level 4',
  startGold: 560, lives: 20, towers: ALL, lighthouse: [640, 360], hpMul: 1.98,
  high: [[420, 225], [540, 195], [740, 195], [860, 225], [885, 360], [860, 495], [740, 525], [540, 525], [420, 495], [395, 360], [420, 225]],
  roads: [
    { id: 'north', spawn: 'n', w: 48, ctrl: [[-40, 150], [220, 145], [520, 130], [840, 150], [1030, 260], [990, 405], [820, 445], [640, 360]] },
    { id: 'south', spawn: 's', w: 48, ctrl: [[1320, 580], [1060, 585], [760, 595], [440, 575], [250, 465], [290, 315], [460, 285], [640, 360]] },
  ],
  waters: [
    { w: 64, ctrl: [[-40, 410], [80, 435], [140, 560], [170, 770]] },
    { w: 64, ctrl: [[1110, -40], [1140, 150], [1200, 280], [1320, 310]] },
  ],
  plots: [
    { at: [545, 245], rubble: { kind: 'ruin', cost: 70, holdSec: 5 } },
    ...P([735, 245], [545, 480]),
    { at: [735, 480], rubble: { kind: 'ruin', cost: 70, holdSec: 5 } },
    ...P([260, 225], [390, 200], [890, 520], [1020, 495], [130, 260], [1150, 460], [355, 650], [955, 125]),
  ],
  bridges: [], rune: [960, 320], heroStart: [560, 360],
  portals: [{ id: 'seacave', kind: 'tunnel', fromRoad: 'south', fromAt: 0.25, toRoad: 'north', toAt: 0.65, openAtWave: 6, everyNth: 3, groundOnly: true }],
  alt: {
    name: 'Blackout Beacon',
    twist: 'Night settles on even waves and the sea-cave tunnel opens on Wave 2.',
    hpMul: 1.1,
    night: true, portalOpenAtWave: 2,
  },
  waves: waves([
    ['Both shores wake', '10 grub @n, 10 grub @s +1'],
    ['Splitters', '4 splitter @n /2, 4 splitter @s /2 +1'],
    ['Shades in the beam', '6 shade @n /1.2, 6 shade @s /1.2 +2, 8 grub @n +4'],
    ['Moths off the rocks', '12 moth @n /0.7, 12 skitter @s /0.5'],
    ['Splitter swarm', '8 splitter @n /1.2, 8 splitter @s /1.2 +3'],
    ['Sea-cave awakens!', '12 splitter @n /1.1, 16 grub @s +1 /0.6'],
    ['Shells in the dark', '5 shell @n /2.2, 10 shade @s /0.9'],
    ['Moth cloud', '20 moth @n /0.5, 20 moth @s /0.5 +2'],
    ['The breakers', '8 splitter @n /1.1, 8 splitter @s /1.1, 6 shell @n +6 /2, 12 shade @s +10 /0.8'],
    ['Last light', '10 splitter @n /1.0, 10 splitter @s /1.0, 16 skitter @s +6 /0.35, 10 moth @n +10 /0.6'],
  ]),
};

const s9: StageDef = {
  id: 9, name: 'Storm Shelf', region: 1,
  twist: 'Monsoon rain weakens fire and doubles lightning arc reach. Pull the Viaduct Gate on the figure-8 overpass or watch the Wave 6 cutoff.',
  newFoe: 'Warden', unlocks: 'Tidewyrm boss stage',
  startGold: 480, lives: 20, towers: ALL, weather: 'rain', hpMul: 1.86,
  roads: [
    { id: 'main', spawn: 'w', w: 48, ctrl: [[-40, 125], [320, 130], [495, 240], [640, 360], [795, 475], [990, 500], [1110, 360], [990, 215], [795, 240], [640, 360], [495, 475], [350, 590], [640, 625], [940, 625], [1165, 610]] },
    { id: 'cutoff', spawn: 'w', w: 40, openAtWave: 6, ctrl: [[-40, 125], [320, 130], [495, 240], [315, 375], [350, 590], [640, 625], [940, 625], [1165, 610]] },
  ],
  waters: [],
  plots: P([640, 225], [640, 495], [485, 360], [795, 360], [970, 360], [240, 255], [210, 495], [530, 140], [895, 130], [1195, 245], [1195, 475], [230, 575]),
  bridges: [[640, 360, 0.64, 52]], rune: [930, 585], heroStart: [640, 450],
  switches: [{ id: 'viaduct', label: 'Viaduct Gate', at: [640, 360], mode: 'gate', closesB: ['main'], dur: 10, cd: 19 }],
  alt: {
    name: 'Backwash Squall',
    twist: 'The storm climbs in reverse from the south-east shelf to the north-west summit, and the flash-flood cutoff opens on Wave 3.',
    hpMul: 0.64,
    reverseRoads: ['main', 'cutoff'], openAtWave: { cutoff: 3 }, heroStart: [640, 260],
  },
  waves: waves([
    ['Rain on the viaduct', '14 grub /0.8'],
    ['Wardens march', '1 warden, 12 grub +1 /0.7'],
    ['Skitter rush', '24 skitter /0.35'],
    ['Splitters', '6 splitter /1.4, 10 grub +3'],
    ['Moths in the storm', '18 moth /0.55'],
    ['Flash flood cutoff!', '2 warden /8, 6 shell +2 /2'],
    ['Armor in the downpour', '10 shell /1.7, 16 grub +4 /0.6'],
    ['Splitting storm', '10 splitter /1, 24 skitter +5 /0.3'],
    ['Shade squall', '16 shade /0.6, 2 warden +4 /6'],
    ['The thunderhead', '3 warden /6, 10 shell +2 /1.6, 20 moth +6 /0.5'],
  ]),
};

const s10: StageDef = {
  id: 10, name: 'The Tidewyrm', region: 1,
  twist: 'Boss. Two east bridges alternate under rising tides. At Wave 5 the eastern strait drains into a central shoal; at 50% HP the Tidewyrm seals the north pass.',
  newFoe: 'The Tidewyrm', unlocks: 'Relic: Tide pearl (+15% tower range near water)',
  startGold: 640, lives: 20, towers: ALL, hpMul: 1.78,
  high: [[555, 245], [755, 245], [775, 360], [755, 475], [555, 475], [535, 360], [555, 245]],
  roads: [
    { id: 'north', spawn: 'w', w: 50, ctrl: [[1320, 220], [1110, 220], [990, 175], [868, 175], [685, 165], [610, 265], [565, 360], [415, 360], [260, 345], [250, 505], [135, 495]] },
    { id: 'south', spawn: 'w', w: 50, ctrl: [[1320, 220], [1110, 220], [1115, 480], [995, 545], [875, 535], [685, 565], [610, 460], [565, 360], [415, 360], [260, 345], [250, 505], [135, 495]] },
    { id: 'shoal', spawn: 'w', w: 42, openAtWave: 5, ctrl: [[1320, 220], [1110, 220], [1095, 360], [870, 360], [565, 360], [415, 360], [260, 345], [250, 505], [135, 495]] },
  ],
  waters: [
    { id: 'east_strait', w: 70, drainAtWave: 5, ctrl: [[900, -40], [870, 175], [840, 370], [880, 560], [920, 770]] },
    { id: 'west_strait', w: 70, ctrl: [[420, -40], [440, 185], [405, 385], [435, 575], [410, 770]] },
  ],
  plots: [
    ...P([665, 275], [665, 445], [745, 290], [525, 200], [525, 520], [960, 435], [975, 275], [1035, 445], [1225, 345], [295, 225], [160, 360], [335, 560]),
    { at: [815, 435], openAtWave: 5 },
  ],
  bridges: [[868, 175, -0.04, 58], [875, 535, 0.04, 58], [415, 360, -0.05, 58]], rune: [755, 650], heroStart: [520, 360],
  shifts: [
    { kind: 'tide', closes: ['north'], every: 50, start: 10, dur: 18, at: [868, 175], r: 58, label: 'High tide on the north-east bridge' },
    { kind: 'tide', closes: ['south'], every: 50, start: 35, dur: 18, at: [875, 535], r: 58, label: 'High tide on the south-east bridge' },
  ],
  terraforms: [
    { atWave: 5, kind: 'drain', label: 'Ebb tide exposes the center coral shoal!', waters: ['east_strait'], openRoads: ['shoal'], openPlots: [12] },
    { atPhase: 1, kind: 'flood', label: 'The Tidewyrm drowns the north pass. Everything comes by the south bridge and the shoal!', closeRoads: ['north'] },
  ],
  alt: {
    name: 'King Tide',
    twist: 'Tides surge every 40 seconds instead of 50, and driftwood ruins block the coral island plots.',
    hpMul: 1.05,
    shiftEveryMul: 0.8,
    rubblePlots: [{ plot: 0, kind: 'ruin', cost: 75, holdSec: 5 }, { plot: 1, kind: 'ruin', cost: 75, holdSec: 5 }],
  },
  waves: waves([
    ['The straits rise', '16 grub /0.7'],
    ['Splitters on the bridges', '8 splitter /1.2'],
    ['Wardens and moths', '2 warden /6, 10 moth +2 /0.7'],
    ['Armored shells', '7 shell /1.8'],
    ['The central shoal drains!', '10 splitter /1.0, 20 grub +2 /0.5'],
    ['Shades on the foam', '20 shade /0.6'],
    ['Spray of skitters', '40 skitter /0.25, 3 warden +6 /5'],
    ['The Tidewyrm', '1 tidewyrm, 10 moth +6 /0.9, 4 shell +12 /3, 6 splitter +24 /1.6'],
  ]),
};

/* =========================== Region 3: Cogwheel Foundry =========================== */

const s11: StageDef = {
  id: 11, name: 'Conveyor Hall', region: 2,
  twist: 'Three vertical drop-shafts with fast belts. Pull the Foundry Brake to slow the center belt, or clear jammed cranes.',
  newFoe: 'Mender', unlocks: 'Shop item: Cleaving spear',
  startGold: 520, lives: 20, towers: ALL, hpMul: 1.95,
  roads: [{ id: 'main', spawn: 'w', w: 50, ctrl: [[355, -40], [355, 220], [355, 550], [495, 610], [640, 550], [640, 350], [640, 155], [782, 110], [925, 155], [925, 380], [925, 620]] }],
  waters: [],
  plots: [
    ...P([235, 195], [235, 375], [235, 555], [497, 200]),
    { at: [497, 350], rubble: { kind: 'crane', cost: 70, holdSec: 5 } },
    ...P([497, 500], [783, 220]),
    { at: [783, 370], rubble: { kind: 'crane', cost: 70, holdSec: 5 } },
    ...P([783, 520], [1045, 210], [1045, 390], [1045, 560]),
  ],
  bridges: [], rune: [235, 650], heroStart: [640, 410],
  belts: [{ road: 'main', from: 0.08, to: 0.24, mult: 1.75 }, { road: 'main', from: 0.74, to: 0.9, mult: 1.75 }],
  switches: [{ id: 'brake', label: 'Conveyor Brake', at: [640, 350], mode: 'belt', targetRoad: 'main', beltMult: 0.55, dur: 11, cd: 18 }],
  portals: [{ id: 'chute_e', kind: 'chute', fromRoad: 'main', fromAt: 0.28, toRoad: 'main', toAt: 0.72, openAtWave: 5, everyNth: 4, groundOnly: true }],
  alt: {
    name: 'Express Shift',
    twist: 'Conveyors reverse from south-east to north-west and the overhead transfer chute opens on Wave 2.',
    hpMul: 0.62,
    reverseRoads: ['main'], heroStart: [355, 280], portalOpenAtWave: 2,
  },
  waves: waves([
    ['Grubs down the drop-shaft', '18 grub /0.6'],
    ['Menders enter the forge', '3 mender /4, 14 grub +1 /0.7'],
    ['Skitters at speed', '30 skitter /0.3'],
    ['Iron shells', '8 shell /1.8'],
    ['Overhead chute active!', '10 splitter /1'],
    ['Wardens on the line', '2 warden /6, 3 mender +2 /4, 16 grub +3 /0.6'],
    ['Moths in the rafters', '24 moth /0.45'],
    ['Shift change', '10 shell /1.4, 6 mender +3 /3, 30 skitter +10 /0.25'],
    ['Full output', '4 warden /5, 12 splitter +2 /1, 20 moth +8 /0.5, 6 mender +12 /3'],
  ]),
};

const s12: StageDef = {
  id: 12, name: 'Gear Garden', region: 2,
  twist: 'Dual interlocking cogwheels with A/B gears. Flip the Pinion Clutch at center to redirect spurs once Wave 5 unlocks.',
  newFoe: 'Burrower', unlocks: 'Bulwark tree',
  startGold: 560, lives: 20, towers: ALL, hpMul: 1.76,
  roads: [
    { id: 'main', spawn: 'w', w: 48, ctrl: [[-40, 370], [180, 375], [225, 535], [410, 600], [590, 520], [640, 360], [690, 200], [870, 120], [1055, 185], [1095, 355], [1035, 525], [1165, 580]] },
    { id: 'top',  spawn: 'n', w: 44, ctrl: [[640, -40], [640, 130], [640, 360], [690, 520], [870, 590], [1035, 525], [1165, 580]] },
    { id: 'spur', spawn: 'w', w: 40, openAtWave: 5, ctrl: [[-40, 370], [260, 210], [490, 210], [640, 360], [690, 520], [870, 590], [1035, 525], [1165, 580]] },
  ],
  waters: [],
  plots: [
    { at: [335, 455], gear: 'a' }, { at: [790, 275], gear: 'a' },
    { at: [950, 445], gear: 'a' }, { at: [1195, 255], gear: 'a' },
    { at: [485, 455], gear: 'b' }, { at: [950, 275], gear: 'b' },
    { at: [790, 445], gear: 'b' }, { at: [740, 650], gear: 'b' },
    { at: [295, 325] }, { at: [135, 195] }, { at: [120, 470] },
    { at: [515, 140] }, { at: [535, 650] },
  ],
  bridges: [], rune: [870, 355], heroStart: [640, 360],
  switches: [{ id: 'clutch', label: 'Pinion Clutch', at: [640, 360], mode: 'fork', closesA: ['spur'], closesB: ['main'], cd: 16 }],
  alt: {
    name: 'Inverted Gears',
    twist: 'A and B gear cycles swap waves and the west gear spur engages at Wave 2.',
    hpMul: 1.08,
    swapGears: true, openAtWave: { spur: 2 },
  },
  waves: waves([
    ['The garden wakes', '16 grub @w /0.7'],
    ['Burrowers dig in', '4 burrower @w /2, 10 grub @n /0.8'],
    ['Two fronts', '20 skitter @w /0.35, 10 skitter @n /0.5'],
    ['Shells and menders', '6 shell @w /2, 2 mender @n /5'],
    ['West spur engages!', '8 burrower @w /1.4, 5 burrower @n /1.8'],
    ['Splitters', '10 splitter @w /1.1, 4 splitter @n /2'],
    ['Moths', '16 moth @w /0.5, 10 moth @n /0.6'],
    ['Wardens', '2 warden @w /6, 1 warden @n, 16 grub @w +2 /0.5'],
    ['Iron and earth', '10 shell @w /1.4, 7 burrower @n /1.2, 4 mender @w +6 /3'],
    ['The garden turns', '3 warden @w /5, 6 burrower @n /1.4, 11 splitter @w +6 /1, 14 moth @n +10 /0.6'],
  ]),
};

const s13: StageDef = {
  id: 13, name: 'Steam Vents', region: 2,
  twist: 'Two central rifts split outward to opposing West and East gates! Stand Wren on steam vents for 2x blast tempo.',
  newFoe: 'Ash moth', unlocks: 'Shop item: Brass lantern',
  startGold: 580, lives: 20, towers: ALL, hpMul: 1.18,
  roads: [
    { id: 'upper', spawn: 'a', w: 48, ctrl: [[590, -40], [585, 160], [390, 170], [315, 290], [515, 385], [375, 520], [190, 500], [115, 365]] },
    { id: 'lower', spawn: 'b', w: 48, ctrl: [[690, 760], [695, 560], [890, 550], [965, 430], [765, 335], [905, 200], [1090, 220], [1165, 355]] },
    { id: 'pipe',  spawn: 'a', w: 40, openAtWave: 6, ctrl: [[590, -40], [585, 160], [515, 385], [375, 520], [190, 500], [115, 365]] },
  ],
  waters: [],
  plots: P([645, 290], [635, 435], [460, 260], [275, 405], [485, 585], [250, 180], [115, 565], [120, 235], [820, 465], [1005, 315], [795, 135], [1030, 540], [1165, 155]),
  bridges: [], rune: [500, 495], heroStart: [640, 360],
  vents: [
    { road: 'upper', at: 0.48, every: 7, dmg: 60 }, { road: 'lower', at: 0.48, every: 7, dmg: 60 },
    { road: 'upper', at: 0.8, every: 9, dmg: 80 }, { road: 'lower', at: 0.8, every: 9, dmg: 80 },
  ],
  switches: [{ id: 'valve', label: 'Manifold Valve', at: [585, 160], mode: 'fork', closesA: ['pipe'], closesB: ['upper'], cd: 16 }],
  alt: {
    name: 'Overpressure Boiler',
    twist: 'The centre exhaust pipe opens on Wave 2 and the Hollow adapts every 2 waves.',
    hpMul: 0.96,
    openAtWave: { pipe: 2 }, adaptEvery: 2,
  },
  waves: waves([
    ['Steam rising', '12 grub @a /0.8, 12 grub @b /0.8 +1'],
    ['Ash moths', '8 ashmoth @a /0.9, 8 ashmoth @b /0.9 +2'],
    ['Burrowers', '6 burrower @a /1.4, 6 burrower @b /1.4 +1'],
    ['Shells', '5 shell @a /2, 5 shell @b /2 +1'],
    ['Menders on both halls', '2 mender @a /5, 2 mender @b /5, 16 skitter @a +2 /0.4, 16 skitter @b +3 /0.4'],
    ['Center exhaust opens!', '16 ashmoth @a /0.5, 16 ashmoth @b /0.5 +3'],
    ['Wardens', '1 warden @a, 1 warden @b +2, 10 splitter @a +3 /1, 10 splitter @b +4 /1'],
    ['Heavy steam', '8 shell @a /1.6, 8 burrower @b /1.2, 12 ashmoth @a +8 /0.6'],
    ['Pressure', '2 warden @a /6, 2 warden @b /6, 10 shell @b +2 /1.5, 20 ashmoth @a +6 /0.5, 4 mender @b +10 /3'],
  ]),
};

const s14: StageDef = {
  id: 14, name: 'Assembly Line', region: 2,
  twist: 'Tri-bay diagonal lanes feed the NW Crucible. Use rail switches to force long loops; clear cranes & brace for Wave 5 drop chutes.',
  newFoe: 'Iron Shellback', unlocks: 'Shop item: Spear of dawn',
  startGold: 620, lives: 20, towers: ALL, hpMul: 0.88,
  roads: [
    { id: 'top',      spawn: 't', w: 46, ctrl: [[980, -40], [960, 130], [740, 175], [540, 260], [330, 225], [150, 175]] },
    { id: 'mid',      spawn: 'm', w: 46, ctrl: [[1320, 360], [1020, 360], [740, 360], [540, 260], [330, 225], [150, 175]] },
    { id: 'mid_loop', spawn: 'm', w: 40, ctrl: [[1320, 360], [1020, 360], [900, 560], [640, 520], [540, 260], [330, 225], [150, 175]] },
    { id: 'bot',      spawn: 'b', w: 46, ctrl: [[640, 760], [620, 570], [435, 465], [330, 225], [150, 175]] },
  ],
  waters: [],
  plots: [
    ...P([210, 305], [420, 130], [470, 355]),
    { at: [685, 260], rubble: { kind: 'crane', cost: 80, holdSec: 5 } },
    { at: [875, 255] },
    { at: [750, 445], rubble: { kind: 'crane', cost: 80, holdSec: 5 } },
    ...P([1045, 465], [1135, 260], [1100, 120], [765, 635], [470, 610], [305, 455]),
  ],
  bridges: [], rune: [1070, 560], heroStart: [365, 290],
  switches: [
    { id: 'rail_m', label: 'Mid Rail Switch', at: [1020, 360], mode: 'fork', closesA: ['mid_loop'], closesB: ['mid'], cd: 16 },
    { id: 'brake',  label: 'Crucible Brake',  at: [540, 260],  mode: 'gate', closesB: ['top'], dur: 10, cd: 18 },
  ],
  portals: [{ id: 'drop', kind: 'chute', fromRoad: 'bot', fromAt: 0.42, toRoad: 'mid', toAt: 0.68, openAtWave: 5, everyNth: 3, groundOnly: true }],
  alt: {
    name: 'Reverse Dispatch',
    twist: 'The foundry reverses: foes pour from NW out toward N, E and S docks.',
    hpMul: 1.06,
    reverseRoads: ['top', 'mid', 'mid_loop', 'bot'], heroStart: [760, 260],
  },
  waves: waves([
    ['Three bays start', '8 grub @t, 8 grub @m +1, 8 grub @b +2'],
    ['Iron off the line', '2 elite @m /4, 10 skitter @t /0.5, 10 skitter @b /0.5'],
    ['Burrowers', '6 burrower @t /1.4, 6 burrower @b /1.4 +1'],
    ['Ash moths', '12 ashmoth @m /0.6, 6 elite @m +4 /2.5'],
    ['Drop chute opens!', '3 mender @t /4, 3 mender @b /4, 20 grub @m /0.5'],
    ['Splitters', '8 splitter @t /1.1, 8 splitter @b /1.1'],
    ['Heavy line', '8 elite @m /2, 2 warden @t /6'],
    ['Full shift', '6 elite @t /2, 6 elite @b /2, 20 ashmoth @m +4 /0.5, 4 mender @m +8 /3'],
    ['Overtime', '3 warden @m /5, 10 elite @t /1.6, 12 burrower @b /1, 16 splitter @m +10 /0.8'],
  ]),
};

const s15: StageDef = {
  id: 15, name: 'The Brass Colossus', region: 2,
  twist: 'Boss. 320° siege ring around the elevated Hex Anvil Dais. Chill the Colossus to shatter brass plates; when he rages, he smashes open the center.',
  newFoe: 'The Brass Colossus', unlocks: 'Relic: Brass heart (+1 Wren skill point)',
  startGold: 680, lives: 20, towers: ALL, hpMul: 0.78,
  high: [[325, 225], [955, 225], [1015, 360], [955, 495], [325, 495], [265, 360], [325, 225]],
  roads: [
    { id: 'main',    spawn: 'w', w: 54, ctrl: [[1135, 760], [1135, 540], [1135, 215], [960, 120], [640, 115], [320, 120], [150, 215], [150, 490], [265, 610], [640, 620], [845, 605]] },
    { id: 'mid_cut', spawn: 'w', w: 42, openOnPhase: 1, ctrl: [[1135, 760], [1135, 540], [745, 360], [495, 360], [150, 490], [265, 610], [640, 620], [845, 605]] },
  ],
  waters: [],
  plots: [
    ...P([405, 265], [640, 265], [875, 265], [315, 360]),
    { at: [965, 360], rubble: { kind: 'crane', cost: 85, holdSec: 5 } },
    { at: [470, 455] },
    { at: [640, 455], rubble: { kind: 'crane', cost: 85, holdSec: 5 } },
    ...P([875, 455], [1225, 360], [1220, 145], [85, 145], [80, 390], [1010, 625]),
  ],
  bridges: [], rune: [640, 360], heroStart: [300, 560],
  terraforms: [
    { atPhase: 1, kind: 'quakelow', label: 'The Colossus smashes straight through the central Anvil Dais!', openRoads: ['mid_cut'] },
  ],
  alt: {
    name: 'Cold Iron Blackout',
    twist: 'Night falls on even waves and the central cut breaches early on Wave 3.',
    hpMul: 1.19,
    night: true, openAtWave: { mid_cut: 3 },
  },
  waves: waves([
    ['The anvil perimeter', '20 grub /0.5'],
    ['Iron Shellbacks', '6 elite /2'],
    ['Ash moths', '20 ashmoth /0.5'],
    ['Burrowers and menders', '10 burrower /1, 4 mender +2 /3'],
    ['Wardens', '3 warden /5, 20 skitter +2 /0.3'],
    ['Splitter pile', '16 splitter /0.8'],
    ['The Colossus wakes', '1 colossus, 8 elite +8 /3, 4 mender +14 /4, 20 ashmoth +24 /0.6'],
  ]),
};

/* =========================== Region 4: Ashen Rift =========================== */

const s16: StageDef = {
  id: 16, name: 'Ember Pass', region: 3, lava: true,
  twist: 'Diagonal caldera bridges cycling under magma shifts. Seal the center Obsidian Gate or anticipate the Wave 6 ash portal.',
  newFoe: 'Burrower swarm', unlocks: 'Shop item: Ember spear',
  startGold: 960, lives: 20, towers: ALL, hpMul: 0.9,
  roads: [
    { id: 'top', spawn: 'w', w: 46, ctrl: [[190, 760], [175, 520], [160, 290], [380, 130], [660, 130], [950, 165], [1125, 175]] },
    { id: 'mid', spawn: 'w', w: 46, ctrl: [[190, 760], [240, 570], [450, 490], [640, 360], [830, 230], [1000, 195], [1125, 175]] },
    { id: 'bot', spawn: 'w', w: 46, ctrl: [[190, 760], [420, 650], [720, 625], [895, 580], [1055, 430], [1080, 260], [1125, 175]] },
  ],
  waters: [{ w: 60, ctrl: [[220, -40], [380, 130], [640, 360], [895, 580], [1080, 770]] }],
  plots: [
    { at: [265, 395] },
    { at: [385, 290], rubble: { kind: 'slag', cost: 80, holdSec: 5 } },
    ...P([540, 520], [315, 600], [80, 410], [185, 175], [585, 215], [820, 355], [945, 365]),
    { at: [875, 445], rubble: { kind: 'slag', cost: 80, holdSec: 5 } },
    ...P([1185, 325], [430, 560], [1155, 535]),
  ],
  bridges: [[380, 130, 0, 56], [640, 360, -0.6, 56], [895, 580, -0.65, 56]], rune: [690, 520], heroStart: [900, 280],
  shifts: [
    { kind: 'lava', closes: ['top'], every: 54, start: 0, dur: 18, at: [380, 130], r: 56, label: 'Lava floods the north-west bridge' },
    { kind: 'lava', closes: ['mid'], every: 54, start: 18, dur: 18, at: [640, 360], r: 56, label: 'Lava floods the central arch' },
    { kind: 'lava', closes: ['bot'], every: 54, start: 36, dur: 18, at: [895, 580], r: 56, label: 'Lava floods the south-east gorge' },
  ],
  switches: [{ id: 'ob_gate', label: 'Obsidian Gate', at: [640, 360], mode: 'gate', closesB: ['mid'], dur: 10, cd: 19 }],
  portals: [{ id: 'ash_tube', kind: 'rift', fromRoad: 'top', fromAt: 0.4, toRoad: 'mid', toAt: 0.58, openAtWave: 6, everyNth: 4, groundOnly: true }],
  alt: {
    name: 'Triple Eruption',
    twist: 'Night settles through ash clouds and NE summit descends toward SW.',
    hpMul: 0.95,
    night: true, reverseRoads: ['top', 'mid', 'bot'], heroStart: [420, 520],
  },
  waves: waves([
    ['Ash on the wind', '20 grub /0.5'],
    ['Burrower swarm', '14 burrower /0.7'],
    ['Ash moths', '20 ashmoth /0.45'],
    ['Iron', '8 elite /1.8'],
    ['Splitters', '14 splitter /0.8'],
    ['Ash portal tears open!', '3 warden /5, 4 mender +2 /3, 20 grub +3 /0.4'],
    ['Shades through the smoke', '24 shade /0.5'],
    ['Deep burrow', '24 burrower /0.5, 6 elite +6 /2'],
    ['The pass burns', '4 warden /4, 12 elite +2 /1.4, 24 ashmoth +8 /0.4, 16 burrower +14 /0.6'],
  ]),
};

const s17: StageDef = {
  id: 17, name: 'Avalanche Ridge', region: 3, lava: true,
  twist: 'NE→W→SE horseshoe around a collapsing high ridge. Wave 4 cracks a steep scree slide while avalanches bury plots.',
  newFoe: 'Iron swarm', unlocks: 'Shop item: Dawn mantle',
  startGold: 720, lives: 20, towers: ALL, hpMul: 1.63,
  high: [[345, 210], [1280, 210], [1280, 505], [345, 505], [260, 360], [345, 210]],
  roads: [
    { id: 'main',  spawn: 'w', w: 50, ctrl: [[1320, 125], [960, 125], [560, 120], [270, 140], [160, 265], [155, 450], [280, 565], [580, 580], [920, 580], [1165, 585]] },
    { id: 'scree', spawn: 'w', w: 40, openAtWave: 4, ctrl: [[1320, 125], [960, 125], [705, 360], [580, 580], [920, 580], [1165, 585]] },
  ],
  waters: [{ w: 52, ctrl: [[30, 180], [75, 360], [30, 540]] }],
  plots: [
    { at: [355, 360], sinkAt: 4 }, { at: [485, 260], sinkAt: 7 }, { at: [485, 450], sinkAt: 10 },
    ...P([645, 235], [755, 225], [945, 265], [945, 445], [1130, 265], [105, 160], [105, 555], [465, 665], [825, 665]),
    { at: [785, 445], openAtWave: 4 },
  ],
  bridges: [], rune: [1040, 360], heroStart: [900, 560],
  switches: [{ id: 'rockfall', label: 'Scree Gate', at: [960, 125], mode: 'gate', closesB: ['main'], dur: 10, cd: 19 }],
  terraforms: [
    { atWave: 4, kind: 'quakelow', label: 'A rockslide carves a steep scree pass down the ridge!', openRoads: ['scree'], openPlots: [12] },
  ],
  portals: [{ id: 'lavatube', kind: 'tunnel', fromRoad: 'main', fromAt: 0.25, toRoad: 'scree', toAt: 0.65, openAtWave: 7, everyNth: 3, groundOnly: true }],
  alt: {
    name: 'Ridge Reversal',
    twist: 'Foes surge upward from the southern basin onto the crumbling eastern peak, on the ridge road and the scree alike.',
    hpMul: 0.65,
    reverseRoads: ['main', 'scree'], heroStart: [640, 220],
  },
  waves: waves([
    ['Onto the ridge', '24 grub /0.45'],
    ['Iron swarm', '10 elite /1.4'],
    ['Ash moths', '24 ashmoth /0.4'],
    ['Rockslide scree opens!', '20 burrower /0.6'],
    ['Splitters', '16 splitter /0.7'],
    ['Wardens', '4 warden /4, 24 skitter +2 /0.25'],
    ['Lava tube erupts!', '6 mender /2, 12 elite +2 /1.2'],
    ['Shades in the cinder', '30 shade /0.4'],
    ['Rockfall', '16 elite /1, 20 burrower +6 /0.5'],
    ['The ridge breaks', '5 warden /3, 20 splitter +3 /0.6, 30 ashmoth +10 /0.35, 8 mender +16 /2'],
  ]),
};

const s18: StageDef = {
  id: 18, name: 'Mirror Lake', region: 3, lava: true,
  twist: 'A centre rift feeds two opposite spirals, to a north-east and a south-west Keep. The Rift Divert sends the whole horde down one spiral at a time, and Wave 5 cools a third bridge.',
  newFoe: 'Everything doubled', unlocks: 'Shop item: Second dawn',
  startGold: 760, lives: 20, towers: ALL, hpMul: 1.32,
  roads: [
    { id: 'north', spawn: 'w', w: 48, ctrl: [[640, 360], [740, 360], [820, 480], [990, 515], [1065, 365], [960, 215], [1155, 175]] },
    { id: 'south', spawn: 'w', w: 48, ctrl: [[640, 360], [540, 360], [460, 240], [290, 205], [215, 355], [320, 505], [125, 545]] },
    { id: 'cross', spawn: 'w', w: 40, openAtWave: 5, ctrl: [[640, 360], [640, 195], [960, 215], [1155, 175]] },
  ],
  waters: [
    { id: 'lake_n', w: 64, drainAtWave: 5, ctrl: [[575, 155], [665, 195], [755, 225]] },
    { id: 'lake_s', w: 64, ctrl: [[525, 495], [615, 525], [695, 590]] },
  ],
  plots: [
    ...P([335, 355], [440, 385], [200, 210], [110, 370], [245, 615], [420, 610], [945, 365], [840, 335], [1080, 510], [1170, 350], [1045, 125], [860, 120]),
    { at: [750, 145], openAtWave: 5 },
  ],
  bridges: [], rune: [470, 140], heroStart: [640, 360],
  switches: [{ id: 'mirror_sw', label: 'Rift Divert', at: [640, 360], mode: 'fork', closesA: ['north'], closesB: ['south'], cd: 16 }],
  terraforms: [
    { atWave: 5, kind: 'drain', label: 'North magma lake cools into a stone cross-bridge!', waters: ['lake_n'], openRoads: ['cross'], openPlots: [12] },
  ],
  portals: [{ id: 'refl', kind: 'rift', fromRoad: 'south', fromAt: 0.48, toRoad: 'cross', toAt: 0.65, openAtWave: 7, everyNth: 4, groundOnly: true }],
  alt: {
    name: 'Inverted Reflections',
    twist: 'The outer corners become the rifts and every spiral feeds inward to one centre Keep.',
    hpMul: 0.72,
    reverseRoads: ['north', 'south', 'cross'],
  },
  waves: waves([
    ['Center rift opens', '24 grub /0.4'],
    ['Twins', '10 splitter /0.9'],
    ['Iron', '12 elite /1.2'],
    ['Ash moths', '18 ashmoth /0.4, 12 grub +2 /0.5'],
    ['North lake cools into a bridge!', '14 burrower /0.7, 10 grub +2 /0.5'],
    ['Wardens', '4 warden /3, 6 mender +2 /2'],
    ['Reflection portal wakes!', '24 shade /0.45, 8 elite +4 /1.5'],
    ['Mirror storm', '16 elite /0.9, 30 skitter +2 /0.2'],
    ['Double image', '4 warden /4, 14 splitter +3 /0.6, 20 ashmoth +10 /0.4, 6 mender +14 /2.5'],
  ]),
};

const s19: StageDef = {
  id: 19, name: 'The Hollow Gate', region: 3, lava: true,
  twist: 'Four-corner radial crucible converging on the Center Keep. Rifts awaken wave by wave while the Hollow adapts every wave.',
  newFoe: 'All of them', unlocks: 'Capstones in every tree',
  startGold: 1120, lives: 20, towers: ALL, adaptEvery: 1, hpMul: 0.92,
  roads: [
    { id: 'nw', spawn: 'nw', w: 44, ctrl: [[-40, 140], [210, 145], [350, 255], [500, 285], [640, 360]] },
    { id: 's',  spawn: 's',  w: 44, ctrl: [[1320, 580], [1070, 575], [930, 465], [780, 435], [640, 360]] },
    { id: 'n',  spawn: 'n',  w: 44, openAtWave: 3, ctrl: [[1320, 140], [1070, 145], [930, 255], [780, 285], [640, 360]] },
    { id: 'sw', spawn: 'sw', w: 44, openAtWave: 5, ctrl: [[-40, 580], [210, 575], [350, 465], [500, 435], [640, 360]] },
  ],
  waters: [{ w: 44, ctrl: [[640, -40], [640, 175]] }, { w: 44, ctrl: [[640, 770], [640, 545]] }],
  plots: [
    ...P([275, 360], [445, 360], [1005, 360], [835, 360], [515, 185], [765, 185], [370, 140], [910, 140], [515, 535], [765, 535], [370, 580], [910, 580]),
    { at: [640, 255], rubble: { kind: 'slag', cost: 90, holdSec: 5 } },
    { at: [640, 465], rubble: { kind: 'slag', cost: 90, holdSec: 5 } },
  ],
  bridges: [], rune: [565, 360], heroStart: [540, 360],
  switches: [{ id: 'col_seal', label: 'Crucible Seal', at: [500, 285], mode: 'gate', closesB: ['nw'], dur: 10, cd: 19 }],
  portals: [{ id: 'quad_rift', kind: 'rift', fromRoad: 'n', fromAt: 0.35, toRoad: 's', toAt: 0.65, openAtWave: 7, everyNth: 3, groundOnly: true }],
  alt: {
    name: 'All Four From Dawn',
    twist: 'All four corner rifts are lit from Wave 1 and each sends its own splinter of the horde.',
    hpMul: 1.1,
    openAtWave: { n: 1, sw: 1 },
  },
  waves: waves([
    ['Two corners breach', '14 grub @nw, 14 grub @s +1'],
    ['Iron on the ramps', '6 elite @nw /2, 10 skitter @s /0.4'],
    ['North-East corner tears open!', '10 shade @n /0.8, 6 burrower @nw /1.2'],
    ['Ash and splitters', '16 ashmoth @nw /0.5, 10 splitter @n /1'],
    ['South-West breaches: all 4 active!', '1 warden @nw, 1 warden @sw, 1 warden @n, 1 warden @s, 24 grub @nw +4 /0.3'],
    ['Menders', '4 mender @n /3, 4 mender @s /3, 12 elite @nw /1.4'],
    ['Burrow & warp portal', '8 burrower @nw /1, 8 burrower @sw /1, 6 burrower @n /1.2'],
    ['Moth storm', '24 moth @n /0.4, 24 ashmoth @s /0.4'],
    ['Iron tide', '12 elite @nw /1, 12 elite @sw /1, 3 warden @n +4 /4'],
    ['The Gate opens', '4 warden @nw /4, 16 splitter @sw /0.7, 30 shade @s /0.3, 24 ashmoth @n /0.4, 8 mender @nw +10 /2'],
  ]),
};

const s20: StageDef = {
  id: 20, name: 'The Hollow Queen', region: 3, lava: true,
  twist: 'Final boss. 4 Cathedral naves around a central Royal Altar. At Wave 4 inner naves crack open; each Queen phase breaks a new path & floods the floor.',
  newFoe: 'The Hollow Queen', unlocks: 'The ending',
  startGold: 1320, lives: 20, towers: ALL, hpMul: 0.75,
  high: [[485, 145], [795, 145], [825, 290], [755, 390], [525, 390], [455, 290], [485, 145]],
  roads: [
    { id: 'high',     spawn: 'nw', w: 44, ctrl: [[240, -40], [210, 130], [160, 290], [220, 480], [420, 575], [640, 625]] },
    { id: 'mid',      spawn: 'nw', w: 44, openAtWave: 4, ctrl: [[240, -40], [270, 135], [375, 285], [440, 445], [640, 470], [640, 625]] },
    { id: 'low',      spawn: 'ne', w: 44, ctrl: [[1040, -40], [1070, 130], [1120, 290], [1060, 480], [860, 575], [640, 625]] },
    { id: 'causeway', spawn: 'ne', w: 40, openOnPhase: 1, ctrl: [[1040, -40], [1010, 135], [905, 285], [840, 445], [640, 470], [640, 625]] },
  ],
  waters: [{ w: 46, ctrl: [[50, 160], [65, 360], [50, 560]] }, { w: 46, ctrl: [[1230, 160], [1215, 360], [1230, 560]] }],
  plots: [
    ...P([525, 240], [755, 240], [560, 345], [720, 345], [265, 290], [315, 445], [125, 185], [270, 610], [1015, 290], [965, 445], [1155, 185], [1010, 610], [525, 535], [755, 535]),
  ],
  bridges: [], rune: [640, 115], heroStart: [640, 485],
  terraforms: [
    { atWave: 4, kind: 'quakelow', label: 'The central west cloister tears open!', openRoads: ['mid'] },
    { atPhase: 1, kind: 'raisehigh', label: 'Queen Phase 1: The eastern causeway shatters open!', openRoads: ['causeway'], sinkPlots: [6] },
    { atPhase: 2, kind: 'flood', label: 'Queen Phase 2: Magma floods the eastern outer cloister. Everything surges inward!', closeRoads: ['low'], sinkPlots: [10] },
  ],
  portals: [{ id: 'queen_rift', kind: 'rift', fromRoad: 'high', fromAt: 0.42, toRoad: 'mid', toAt: 0.62, openAtWave: 6, everyNth: 3, groundOnly: true }],
  alt: {
    name: 'Ashen Eclipse',
    twist: 'The Queen shrouds her cathedral in darkness and adapts every 2 waves.',
    hpMul: 0.87,
    openAtWave: { mid: 2 }, adaptEvery: 2, night: true,
  },
  waves: waves([
    ['Her heralds', '24 grub @nw /0.4, 12 grub @ne /0.5'],
    ['Iron court', '8 elite @nw /1.5, 8 burrower @ne /1'],
    ['Ash wings', '18 ashmoth @nw /0.45, 14 moth @ne /0.5, 12 grub @nw +4 /0.5'],
    ['Inner nave fractures!', '20 splitter @nw /0.6, 6 mender @ne /2'],
    ['The guard', '4 warden @nw /4, 10 elite @ne /1.4'],
    ['Shadows', '14 shade @nw /0.6, 8 burrower @ne /0.9, 10 grub @nw +3 /0.5'],
    ['The Hollow Queen', '1 queen @nw, 4 warden @ne +4 /5, 12 elite @nw +12 /1.5, 18 ashmoth @ne +20 /0.5, 6 mender @nw +30 /3'],
  ]),
};

export const STAGES: StageDef[] = [s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12, s13, s14, s15, s16, s17, s18, s19, s20];

export const stageById = (id: number): StageDef => {
  const s = STAGES.find(x => x.id === id);
  if (!s) throw new Error(`No stage ${id}`);
  return s;
};

/** Rift ids used by a stage, each with the roads that leave it. */
export function spawnsOf(st: StageDef): Map<string, Road[]> {
  const m = new Map<string, Road[]>();
  for (const r of st.roads) m.set(r.spawn, [...(m.get(r.spawn) ?? []), r]);
  return m;
}
