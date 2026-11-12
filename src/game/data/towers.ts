export type TowerKind = 'watch' | 'cannon' | 'bell' | 'pylon' | 'roots' | 'beacon';
export type Element = 'pierce' | 'fire' | 'frost' | 'storm' | 'nature' | 'hero';
export type Rounds = 'ember' | 'frost' | 'storm';

export const MAX_TOWER_LEVEL = 5;

export interface SplitDef {
  id: 'a' | 'b';
  name: string;
  desc: string;
  cost: number;
  /** Level 5 Split Mastery cost and visible mastery upgrade description. */
  masteryCost: number;
  masteryName: string;
  masteryDesc: string;
  /** Declarative Lv 4 baseline stats so TS, UI previews, and Swift read one source of truth. */
  dmgMul: number;
  rangeMul: number;
  rateMul: number;
  crit?: number;
  shells?: number;
  jumpsDelta?: number;
  jumpsOverride?: number;
  splashMul?: number;
}

export interface TowerDef {
  kind: TowerKind;
  name: string;
  blurb: string;
  element: Element;
  /** Cost to build (index 0) and to reach level 2 and 3. */
  cost: [number, number, number];
  dmg: [number, number, number];
  range: [number, number, number];
  /** Seconds between attacks. */
  rate: [number, number, number];
  hitsFlying: boolean;
  splits: [SplitDef, SplitDef];
}

