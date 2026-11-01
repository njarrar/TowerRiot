import type { Element } from './towers';

export type EnemyKind =
  | 'grub' | 'skitter' | 'shell' | 'moth' | 'warden' | 'mender' | 'shade'
  | 'splitter' | 'sapper' | 'burrower' | 'ashmoth' | 'elite'
  | 'mireking' | 'tidewyrm' | 'colossus' | 'queen';

/** Special rules a foe follows. The battle code reads these flags, never the kind name. */
export interface Traits {
  /** Foes within this radius take 40% less damage. */
  shield?: number;
  /** Heals foes within 100 px by this share of their max health every 2 s. */
  heal?: number;
  /** Can only be targeted inside a beacon's light or near Wren. */
  stealth?: boolean;
  /** Spawns these foes where it dies. */
  splitInto?: { kind: EnemyKind; n: number };
  /** Stops at barriers on its road and chews through them. */
  sapper?: boolean;
  /** Seconds underground, then seconds on the surface. Untargetable underground. */
  burrow?: [number, number];
  /** Flat damage removed from every hit (scaled with stage). */
  armor?: number;
  /** Takes only this share of damage unless chilled. */
  plated?: number;
  /** Spawns n foes of kind every `every` seconds. */
  summon?: { kind: EnemyKind; n: number; every: number };
  /** Dives for `dur` seconds every `every` seconds, untargetable and healing 1% a second. */
  dive?: { every: number; dur: number };
  /** Below each health share: summons and a speed burst. */
  phases?: number[];
  boss?: boolean;
}

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  speed: number;
  gold: number;
  /** Lives lost if it reaches the gate. */
  leak: number;
  flying?: boolean;
  /** Damage taken per element (1 = normal). */
  takes?: Partial<Record<Element, number>>;
  /** Damage per second against Wren while she blocks it. */
  dps: number;
  /** Health bar height above the ground point, at scale 1. */
  bar: number;
  /** Size used by the renderer and by Wren's reach. */
  size: number;
  traits?: Traits;
  blurb: string;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  grub: { kind: 'grub', name: 'Grub', hp: 34, speed: 52, gold: 4, leak: 1, dps: 6, bar: 30, size: 1, blurb: 'Slow and soft. Comes in crowds.' },
  skitter: { kind: 'skitter', name: 'Skitter', hp: 18, speed: 104, gold: 3, leak: 1, dps: 4, bar: 22, size: 0.7, takes: { fire: 0.7 }, blurb: 'Very fast and frail. Fire struggles to catch it.' },
  shell: { kind: 'shell', name: 'Shellback', hp: 130, speed: 34, gold: 10, leak: 2, dps: 12, bar: 50, size: 1.3, takes: { pierce: 0.5, fire: 1.25 }, blurb: 'Heavy shell. Bolts do half damage, fire cracks it.' },
  moth: { kind: 'moth', name: 'Moth', hp: 30, speed: 78, gold: 5, leak: 1, dps: 0, bar: 62, size: 0.9, flying: true, blurb: 'Flies. Cannons and roots cannot reach it, Wren cannot block it.' },
  warden: { kind: 'warden', name: 'Warden', hp: 220, speed: 30, gold: 20, leak: 3, dps: 18, bar: 66, size: 1.7, takes: { storm: 1.3 }, traits: { shield: 110 }, blurb: 'Shields foes near it. Lightning hurts it most.' },
  mender: { kind: 'mender', name: 'Mender', hp: 60, speed: 44, gold: 8, leak: 1, dps: 5, bar: 34, size: 1, traits: { heal: 0.06 }, blurb: 'Heals foes around it. Kill it first.' },
  shade: { kind: 'shade', name: 'Shade', hp: 40, speed: 66, gold: 7, leak: 1, dps: 8, bar: 30, size: 0.95, traits: { stealth: true }, blurb: 'Unseen until a Beacon or Wren lights it.' },
  splitter: { kind: 'splitter', name: 'Splitter', hp: 70, speed: 48, gold: 6, leak: 1, dps: 8, bar: 36, size: 1.15, traits: { splitInto: { kind: 'skitter', n: 3 } }, blurb: 'Bursts into three Skitters when it dies.' },
  sapper: { kind: 'sapper', name: 'Sapper', hp: 80, speed: 46, gold: 8, leak: 1, dps: 10, bar: 34, size: 1.05, takes: { nature: 1.3 }, traits: { sapper: true }, blurb: 'Chews through wrecks and walls to open new roads.' },
  burrower: { kind: 'burrower', name: 'Burrower', hp: 90, speed: 58, gold: 9, leak: 1, dps: 9, bar: 30, size: 1.1, takes: { nature: 1.4 }, traits: { burrow: [2.2, 3] }, blurb: 'Digs under the road where nothing can reach it.' },
  ashmoth: { kind: 'ashmoth', name: 'Ash moth', hp: 48, speed: 84, gold: 7, leak: 1, dps: 0, bar: 62, size: 1, flying: true, takes: { fire: 0, frost: 1.3 }, blurb: 'Flies and cannot burn. Frost brings it down.' },
  elite: { kind: 'elite', name: 'Iron Shellback', hp: 200, speed: 32, gold: 16, leak: 2, dps: 16, bar: 54, size: 1.4, takes: { pierce: 0.8, fire: 1.2 }, traits: { armor: 4 }, blurb: 'Armored. Every hit loses a few points. Big hits win.' },
  mireking: { kind: 'mireking', name: 'The Mire King', hp: 2400, speed: 20, gold: 150, leak: 12, dps: 40, bar: 110, size: 3, traits: { boss: true, summon: { kind: 'grub', n: 2, every: 5 } }, blurb: 'Drags the swamp with him and spits out Grubs.' },
  tidewyrm: { kind: 'tidewyrm', name: 'The Tidewyrm', hp: 2000, speed: 26, gold: 200, leak: 12, dps: 50, bar: 90, size: 2.6, takes: { storm: 1.25 }, traits: { boss: true, dive: { every: 9, dur: 3 } }, blurb: 'Dives under the tide to heal. Hit it while it is up.' },
  colossus: { kind: 'colossus', name: 'The Brass Colossus', hp: 6000, speed: 16, gold: 260, leak: 12, dps: 70, bar: 140, size: 3.4, traits: { boss: true, plated: 0.35 }, blurb: 'Brass plates turn most damage. Chill it and the plates crack.' },
  queen: { kind: 'queen', name: 'The Hollow Queen', hp: 5500, speed: 22, gold: 400, leak: 12, dps: 90, bar: 130, size: 3.2, flying: false, traits: { boss: true, phases: [0.66, 0.33], summon: { kind: 'shade', n: 2, every: 7 } }, blurb: 'Rewrites the map as she falls. Three phases.' },
};

/** Health scale per stage so later stages hit harder. The Ashen Rift (16 to 20) climbs twice as fast, so the last region is the hardest. */
export const hpScale = (stage: number) => 1 + (stage - 1) * 0.06 + Math.max(0, stage - 15) * 0.1;
/** Gold per kill grows a little so later stages can afford their towers. */
export const goldScale = (stage: number) => 1.4 + (stage - 1) * 0.05;
/** Armor scales slower than health. */
export const armorScale = (_stage: number) => 1;
