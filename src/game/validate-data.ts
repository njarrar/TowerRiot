import { TOWERS, TOWER_ORDER } from './data/towers';
import { ENEMIES } from './data/enemies';
import { HERO, SKILLS, SNARE } from './data/hero';
import { ITEMS, ITEM_ORDER, RUNES, RUNE_ORDER } from './data/shop';
import { TREES, NODES } from './data/trees';
import { STAGES, spawnsOf } from './data/stages';

/**
 * Collect-all declarative data & graph validator (inspired by TDAuto).
 * Returns a list of human-readable error strings; empty array means valid.
 */
export function validateGameData(): string[] {
  const errs: string[] = [];

  for (const k of TOWER_ORDER) {
    const t = TOWERS[k];
    if (!t) { errs.push(`missing tower ${k}`); continue; }
    if (t.cost.length !== 3 || t.dmg.length !== 3 || t.range.length !== 3 || t.rate.length !== 3) errs.push(`tower ${k} invalid array length`);
    if (t.splits.length !== 2) errs.push(`tower ${k} splits != 2`);
    for (const s of t.splits) {
      if (s.cost <= 0 || s.masteryCost <= 0) errs.push(`tower ${k}:${s.id} non-positive cost`);
      if (s.dmgMul <= 0 || s.rangeMul <= 0 || s.rateMul <= 0) errs.push(`tower ${k}:${s.id} invalid multiplier`);
    }
  }

  // Repeater Lv 4 net damage invariant: 0.70 per bolt (~0.56 * 1.25 legacy ratio eliminated)
  if (Math.abs(TOWERS.watch.splits[1].dmgMul - 0.7) > 1e-6) {
    errs.push(`watch:b Repeater dmgMul expected 0.7, got ${TOWERS.watch.splits[1].dmgMul}`);
  }

  for (const [k, e] of Object.entries(ENEMIES)) {
    if (e.hp <= 0 || e.speed <= 0 || e.leak < 1) errs.push(`enemy ${k} bad base stats`);
    if (e.traits?.splitInto && !ENEMIES[e.traits.splitInto.kind]) errs.push(`enemy ${k} unknown splitInto`);
    if (e.traits?.summon && !ENEMIES[e.traits.summon.kind]) errs.push(`enemy ${k} unknown summon`);
  }

  if (SNARE.burnSec <= 0 || SNARE.burnDpsMul <= 0) errs.push('SNARE burn DoT missing');
  if (HERO.leash < HERO.reach) errs.push('HERO.leash must be >= HERO.reach');
  for (const k of ['q', 'w', 'e', 'r'] as const) {
    const s = SKILLS[k];
    if (s.needLevel.length !== s.maxRank || s.cd.length !== s.maxRank) errs.push(`skill ${k} array length mismatch`);
  }

  for (const id of ITEM_ORDER) if (!ITEMS[id]) errs.push(`missing item ${id}`);
  for (const k of RUNE_ORDER) if (!RUNES[k]) errs.push(`missing rune ${k}`);

  // Tree DAG, req, excl, and capstone checks
  for (const tree of TREES) {
    const ids = new Set(tree.nodes.map(n => n.id));
    for (const n of tree.nodes) {
      if (n.cost <= 0) errs.push(`tree node ${n.id} cost <= 0`);
      if (n.req && !NODES.has(n.req)) errs.push(`tree node ${n.id} unknown req ${n.req}`);
      if (n.excl && !ids.has(n.excl)) errs.push(`tree node ${n.id} excl ${n.excl} not in same tree`);
      if (n.excl && (n.after ?? 0) > 14) errs.push(`capstone ${n.id} locked past stage 14`);
    }
  }

  // Stage ids, wave spawns, shifts, belts, vents, switches, portals
  if (STAGES.length !== 20) errs.push(`STAGES length=${STAGES.length} != 20`);
  for (const st of STAGES) {
    const sp = spawnsOf(st);
    const rIds = new Set(st.roads.map(r => r.id));
    const wIds = new Set(st.waters.map(w => w.id).filter(Boolean) as string[]);
    for (const w of st.waves) for (const g of w.groups) if (g.spawn && !sp.has(g.spawn)) errs.push(`stage ${st.id} unknown spawn @${g.spawn}`);
    for (const s of st.shifts ?? []) for (const c of s.closes) if (!rIds.has(c)) errs.push(`stage ${st.id} unknown shift road ${c}`);
    for (const b of st.barriers ?? []) if (!rIds.has(b.road)) errs.push(`stage ${st.id} unknown barrier road ${b.road}`);
    for (const b of st.belts ?? []) if (!rIds.has(b.road)) errs.push(`stage ${st.id} unknown belt road ${b.road}`);
    for (const v of st.vents ?? []) if (!rIds.has(v.road)) errs.push(`stage ${st.id} unknown vent road ${v.road}`);
    for (const sw of st.switches ?? []) {
      for (const c of sw.closesA ?? []) if (!rIds.has(c)) errs.push(`stage ${st.id} switch ${sw.id} unknown road ${c}`);
      for (const c of sw.closesB ?? []) if (!rIds.has(c)) errs.push(`stage ${st.id} switch ${sw.id} unknown road ${c}`);
      if (sw.targetRoad && !rIds.has(sw.targetRoad)) errs.push(`stage ${st.id} switch ${sw.id} unknown targetRoad ${sw.targetRoad}`);
      if (sw.mode !== 'fork' && (!sw.dur || sw.dur <= 0)) errs.push(`stage ${st.id} switch ${sw.id} must auto-expire (dur > 0)`);
    }
    for (const pt of st.portals ?? []) {
      if (!rIds.has(pt.fromRoad) || !rIds.has(pt.toRoad)) errs.push(`stage ${st.id} portal ${pt.id} bad road ref`);
      if (pt.fromRoad === pt.toRoad && pt.toAt <= pt.fromAt + 0.05) errs.push(`stage ${st.id} portal ${pt.id} self-loop risk`);
    }
    for (const tf of st.terraforms ?? []) {
      for (const wid of tf.waters ?? []) if (!wIds.has(wid)) errs.push(`stage ${st.id} terraform unknown water ${wid}`);
      for (const rid of [...(tf.openRoads ?? []), ...(tf.closeRoads ?? [])]) if (!rIds.has(rid)) errs.push(`stage ${st.id} terraform unknown road ${rid}`);
    }
  }

  return errs;
}