export const TOWERS: Record<TowerKind, TowerDef> = {
  watch: {
    kind: 'watch', name: 'Watch tower', element: 'pierce',
    blurb: 'Ballista bolts. Fast, long range, single target.',
    cost: [70, 60, 90], dmg: [8, 14, 22], range: [230, 250, 270], rate: [0.6, 0.55, 0.5], hitsFlying: true,
    splits: [
      {
        id: 'a', name: 'Longbow spire',
        desc: '+30% range. 25% of bolts crit for triple damage.',
        cost: 140, masteryCost: 220, masteryName: 'Keenwind spire',
        masteryDesc: '+24% damage, +10% crit chance, and crits stagger non-boss foes for 0.35 s.',
        dmgMul: 1.5, rangeMul: 1.3, rateMul: 1.0, crit: 0.25,
      },
      {
        id: 'b', name: 'Repeater',
        // Fixed math: 0.56 * 1.25 = 0.70 (previously 0.75 * 1.25 = 0.9375)
        desc: 'Fires more than twice as fast for 70% damage per bolt.',
        cost: 140, masteryCost: 220, masteryName: 'Twin drum repeater',
        masteryDesc: '+24% damage, and every 4th bolt fires a free twin bolt.',
        dmgMul: 0.7, rangeMul: 1.0, rateMul: 0.42,
      },
    ],
  },
  cannon: {
    kind: 'cannon', name: 'Forge cannon', element: 'fire',
    blurb: 'Lobbed shells that burst on the road. Breaks groups and armor.',
    cost: [100, 90, 130], dmg: [16, 30, 48], range: [200, 210, 220], rate: [1.6, 1.5, 1.4], hitsFlying: false,
    splits: [
      {
        id: 'a', name: 'Siege mortar',
        desc: '+50% range, +50% damage, faster shells and wider blast.',
        cost: 180, masteryCost: 260, masteryName: 'Grand siege mortar',
        masteryDesc: '+24% damage and +18% blast radius.',
        dmgMul: 1.875, rangeMul: 1.5, rateMul: 1.0, splashMul: 1.3,
      },
      {
        id: 'b', name: 'Scatter gun',
        desc: 'Three staggered shells spread along the road.',
        cost: 180, masteryCost: 260, masteryName: 'Tri-barrel salvo',
        masteryDesc: '+24% damage and +10% blast radius.',
        dmgMul: 0.8125, rangeMul: 1.0, rateMul: 1.0, shells: 3,
      },
    ],
  },
  bell: {
    kind: 'bell', name: 'Frost bell', element: 'frost',
    blurb: 'A ringing pulse that slows everything around it.',
    cost: [90, 70, 100], dmg: [2, 4, 6], range: [155, 170, 185], rate: [2, 1.9, 1.8], hitsFlying: true,
    splits: [
      {
        id: 'a', name: 'Glacier',
        desc: 'Every pulse freezes foes solid for 1 second.',
        cost: 160, masteryCost: 220, masteryName: 'Permafrost bell',
        masteryDesc: '+24% pulse damage, +8% pulse range and +0.4 s longer freeze.',
        dmgMul: 1.625, rangeMul: 1.1, rateMul: 1.0,
      },
      {
        id: 'b', name: 'Chime',
        desc: 'Slowed foes take 25% more damage from everything.',
        cost: 160, masteryCost: 220, masteryName: 'Harmonic resonance',
        masteryDesc: '+24% pulse damage and +8% pulse range.',
        dmgMul: 1.625, rangeMul: 1.1, rateMul: 1.0,
      },
    ],
  },
  pylon: {
    kind: 'pylon', name: 'Storm pylon', element: 'storm',
    blurb: 'Lightning that jumps between foes. Strong against swarms.',
    cost: [120, 100, 140], dmg: [10, 18, 28], range: [190, 200, 210], rate: [1.1, 1.05, 1], hitsFlying: true,
    splits: [
      {
        id: 'a', name: 'Tesla crown',
        desc: 'Lightning jumps to 3 more foes.',
        cost: 200, masteryCost: 280, masteryName: 'Arc-overlord crown',
        masteryDesc: '+24% damage and +1 extra chain jump.',
        dmgMul: 1.375, rangeMul: 1.0, rateMul: 1.0, jumpsDelta: 3,
      },
      {
        id: 'b', name: 'Rail',
        desc: 'One huge bolt for 5x damage (+35% vs held or frozen foes). No jumps.',
        cost: 200, masteryCost: 280, masteryName: 'Breach lance',
        masteryDesc: '+24% damage, and ignores 30% armor on non-boss targets.',
        dmgMul: 6.25, rangeMul: 1.0, rateMul: 1.3, jumpsOverride: 0,
      },
    ],
  },
  roots: {
    kind: 'roots', name: 'Root garden', element: 'nature',
    blurb: 'Thorns burst up through the road and hold a foe in place.',
    cost: [80, 70, 100], dmg: [6, 12, 18], range: [160, 170, 180], rate: [1.8, 1.7, 1.6], hitsFlying: false,
    splits: [
      {
        id: 'a', name: 'Bramble',
        desc: 'Roots catch every foe within a small area.',
        cost: 150, masteryCost: 210, masteryName: 'Heartwood bramble',
        masteryDesc: '+24% damage and +20 px catch radius.',
        dmgMul: 1.625, rangeMul: 1.0, rateMul: 1.0,
      },
      {
        id: 'b', name: 'Spore pod',
        desc: 'Leaves a poison cloud that hurts foes standing in it.',
        cost: 150, masteryCost: 210, masteryName: 'Blooming canopy',
        masteryDesc: '+24% cloud damage and +1 s cloud duration.',
        dmgMul: 1.625, rangeMul: 1.0, rateMul: 1.0,
      },
    ],
  },
  beacon: {
    kind: 'beacon', name: 'Beacon', element: 'fire',
    blurb: 'No attack. Its light boosts nearby towers and reveals Shades.',
    cost: [90, 80, 120], dmg: [0, 0, 0], range: [170, 185, 200], rate: [99, 99, 99], hitsFlying: false,
    splits: [
      {
        id: 'a', name: 'War drum',
        desc: 'Nearby towers also attack 20% faster.',
        cost: 160, masteryCost: 220, masteryName: 'Sovereign drum',
        masteryDesc: '+8% aura range, +6% aura damage, +8% drum speed.',
        dmgMul: 1.0, rangeMul: 1.1, rateMul: 1.0,
      },
      {
        id: 'b', name: 'Watchfire',
        desc: 'Nearby towers also gain 25% range.',
        cost: 160, masteryCost: 220, masteryName: 'Blazing lens',
        masteryDesc: '+8% aura range, +6% aura damage, +10% range boost.',
        dmgMul: 1.0, rangeMul: 1.1, rateMul: 1.0,
      },
    ],
  },
};

/** Damage bonus a beacon gives to towers in its light, by level (1..3), plus +0.05 at Lv 4 and +0.11 at Lv 5. */
export const BEACON_BUFF = [0.15, 0.2, 0.25];
export const SPLIT_MASTERY_DMG = 1.24;
export const SPLIT_MASTERY_RANGE = 1.08;

export const TOWER_ORDER: TowerKind[] = ['watch', 'cannon', 'bell', 'pylon', 'roots', 'beacon'];
