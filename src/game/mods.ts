import type { Rounds, TowerKind } from './data/towers';
import { NODES } from './data/trees';

/** Every campaign bonus that changes a battle, folded into plain numbers. */
export interface Mods {
  towerDmg: Record<TowerKind, number>;
  towerRange: Record<TowerKind, number>;
  dmgAll: number;
  rangeAll: number;
  armorPierce: number;
  blast: number;
  slow: number;
  jumps: number;
  hold: number;
  costMul: number;
  rounds: Rounds[];
  shatter: boolean;
  overload: boolean;
  burnShatter: boolean;
  roundInherit: boolean;
  runeAttune: boolean;
  gateShock: boolean;
  rateAll: number;
  heroLevel: number;
  heroSkillPoints: number;
  sweep: number;
  snare: number;
  attune: number;
  sunrise: number;
  lastHit: number;
  lives: number;
  gold: number;
  sell: number;
  early: number;
  ironGate: boolean;
  /** Tidewyrm relic: towers built near water gain +15% range. */
  tidePearl: boolean;
  /** Towers, hero skills and shop items open so far. */
  splits: boolean;
  skillW: boolean;
  skillR: boolean;
  shopAfter: number;
}

const zero = (): Record<TowerKind, number> => ({ watch: 0, cannon: 0, bell: 0, pylon: 0, roots: 0, beacon: 0 });

export function baseMods(): Mods {
  return {
    towerDmg: zero(), towerRange: zero(), dmgAll: 0, rangeAll: 0, armorPierce: 0, blast: 0, slow: 0, jumps: 0, hold: 0, costMul: 0,
    rounds: [], shatter: false, overload: false, burnShatter: false, roundInherit: false, runeAttune: false, gateShock: false,
    rateAll: 0, heroLevel: 0, heroSkillPoints: 0, sweep: 0, snare: 0, attune: 0,
    sunrise: 0, lastHit: 0, lives: 0, gold: 0, sell: 0, early: 0, ironGate: false, tidePearl: false,
    splits: true, skillW: true, skillR: true, shopAfter: 99,
  };
}

/** Fold bought tree nodes and campaign progress into one Mods object. */
export function buildMods(nodeIds: Iterable<string>, cleared: number): Mods {
  const m = baseMods();
  for (const id of nodeIds) {
    const n = NODES.get(id);
    if (!n) continue;
    const e = n.effect;
    switch (e.k) {
      case 'towerDmg': m.towerDmg[e.tower] += e.v; break;
      case 'towerRange': m.towerRange[e.tower] += e.v; break;
      case 'round': if (!m.rounds.includes(e.round)) m.rounds.push(e.round); break;
      case 'shatter': m.shatter = true; break;
      case 'overload': m.overload = true; break;
      case 'burnShatter': m.burnShatter = true; break;
      case 'roundInherit': m.roundInherit = true; break;
      case 'runeAttune': m.runeAttune = true; break;
      case 'gateShock': m.gateShock = true; m.lives += 8; break;
      case 'ironGate': m.ironGate = true; break;
      case 'costMul': m.costMul += e.v; break;
      case 'heroLevel': m.heroLevel += e.v; break;
      default: (m[e.k] as number) += e.v;
    }
    if (n.id === 'ar-tempest') m.rateAll += 0.08;
    if (n.id === 'wr-beacon') m.sunrise += 2;
  }
  // Relics from the four bosses.
  if (cleared >= 5) m.dmgAll += 0.1;
  if (cleared >= 10) m.tidePearl = true;
  if (cleared >= 15) m.heroSkillPoints += 1;
  if (cleared >= 20) m.dmgAll += 0.1;
  m.skillW = cleared >= 1;
  m.skillR = cleared >= 7;
  m.splits = cleared >= 8;
  m.shopAfter = cleared;
  return m;
}
