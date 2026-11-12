import type { Rounds, TowerKind } from './towers';

export type TreeId = 'towerworks' | 'armory' | 'wren' | 'bulwark';

/** What a node changes. Every effect is a plain number or flag read from `Mods`. */
export type Effect =
  | { k: 'towerDmg'; tower: TowerKind; v: number }
  | { k: 'towerRange'; tower: TowerKind; v: number }
  | { k: 'dmgAll'; v: number }
  | { k: 'rangeAll'; v: number }
  | { k: 'armorPierce'; v: number }
  | { k: 'blast'; v: number }
  | { k: 'slow'; v: number }
  | { k: 'jumps'; v: number }
  | { k: 'hold'; v: number }
  | { k: 'costMul'; v: number }
  | { k: 'round'; round: Rounds }
  | { k: 'shatter' }
  | { k: 'overload' }
  | { k: 'burnShatter' }
  | { k: 'roundInherit' }
  | { k: 'runeAttune' }
  | { k: 'gateShock' }
  | { k: 'rateAll'; v: number }
  | { k: 'heroLevel'; v: number }
  | { k: 'sweep'; v: number }
  | { k: 'snare'; v: number }
  | { k: 'attune'; v: number }
  | { k: 'sunrise'; v: number }
  | { k: 'lastHit'; v: number }
  | { k: 'lives'; v: number }
  | { k: 'gold'; v: number }
  | { k: 'sell'; v: number }
  | { k: 'early'; v: number }
  | { k: 'ironGate' };

export interface TreeNode {
  id: string;
  name: string;
  desc: string;
  cost: number;
  req?: string;
  /** Optional stage that must be cleared before this node can be bought (capstones unlock after stage 14). */
  after?: number;
  /** Optional mutually exclusive capstone sibling id. */
  excl?: string;
  effect: Effect;
}
export interface TreeDef { id: TreeId; name: string; blurb: string; /** Stage that must be cleared to open the tree. */ after: number; nodes: TreeNode[] }

/**
 * Approved ~70% Ember scarcity:
 * - Total cost across all 4 trees (counting 1 exclusive capstone per tree) ~= 140 Embers vs ~100 standard campaign Embers.
 * - Trees open earlier (`wren` after 1, `armory` after 4, `bulwark` after 7) so build expression starts in Region 1-2.
 * - All Capstones open `after: 14` so Region 4 (Stages 15-20) tests real Capstone builds, not only Stage 20.
 * - Hoarding trap `bw-interest` removed; replaced with visible cross-tree Pillar-1 lattice hooks.
 */
