import type { Rounds, TowerKind } from './towers';

export type TreeId = 'towerworks' | 'armory' | 'wren' | 'bulwark';

/** What a node changes. Every effect is a plain number the battle reads from `Mods`. */
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
  | { k: 'ironGate' }
  | { k: 'interest'; v: number };

export interface TreeNode {
  id: string;
  name: string;
  desc: string;
  cost: number;
  req?: string;
  /** Optional stage that must be cleared before this node can be bought (e.g. stage 19 capstones). */
  after?: number;
  /** Optional mutually exclusive capstone sibling id. */
  excl?: string;
  effect: Effect;
}
export interface TreeDef { id: TreeId; name: string; blurb: string; /** Stage that must be cleared to open the tree. */ after: number; nodes: TreeNode[] }

export const TREES: TreeDef[] = [
  {
    id: 'towerworks', name: 'Towerworks', blurb: 'Stronger towers.', after: 0,
    nodes: [
      { id: 'tw-bolts', name: 'Sharp bolts', desc: 'Watch towers deal 15% more damage.', cost: 2, effect: { k: 'towerDmg', tower: 'watch', v: 0.15 } },
      { id: 'tw-iron', name: 'Hot iron', desc: 'Cannon blasts are 20% wider.', cost: 2, effect: { k: 'blast', v: 0.2 } },
      { id: 'tw-chill', name: 'Deep chill', desc: 'Frost bells slow 15% more.', cost: 3, effect: { k: 'slow', v: 0.15 } },
      { id: 'tw-arcs', name: 'Long arcs', desc: 'Lightning jumps to one more foe.', cost: 3, req: 'tw-iron', effect: { k: 'jumps', v: 1 } },
      { id: 'tw-roots', name: 'Old roots', desc: 'Roots hold foes 0.4 s longer.', cost: 3, req: 'tw-chill', effect: { k: 'hold', v: 0.4 } },
      { id: 'tw-mason', name: 'Masonry', desc: 'Every tower costs 10% less.', cost: 5, req: 'tw-bolts', effect: { k: 'costMul', v: -0.1 } },
      { id: 'tw-arch', name: 'Grand architect', desc: 'Capstone: every tower deals 18% more damage.', cost: 8, req: 'tw-mason', after: 19, excl: 'tw-reach', effect: { k: 'dmgAll', v: 0.18 } },
      { id: 'tw-reach', name: 'High sightlines', desc: 'Capstone: every tower gains 14% range.', cost: 8, req: 'tw-roots', after: 19, excl: 'tw-arch', effect: { k: 'rangeAll', v: 0.14 } },
    ],
  },
  {
    id: 'armory', name: 'Armory', blurb: 'Rounds you load into towers.', after: 7,
    nodes: [
      { id: 'ar-ember', name: 'Ember rounds', desc: 'Load a tower with ember rounds: hits burn for two seconds.', cost: 2, effect: { k: 'round', round: 'ember' } },
      { id: 'ar-frost', name: 'Frost rounds', desc: 'Load a tower with frost rounds: hits chill the foe.', cost: 2, effect: { k: 'round', round: 'frost' } },
      { id: 'ar-storm', name: 'Storm rounds', desc: 'Load a tower with storm rounds: hits can jump to a second foe.', cost: 2, effect: { k: 'round', round: 'storm' } },
      { id: 'ar-shatter', name: 'Shatter', desc: 'Chilled foes take 50% more fire damage.', cost: 4, req: 'ar-frost', effect: { k: 'shatter' } },
      { id: 'ar-overload', name: 'Overload', desc: 'Lightning on a held or frozen foe jumps two more times (Rail deals +35% damage).', cost: 4, req: 'ar-storm', effect: { k: 'overload' } },
      { id: 'ar-quick', name: 'Quick load', desc: 'Every tower attacks 8% faster.', cost: 5, req: 'ar-ember', effect: { k: 'rateAll', v: 0.08 } },
      { id: 'ar-pierce', name: 'Breach cores', desc: 'Capstone: every tower ignores 50% of foe armor.', cost: 8, req: 'ar-quick', after: 19, excl: 'ar-tempest', effect: { k: 'armorPierce', v: 0.5 } },
      { id: 'ar-tempest', name: 'Chain conductor', desc: 'Capstone: Storm lightning jumps to two more foes.', cost: 8, req: 'ar-overload', after: 19, excl: 'ar-pierce', effect: { k: 'jumps', v: 2 } },
    ],
  },
  {
    id: 'wren', name: 'Wren', blurb: 'Talents for the hero.', after: 2,
    nodes: [
      { id: 'wr-spear', name: 'Spearwork', desc: 'Spear Sweep deals 25% more damage.', cost: 2, effect: { k: 'sweep', v: 0.25 } },
      { id: 'wr-hunt', name: 'Bounty hunter', desc: 'Last hits give 25% more gold on top.', cost: 2, effect: { k: 'lastHit', v: 0.25 } },
      { id: 'wr-snare', name: 'Long snare', desc: 'Lantern Snare holds 0.5 s longer.', cost: 3, req: 'wr-spear', effect: { k: 'snare', v: 0.5 } },
      { id: 'wr-attune', name: 'Bright attune', desc: 'Attune gives 10% more attack speed.', cost: 4, req: 'wr-hunt', effect: { k: 'attune', v: 0.1 } },
      { id: 'wr-veteran', name: 'Veteran', desc: 'Wren starts every stage at level 3.', cost: 4, req: 'wr-snare', effect: { k: 'heroLevel', v: 2 } },
      { id: 'wr-dawn', name: 'Long dawn', desc: 'Sunrise lasts 2 s longer.', cost: 4, req: 'wr-attune', effect: { k: 'sunrise', v: 2 } },
      { id: 'wr-champion', name: 'Dawn champion', desc: 'Capstone: Wren starts two levels higher.', cost: 8, req: 'wr-veteran', after: 19, excl: 'wr-beacon', effect: { k: 'heroLevel', v: 2 } },
      { id: 'wr-beacon', name: 'Keeper\'s vow', desc: 'Capstone: Attune gives nearby towers 18% more attack speed.', cost: 8, req: 'wr-dawn', after: 19, excl: 'wr-champion', effect: { k: 'attune', v: 0.18 } },
    ],
  },
  {
    id: 'bulwark', name: 'Bulwark', blurb: 'The Keep and its purse.', after: 12,
    nodes: [
      { id: 'bw-walls', name: 'Thick walls', desc: '+10 lives every stage.', cost: 3, effect: { k: 'lives', v: 10 } },
      { id: 'bw-chest', name: 'War chest', desc: '+80 starting gold.', cost: 3, effect: { k: 'gold', v: 80 } },
      { id: 'bw-salvage', name: 'Salvage', desc: 'Selling a tower returns 85% instead of 70%.', cost: 3, req: 'bw-chest', effect: { k: 'sell', v: 0.15 } },
      { id: 'bw-early', name: 'Early bell', desc: 'Calling a wave early pays 50% more.', cost: 2, req: 'bw-walls', effect: { k: 'early', v: 0.5 } },
      { id: 'bw-gate', name: 'Iron gate', desc: 'The first foe to reach the gate each wave costs no lives.', cost: 5, req: 'bw-early', effect: { k: 'ironGate' } },
      { id: 'bw-interest', name: 'Interest', desc: 'Earn 5% of banked gold after each wave, up to 40.', cost: 5, req: 'bw-salvage', effect: { k: 'interest', v: 0.05 } },
      { id: 'bw-citadel', name: 'Living bastion', desc: 'Capstone: +10 more lives every stage.', cost: 8, req: 'bw-gate', after: 19, excl: 'bw-mint', effect: { k: 'lives', v: 10 } },
      { id: 'bw-mint', name: 'Royal mint', desc: 'Capstone: +180 starting gold every stage.', cost: 8, req: 'bw-interest', after: 19, excl: 'bw-citadel', effect: { k: 'gold', v: 180 } },
    ],
  },
];

export const NODES = new Map(TREES.flatMap(t => t.nodes.map(n => [n.id, n] as const)));
