import { TOWERS, BEACON_BUFF, MAX_TOWER_LEVEL, SPLIT_MASTERY_DMG, SPLIT_MASTERY_RANGE, type TowerKind } from './data/towers';
import { ATTUNE, HERO } from './data/hero';
import { ITEMS, type ItemId } from './data/shop';
import type { Mods } from './mods';

export interface TowerEvalInput {
  kind: TowerKind;
  lv: number;
  split: 'a' | 'b' | null;
  high: boolean;
  nearWater: boolean;
  x: number;
  y: number;
  down: boolean;
}

export interface EvalBeacon {
  kind: TowerKind;
  lv: number;
  split: 'a' | 'b' | null;
  high: boolean;
  nearWater: boolean;
  x: number;
  y: number;
  down: boolean;
}

export interface TowerStats {
  dmg: number;
  range: number;
  rate: number;
  crit: number;
  jumps: number;
  splash: number;
  shells: number;
  hitsFlying: boolean;
  /** Active buff chips exposed to Tower Inspector UI (zero duplicated formulas). */
  buffs: string[];
}

export interface EvalContext {
  mods: Mods;
  beacons: EvalBeacon[];
  hero: { dead: boolean; x: number; y: number; rankE: number; items: ItemId[]; double: number; sunriseT: number };
  night: boolean;
  weather?: 'rain';
  inLighthouse: (x: number, y: number) => boolean;
  ell: (dx: number, dy: number) => number;
}

function beaconRange(b: EvalBeacon, mods: Mods): number {
  const bi = Math.min(b.lv, 3) - 1;
  const bw = mods.tidePearl && b.nearWater ? 0.15 : 0;
  const br = b.lv >= MAX_TOWER_LEVEL ? SPLIT_MASTERY_RANGE : 1;
  return TOWERS.beacon.range[bi] * (b.split ? 1.1 : 1) * br * (1 + mods.rangeAll + bw) * (b.high ? 1.2 : 1);
}

/**
 * Pure single-source-of-truth evaluator shared by simulation (`sim.ts`),
 * range previews (`scene.ts`), and Upgrade/Split delta bars (`battle.ts`).
 */
export function evalTowerStats(t: TowerEvalInput, ctx: EvalContext, lvOverride?: number, splitOverride?: 'a' | 'b' | null): TowerStats {
  const lv = lvOverride ?? t.lv;
  const split = splitOverride !== undefined ? splitOverride : t.split;
  const def = TOWERS[t.kind];
  const i = Math.min(lv, 3) - 1;
  const waterBonus = ctx.mods.tidePearl && t.nearWater ? 0.15 : 0;
  let dmg = def.dmg[i] * (1 + (ctx.mods.towerDmg[t.kind] ?? 0) + ctx.mods.dmgAll);
  let range = def.range[i] * (1 + (ctx.mods.towerRange[t.kind] ?? 0) + ctx.mods.rangeAll + waterBonus) * (t.high ? 1.2 : 1);
  let rate = def.rate[i];
  let crit = 0;
  let jumps = 2 + ctx.mods.jumps;
  let splash = 60 * (1 + ctx.mods.blast);
  let shells = 1;
  const buffs: string[] = [];

  if (t.high) buffs.push('High +20% rng');
  if (waterBonus > 0) buffs.push('Tide Pearl +15%');

  if (split) {
    const sp = def.splits.find(s => s.id === split)!;
    dmg *= sp.dmgMul;
    range *= sp.rangeMul;
    rate *= sp.rateMul;
    if (sp.crit) crit = sp.crit;
    if (sp.shells) shells = sp.shells;
    if (sp.jumpsDelta) jumps += sp.jumpsDelta;
    if (sp.jumpsOverride !== undefined) jumps = sp.jumpsOverride;
    if (sp.splashMul) splash *= sp.splashMul;

    if (lv >= MAX_TOWER_LEVEL) {
      if (t.kind !== 'beacon') {
        dmg *= SPLIT_MASTERY_DMG;
        if (t.kind === 'watch' && split === 'a') crit += 0.1;
        if (t.kind === 'cannon' && split === 'a') splash *= 1.18;
        if (t.kind === 'cannon' && split === 'b') splash *= 1.1;
        if (t.kind === 'pylon' && split === 'a') jumps += 1;
      }
      if (t.kind === 'beacon' || t.kind === 'bell') range *= SPLIT_MASTERY_RANGE;
    }
  }

  let rateMul = 1 + ctx.mods.rateAll;
  if (t.kind !== 'beacon') {
    let buff = 0, drum = 0, fire = 0;
    for (const b of ctx.beacons) {
      if (b.kind !== 'beacon' || b.down) continue;
      const bs = beaconRange(b, ctx.mods);
      if (ctx.ell(b.x - t.x, b.y - t.y) > bs) continue;
      const bi = Math.min(b.lv, 3) - 1;
      const splitBuff = b.lv >= MAX_TOWER_LEVEL ? 0.11 : b.lv >= 4 ? 0.05 : 0;
      buff = Math.max(buff, BEACON_BUFF[bi] + splitBuff);
      if (b.split === 'a') drum = Math.max(drum, b.lv >= MAX_TOWER_LEVEL ? 0.28 : 0.2);
      if (b.split === 'b') fire = Math.max(fire, b.lv >= MAX_TOWER_LEVEL ? 0.35 : 0.25);
    }
    if (buff > 0) buffs.push(`Beacon +${Math.round(buff * 100)}%`);
    if (drum > 0) buffs.push(`Drum +${Math.round(drum * 100)}% spd`);
    if (fire > 0) buffs.push(`Watchfire +${Math.round(fire * 100)}% rng`);
    dmg *= 1 + buff;
    rateMul += drum;
    range *= 1 + fire;
    if (ctx.night && buff === 0 && !ctx.inLighthouse(t.x, t.y)) {
      range *= 0.85;
      buffs.push('Night -15% rng');
    }
  }

  const h = ctx.hero;
  if (!h.dead && ctx.ell(h.x - t.x, h.y - t.y) < ATTUNE.radius) {
    if (h.rankE > 0) {
      const aRate = ATTUNE.rate[h.rankE - 1] + ctx.mods.attune;
      rateMul += aRate;
      buffs.push(`Attune +${Math.round(aRate * 100)}% spd`);
    }
    let aura = 0;
    for (const id of h.items) aura += ITEMS[id].auraDmg ?? 0;
    if (aura > 0) { dmg *= 1 + aura; buffs.push('Mantle +12%'); }
    if (h.double > 0) { dmg *= 2; buffs.push('2x Rune'); }
  }
  if (h.sunriseT > 0) { rateMul *= 2; buffs.push('Sunrise 2x'); }
  if (ctx.weather === 'rain' && def.element === 'fire') { dmg *= 0.8; buffs.push('Rain -20%'); }

  return { dmg, range, rate: rate / rateMul, crit, jumps, splash, shells, hitsFlying: def.hitsFlying, buffs };
}

export function previewBeaconRange(t: TowerEvalInput, mods: Mods): number {
  return beaconRange({ ...t, kind: 'beacon' }, mods);
}

/** Quick check used by tests & UI: hero leash distance stays consistent with data. */
export const HERO_LEASH_DEFAULT = HERO.leash;