export const TREES: TreeDef[] = [
  {
    id: 'towerworks', name: 'Towerworks', blurb: 'Stronger foundations, wider arcs and cheaper iron.', after: 0,
    nodes: [
      { id: 'tw-bolts', name: 'Sharp bolts', desc: 'Watch towers deal 18% more damage.', cost: 3, effect: { k: 'towerDmg', tower: 'watch', v: 0.18 } },
      { id: 'tw-iron', name: 'Hot iron', desc: 'Cannon blasts are 22% wider.', cost: 3, effect: { k: 'blast', v: 0.22 } },
      { id: 'tw-chill', name: 'Deep chill', desc: 'Frost bells slow 15% stronger.', cost: 4, req: 'tw-bolts', effect: { k: 'slow', v: 0.15 } },
      { id: 'tw-arcs', name: 'Long arcs', desc: 'Lightning jumps to one more foe.', cost: 4, req: 'tw-iron', effect: { k: 'jumps', v: 1 } },
      { id: 'tw-roots', name: 'Old roots', desc: 'Roots hold foes 0.5 s longer.', cost: 5, req: 'tw-chill', effect: { k: 'hold', v: 0.5 } },
      { id: 'tw-mason', name: 'Masonry', desc: 'Every tower build and upgrade costs 10% less.', cost: 6, req: 'tw-arcs', effect: { k: 'costMul', v: -0.1 } },
      { id: 'tw-arch', name: 'Grand architect', desc: 'Capstone: every tower deals 18% more damage.', cost: 10, req: 'tw-mason', after: 14, excl: 'tw-reach', effect: { k: 'dmgAll', v: 0.18 } },
      { id: 'tw-reach', name: 'High sightlines', desc: 'Capstone: every tower gains 14% range.', cost: 10, req: 'tw-roots', after: 14, excl: 'tw-arch', effect: { k: 'rangeAll', v: 0.14 } },
    ],
  },
  {
    id: 'armory', name: 'Armory', blurb: 'Elemental rounds loaded into towers and shared with Wren.', after: 4,
    nodes: [
      { id: 'ar-ember', name: 'Ember rounds', desc: 'Load a tower with ember rounds: hits burn for 2 s.', cost: 3, effect: { k: 'round', round: 'ember' } },
      { id: 'ar-frost', name: 'Frost rounds', desc: 'Load a tower with frost rounds: hits chill the foe.', cost: 3, effect: { k: 'round', round: 'frost' } },
      { id: 'ar-storm', name: 'Storm rounds', desc: 'Load a tower with storm rounds: hits can chain to a nearby foe.', cost: 3, effect: { k: 'round', round: 'storm' } },
      { id: 'ar-shatter', name: 'Shatter', desc: 'Chilled foes take 50% more fire damage.', cost: 4, req: 'ar-frost', effect: { k: 'shatter' } },
      { id: 'ar-overload', name: 'Overload', desc: 'Lightning on rooted or frozen foes jumps +2 times (Rail +35%).', cost: 4, req: 'ar-storm', effect: { k: 'overload' } },
      { id: 'ar-inherit', name: 'Borrowed edge', desc: 'Cross-tree: Wren inherits the loaded round of the nearest loaded tower.', cost: 6, req: 'ar-ember', effect: { k: 'roundInherit' } },
      { id: 'ar-pierce', name: 'Breach cores', desc: 'Capstone: every tower ignores 50% of foe armor.', cost: 10, req: 'ar-inherit', after: 14, excl: 'ar-tempest', effect: { k: 'armorPierce', v: 0.5 } },
      { id: 'ar-tempest', name: 'Chain conductor', desc: 'Capstone: Storm lightning jumps to +2 more foes and all towers attack 8% faster.', cost: 10, req: 'ar-overload', after: 14, excl: 'ar-pierce', effect: { k: 'jumps', v: 2 } },
    ],
  },
  {
    id: 'wren', name: 'Wren', blurb: 'Spear craft, field control and Keep synergies.', after: 1,
    nodes: [
      { id: 'wr-spear', name: 'Spearwork', desc: 'Spear Sweep deals 30% more damage.', cost: 3, effect: { k: 'sweep', v: 0.3 } },
      { id: 'wr-hunt', name: 'Bounty hunter', desc: 'Last hits pay 30% extra bonus gold.', cost: 3, effect: { k: 'lastHit', v: 0.3 } },
      { id: 'wr-snare', name: 'Long snare', desc: 'Lantern Snare holds 0.5 s longer.', cost: 4, req: 'wr-spear', effect: { k: 'snare', v: 0.5 } },
      { id: 'wr-attune', name: 'Bright attune', desc: 'Attune gives towers +10% faster attack speed.', cost: 4, req: 'wr-hunt', effect: { k: 'attune', v: 0.1 } },
      { id: 'wr-veteran', name: 'Veteran', desc: 'Wren starts every battle at level 3.', cost: 6, req: 'wr-snare', effect: { k: 'heroLevel', v: 2 } },
      { id: 'wr-shatter', name: 'Kindled steel', desc: 'Cross-tree: Spear Sweep and Lantern Burn shatter chilled foes (+50%).', cost: 5, req: 'wr-attune', effect: { k: 'burnShatter' } },
      { id: 'wr-champion', name: 'Dawn champion', desc: 'Capstone: Wren starts every stage 2 levels higher.', cost: 10, req: 'wr-veteran', after: 14, excl: 'wr-beacon', effect: { k: 'heroLevel', v: 2 } },
      { id: 'wr-beacon', name: 'Keeper\'s vow', desc: 'Capstone: Attune gives +18% attack speed and Sunrise lasts +2 s.', cost: 10, req: 'wr-shatter', after: 14, excl: 'wr-champion', effect: { k: 'attune', v: 0.18 } },
    ],
  },
  {
    id: 'bulwark', name: 'Bulwark', blurb: 'Keep defenses, tactical field timing and recovery.', after: 7,
    nodes: [
      { id: 'bw-walls', name: 'Thick walls', desc: '+10 lives every stage.', cost: 3, effect: { k: 'lives', v: 10 } },
      { id: 'bw-chest', name: 'War chest', desc: '+80 starting gold.', cost: 3, effect: { k: 'gold', v: 80 } },
      { id: 'bw-salvage', name: 'Field salvage', desc: 'Selling a tower returns 85% instead of 70%.', cost: 4, req: 'bw-chest', effect: { k: 'sell', v: 0.15 } },
      { id: 'bw-early', name: 'Early bell', desc: 'Calling a wave early pays 50% more gold.', cost: 3, req: 'bw-walls', effect: { k: 'early', v: 0.5 } },
      { id: 'bw-gate', name: 'Iron gate', desc: 'The first non-boss leak each wave costs no lives.', cost: 5, req: 'bw-early', effect: { k: 'ironGate' } },
      { id: 'bw-rune', name: 'Runic echo', desc: 'Cross-tree: Claiming a Rune grants +3 s Attune surge everywhere.', cost: 5, req: 'bw-salvage', effect: { k: 'runeAttune' } },
      { id: 'bw-citadel', name: 'Bastion bell', desc: 'Capstone: Keep Gate emits a shockwave pushing/stunning nearby foes on first leak + +8 lives.', cost: 10, req: 'bw-gate', after: 14, excl: 'bw-mint', effect: { k: 'gateShock' } },
      { id: 'bw-mint', name: 'Royal coffers', desc: 'Capstone: +180 starting gold every stage.', cost: 10, req: 'bw-rune', after: 14, excl: 'bw-citadel', effect: { k: 'gold', v: 180 } },
    ],
  },
];

export const NODES = new Map(TREES.flatMap(t => t.nodes.map(n => [n.id, n] as const)));
