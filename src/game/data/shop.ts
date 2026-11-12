export type ItemId = 'boots' | 'blade' | 'ring' | 'plate' | 'cleave' | 'lantern' | 'dawnspear' | 'emberspear' | 'dawnmantle' | 'seconddawn';

export interface ItemDef {
  id: ItemId;
  name: string;
  cost: number;
  desc: string;
  /** Stage you must clear before the shop sells it. 0 = from the start. */
  after: number;
  speed?: number; dmg?: number; regen?: number; hp?: number; armor?: number; atkSpeed?: number;
  cleave?: number; sight?: number; sunder?: number; auraDmg?: number; revive?: boolean;
}

/**
 * Earlier unlocks give players genuine choices among the 4 bag slots starting in Region 1-2
 * instead of stalling 60% of the shop behind stages 12-19.
 */
export const ITEMS: Record<ItemId, ItemDef> = {
  boots: { id: 'boots', name: 'Clockwork boots', cost: 60, after: 0, speed: 0.4, desc: '+40% move speed.' },
  blade: { id: 'blade', name: 'Ember blade', cost: 110, after: 0, dmg: 12, desc: '+12 spear damage.' },
  ring: { id: 'ring', name: 'Ring of moss', cost: 80, after: 0, regen: 7, desc: '+7 health a second.' },
  plate: { id: 'plate', name: 'Warden\'s plate', cost: 150, after: 0, hp: 260, armor: 0.2, desc: '+260 health, takes 20% less damage.' },
  cleave: { id: 'cleave', name: 'Cleaving spear', cost: 240, after: 4, cleave: 0.5, desc: 'Each strike also hits foes beside the target for half damage.' },
  lantern: { id: 'lantern', name: 'Brass lantern', cost: 110, after: 6, sight: 100, desc: 'Wren lights hidden foes 100 px further away.' },
  dawnspear: { id: 'dawnspear', name: 'Spear of dawn', cost: 340, after: 9, dmg: 30, atkSpeed: 0.25, desc: '+30 damage and 25% faster strikes.' },
  emberspear: { id: 'emberspear', name: 'Ember spear', cost: 300, after: 11, dmg: 22, sunder: 0.25, desc: '+22 damage. Strikes burn foes and sunder armor (+25% damage taken).' },
  dawnmantle: { id: 'dawnmantle', name: 'Dawn mantle', cost: 330, after: 13, hp: 220, armor: 0.15, regen: 6, auraDmg: 0.12, desc: '+220 health, 15% less damage taken, +6 regen, and nearby towers deal 12% more damage.' },
  seconddawn: { id: 'seconddawn', name: 'Second dawn', cost: 390, after: 15, revive: true, desc: 'The first time Wren falls, she stands right back up. Used up.' },
};

export const ITEM_ORDER: ItemId[] = ['boots', 'blade', 'ring', 'plate', 'cleave', 'lantern', 'dawnspear', 'emberspear', 'dawnmantle', 'seconddawn'];
export const ITEM_SLOTS = 4;
export const SELL_ITEM = 0.5;
/** Courier fee when buying away from the Keep Gate while a wave is active. */
export const COURIER_SURCHARGE = 0.2;

export type RuneKind = 'haste' | 'double' | 'regen' | 'bounty';
export const RUNES: Record<RuneKind, { name: string; desc: string; dur: number; color: string }> = {
  haste: { name: 'Haste', desc: 'Wren moves twice as fast.', dur: 15, color: '#ff6a4a' },
  double: { name: 'Double damage', desc: 'Wren and towers near her hit twice as hard.', dur: 15, color: '#5ab4ff' },
  regen: { name: 'Regeneration', desc: 'Wren heals fast.', dur: 6, color: '#7fe07a' },
  bounty: { name: 'Bounty', desc: 'Gold and XP at once.', dur: 0, color: '#ffc845' },
};
export const RUNE_ORDER: RuneKind[] = ['haste', 'double', 'regen', 'bounty'];
/** First rune appears at 30 s, spawns every 60 s, and expires after 22 s if unclaimed. */
export const RUNE_FIRST = 30;
export const RUNE_EVERY = 60;
export const RUNE_LIFETIME = 22;
export const RUNE_WARN_SEC = 5;
