/** Wren's in-match numbers. She starts each stage at level 1 and grows to 16, like a Dota hero. */
export const HERO = {
  maxLevel: 16,
  hp: 320, hpPerLevel: 34,
  dmg: 22, dmgPerLevel: 3.5,
  /** Seconds between spear strikes. */
  atkRate: 0.8,
  /** Reach of her spear, how far she steps on pin leash, and road hold radius. */
  reach: 62,
  /** Steps <= this from her pinned post stay anchored without dropping road block. */
  leash: 90,
  /** Legacy field retained in JSON for parity helpers; capped at leash on pin. */
  aggro: 90,
  speed: 130,
  regen: 3,
  /** Healing per second while she stands by the gate, like a fountain. */
  gateRegen: 40, gateRadius: 170,
  /** Ground foes she can hold on the road at once. */
  blocks: 2,
  /** She lights hidden foes within this radius. */
  sight: 140,
  /** XP is shared by foes dying within this radius. */
  xpRadius: 420,
  /** Share of XP she still gets from kills outside that radius (tightened so hero positioning matters). */
  xpFar: 0.15,
  /** Extra gold when Wren lands the killing blow. */
  lastHit: 0.5,
  respawnBase: 4,
  respawnPerLevel: 1,
} as const;

/** Seconds before dead Wren stands back up at the Keep gate. */
export const heroRespawn = (level: number) => HERO.respawnBase + HERO.respawnPerLevel * level;

/** XP needed to go from `level` to `level + 1`. */
export const xpToNext = (level: number) => 50 + 30 * level;

export type SkillKey = 'q' | 'w' | 'e' | 'r';

export interface SkillDef {
  key: SkillKey;
  name: string;
  desc: string;
  maxRank: number;
  /** Hero level needed for each rank (index rank - 1). Pure array for JSON/Swift parity. */
  needLevel: number[];
  /** Cooldown by rank (index rank - 1). Passives use 0. */
  cd: number[];
}

export const SKILLS: Record<SkillKey, SkillDef> = {
  q: {
    key: 'q', name: 'Spear Sweep',
    desc: 'Sweeps her spear in a circle. Hits every foe around her.',
    maxRank: 4, needLevel: [1, 3, 5, 7], cd: [10, 9, 8, 7],
  },
  w: {
    key: 'w', name: 'Lantern Snare',
    desc: 'Throws a lantern within leash range. Foes inside are rooted and burned for 2 s.',
    maxRank: 4, needLevel: [1, 3, 5, 7], cd: [16, 15, 14, 13],
  },
  e: {
    key: 'e', name: 'Attune',
    desc: 'Passive. Towers near Wren attack faster.',
    maxRank: 4, needLevel: [1, 3, 5, 7], cd: [0, 0, 0, 0],
  },
  r: {
    key: 'r', name: 'Sunrise',
    desc: 'Every tower fires twice as fast, and every hidden foe shows.',
    maxRank: 3, needLevel: [6, 11, 16], cd: [70, 60, 50],
  },
};

export const SWEEP = { dmg: [60, 100, 150, 220], radius: 100 };
export const SNARE = { hold: [1.2, 1.6, 2.0, 2.4], dmg: [30, 60, 90, 130], radius: 85, range: 200, burnSec: 2.0, burnDpsMul: 0.35 };
export const ATTUNE = { rate: [0.1, 0.18, 0.26, 0.34], radius: 160 };
export const SUNRISE = { dur: [5, 7, 9] };
