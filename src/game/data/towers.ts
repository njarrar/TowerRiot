export type TowerKind = 'watch' | 'cannon' | 'bell' | 'pylon' | 'roots' | 'beacon';
export type Element = 'pierce' | 'fire' | 'frost' | 'storm' | 'nature' | 'hero';
export type Rounds = 'ember' | 'frost' | 'storm';

export interface SplitDef { id: 'a' | 'b'; name: string; desc: string; cost: number }
export interface TowerDef {
  kind: TowerKind;
  name: string;
  blurb: string;
  element: Element;
  /** cost to build (index 0) and to reach level 2 and 3 */
  cost: [number, number, number];
  dmg: [number, number, number];
  range: [number, number, number];
  /** seconds between attacks */
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
      { id: 'a', name: 'Longbow spire', desc: '+30% range. 25% of bolts crit for triple damage.', cost: 140 },
      { id: 'b', name: 'Repeater', desc: 'Fires more than twice as fast for 70% damage per bolt.', cost: 140 },
    ],
  },
  cannon: {
    kind: 'cannon', name: 'Forge cannon', element: 'fire',
    blurb: 'Lobbed shells that burst on the road. Breaks groups and armor.',
    cost: [100, 90, 130], dmg: [16, 30, 48], range: [200, 210, 220], rate: [1.6, 1.5, 1.4], hitsFlying: false,
    splits: [
      { id: 'a', name: 'Siege mortar', desc: '+50% range and +30% damage.', cost: 180 },
      { id: 'b', name: 'Scatter gun', desc: 'Three shells per shot, each with 60% damage.', cost: 180 },
    ],
  },
  bell: {
    kind: 'bell', name: 'Frost bell', element: 'frost',
    blurb: 'A ringing pulse that slows everything around it.',
    cost: [90, 70, 100], dmg: [2, 4, 6], range: [140, 155, 170], rate: [2, 1.9, 1.8], hitsFlying: true,
    splits: [
      { id: 'a', name: 'Glacier', desc: 'Every pulse freezes foes solid for 1 second.', cost: 160 },
      { id: 'b', name: 'Chime', desc: 'Slowed foes take 25% more damage from everything.', cost: 160 },
    ],
  },
  pylon: {
    kind: 'pylon', name: 'Storm pylon', element: 'storm',
    blurb: 'Lightning that jumps between foes. Strong against swarms.',
    cost: [120, 100, 140], dmg: [10, 18, 28], range: [190, 200, 210], rate: [1.1, 1.05, 1], hitsFlying: true,
    splits: [
      { id: 'a', name: 'Tesla crown', desc: 'Lightning jumps to 3 more foes.', cost: 200 },
      { id: 'b', name: 'Rail', desc: 'One huge bolt for four times the damage. No jumps.', cost: 200 },
    ],
  },
  roots: {
    kind: 'roots', name: 'Root garden', element: 'nature',
    blurb: 'Thorns burst up through the road and hold a foe in place.',
    cost: [80, 70, 100], dmg: [6, 12, 18], range: [160, 170, 180], rate: [1.8, 1.7, 1.6], hitsFlying: false,
    splits: [
      { id: 'a', name: 'Bramble', desc: 'Roots catch every foe within a small area.', cost: 150 },
      { id: 'b', name: 'Spore pod', desc: 'Leaves a poison cloud that hurts foes standing in it.', cost: 150 },
    ],
  },
  beacon: {
    kind: 'beacon', name: 'Beacon', element: 'fire',
    blurb: 'No attack. Its light boosts nearby towers and reveals Shades.',
    cost: [90, 80, 120], dmg: [0, 0, 0], range: [170, 185, 200], rate: [99, 99, 99], hitsFlying: false,
    splits: [
      { id: 'a', name: 'War drum', desc: 'Nearby towers also attack 20% faster.', cost: 160 },
      { id: 'b', name: 'Watchfire', desc: 'Nearby towers also gain 25% range.', cost: 160 },
    ],
  },
};

/** Damage bonus a beacon gives to towers in its light, by level. */
export const BEACON_BUFF = [0.15, 0.2, 0.25];

export const TOWER_ORDER: TowerKind[] = ['watch', 'cannon', 'bell', 'pylon', 'roots', 'beacon'];
