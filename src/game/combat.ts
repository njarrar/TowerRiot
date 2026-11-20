import type { Element } from './data/towers';
import type { EnemyDef } from './data/enemies';
import { armorScale } from './data/enemies';
import type { Mods } from './mods';

export type DmgEl = Element | 'env';

export interface DamageTarget {
  hp: number;
  hitT: number;
  dead: boolean;
  under: boolean;
  hidden: boolean;
  shielded: boolean;
  vulnT: number;
  slowT: number;
  freezeT: number;
  phase?: number;
  drenchedT?: number;
  def: EnemyDef;
}

export interface DamageBreakdown {
  towers: number;
  hero: number;
  skills: number;
  status: number;
}

export type AttributionBucket = keyof DamageBreakdown;

export interface DamageContext {
  stageId: number;
  mods: Mods;
  resist: Record<Element, number>;
  dmgWindow: Record<Element, number>;
  breakdown: DamageBreakdown;
}

/**
 * Pure deterministic damage calculation + clamped adaptation accounting.
 * Returns `{ applied, clampedToHp }` where `clampedToHp` prevents massive Rail/Longbow
 * overkills from skewing the 42% Hollow Adaptation window.
 */
export function deliverDamage(
  ctx: DamageContext,
  f: DamageTarget,
  amount: number,
  el: DmgEl,
  options: { byHero: boolean; quiet?: boolean; armorPierceExtra?: number; bucket?: AttributionBucket; shatterSkill?: boolean },
): { applied: number; clamped: number; chilledShatter: boolean } {
  if (f.dead || f.under || amount <= 0) return { applied: 0, clamped: 0, chilledShatter: false };

  let m = el === 'env' ? 1 : (f.def.takes?.[el] ?? 1);
  if (el !== 'env' && el !== 'hero') m *= 1 - ctx.resist[el];
  if (f.shielded) m *= 0.6;
  if (f.vulnT > 0) m *= 1.25;
  if ((f.drenchedT ?? 0) > 0 && el === 'storm') m *= 1.4;

  const chilled = f.slowT > 0 || f.freezeT > 0;
  let chilledShatter = false;
  if (chilled && el === 'fire' && ctx.mods.shatter) {
    m *= 1.5;
    chilledShatter = true;
  }
  if (chilled && options.shatterSkill && ctx.mods.burnShatter) {
    m *= 1.5;
    chilledShatter = true;
  }
  if (f.def.traits?.plated && !chilled && !(f.def.traits.bossSkill === 'colossus' && (f.phase ?? 0) >= 1)) m *= f.def.traits.plated;

  let dmg = amount * m;
  const armor = f.def.traits?.armor;
  if (armor && !options.quiet) {
    const pierce = Math.min(1, ctx.mods.armorPierce + (options.armorPierceExtra ?? 0));
    dmg = Math.max(dmg * 0.15, dmg - armor * armorScale(ctx.stageId) * (1 - pierce));
  }
  if (dmg <= 0) return { applied: 0, clamped: 0, chilledShatter };

  const prevHp = Math.max(0, f.hp);
  const clamped = Math.min(prevHp, dmg);
  f.hp -= dmg;
  f.hitT = 0.12;

  if (el !== 'env' && el !== 'hero') ctx.dmgWindow[el] += clamped;
  const bucket: AttributionBucket = options.bucket ?? (options.quiet ? 'status' : options.byHero ? 'hero' : 'towers');
  ctx.breakdown[bucket] += clamped;

  return { applied: dmg, clamped, chilledShatter };
}
