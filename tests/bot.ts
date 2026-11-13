import { Battle, ell } from '../src/game/sim';
import { stageById, type OathId, type StageVariant } from '../src/game/data/stages';
import { pointAt } from '../src/game/path';
import type { TowerKind } from '../src/game/data/towers';
import { ENEMIES } from '../src/game/data/enemies';
import { ITEM_ORDER } from '../src/game/data/shop';
import { buildMods, type Mods } from '../src/game/mods';
import { TREES } from '../src/game/data/trees';

export type HeroBotMode = 'active' | 'neverMoved' | 'pinnedOnce' | 'towersOnly' | 'heroOnly';

export interface BotOptions {
  variant?: StageVariant;
  oaths?: OathId[];
  heroMode?: HeroBotMode;
}

/** A plain, deterministic player used to check stage balance, Variant B, Oaths, and Pet Modes. */
export function playStage(id: number, mods?: Mods, seed = 7, maxSeconds = 1500, opts: BotOptions = {}) {
  const b = new Battle(stageById(id), { mods, seed, variant: opts.variant, oaths: opts.oaths });
  const heroMode = opts.heroMode ?? 'active';

  // Spread out: each pick favours plots that cover road no earlier pick covers.
  const samples = b.roads.flatMap(r => {
    const out: { x: number; y: number }[] = [];
    for (let d = 0; d < r.path.tot; d += 20) { const q = pointAt(r.path, d); out.push({ x: q.x, y: q.y }); }
    return out;
  });
  const seen = new Array(samples.length).fill(0);
  const order: number[] = [];
  const left = b.plots.map((_, i) => i);
  while (left.length) {
    let bi = 0, bs = -1;
    left.forEach((pi, k) => {
      const p = b.plots[pi];
      let sc = 0;
      samples.forEach((q, j) => { if (ell(q.x - p.x, q.y - p.y) < 210) sc += 1 / (1 + seen[j]); });
      if (sc > bs) { bs = sc; bi = k; }
    });
    const pi = left.splice(bi, 1)[0];
    order.push(pi);
    const p = b.plots[pi];
    samples.forEach((q, j) => { if (ell(q.x - p.x, q.y - p.y) < 210) seen[j]++; });
  }

  // Pick the highest road-density intersection/choke (62% if single-lane, or tightest multi-road crossing).
  let chokePt: { x: number; y: number } = pointAt(b.roads[0].path, b.roads[0].path.tot * 0.62);
  let bestHit = -1;
  for (const s of samples) {
    let hits = 0;
    for (const q of samples) if (Math.hypot(q.x - s.x, q.y - s.y) < 85) hits++;
    if (hits > bestHit) { bestHit = hits; chokePt = s; }
  }

  const shades = b.stage.waves.some(w => w.groups.some(g => ENEMIES[g.kind].traits?.stealth));
  // Hounds and Rams need something that slows or holds them, early.
  const control = b.stage.waves.some(w => w.groups.some(g => ENEMIES[g.kind].traits?.lunge || ENEMIES[g.kind].traits?.stamp));
  let air = 0, all = 0;
  for (const w of b.stage.waves) for (const g of w.groups) { const hp = g.n; all += hp; if (ENEMIES[g.kind].flying) air += hp; }
  const airy = air / Math.max(1, all) > 0.18;
  const base: TowerKind[] = airy
    ? ['watch', 'pylon', 'cannon', 'beacon', 'watch', 'bell', 'pylon', 'watch', 'cannon', 'pylon', 'watch', 'roots']
    : shades
      ? ['watch', 'cannon', 'beacon', 'bell', 'pylon', 'watch', 'cannon', 'roots', 'pylon', 'watch', 'cannon', 'pylon']
      : ['watch', 'cannon', 'bell', 'pylon', 'watch', 'cannon', 'roots', 'beacon', 'pylon', 'watch', 'cannon', 'pylon'];
  const rota: TowerKind[] = (control ? ['watch', 'bell', ...base] as TowerKind[] : base).filter(k => b.stage.towers.includes(k));
  let built = 0;
  let pinned = false;

  b.callWave();
  for (let t = 0; t < maxSeconds && !b.over; t += 0.5) {
    if (heroMode !== 'towersOnly') {
      b.autoLearn();
      const h = b.hero;
      const near = b.foes.filter(f => Math.hypot(f.x - h.x, f.y - h.y) < 100).length;
      if (near >= 3) b.castQ();
      if (near >= 2 && b.foes[0]) { const f = b.foes.reduce((a, c) => (c.d > a.d ? c : a)); b.castW(f.x, f.y); }
      if (b.foes.length > 12) b.castR();

      if (heroMode === 'pinnedOnce' && !pinned) {
        b.moveHero(chokePt.x, chokePt.y);
        pinned = true;
      } else if (heroMode === 'active') {
        const boss = b.foes.find(f => f.def.traits?.boss);
        if (boss && h.focus !== boss.id) b.attackFoe(boss.id);
      } else if (heroMode === 'heroOnly' && b.foes[0]) {
        const lead = b.foes.reduce((a, c) => (c.d > a.d ? c : a));
        if (Math.hypot(lead.x - h.x, lead.y - h.y) > 95) b.attackFoe(lead.id);
      }
    }

    // Trigger helpful tactical map switches when active foes are crowded.
    if (b.switches.length && b.foes.length >= 6) {
      b.switches.forEach((_, si) => { b.toggleSwitch(si); });
    }

    if (heroMode !== 'heroOnly') {
      // Spend: build on best free plot, clear key rubble if stalled, upgrade to 3, split at 3->4, equip Wren, master to 5.
      for (let guard = 0; guard < 6; guard++) {
        const free = order.find(i => !b.plots[i].sunk && b.plots[i].unlocked && !b.plots[i].rubble && !b.towers.some(x => x.plot === i));
        const kind = rota[built % rota.length];
        if (free !== undefined && b.canBuild(free, kind)) {
          const tw = b.build(free, kind);
          if (tw && kind === 'cannon') b.setMode(tw.id, 'armored');
          built++;
          continue;
        }
        const rubbleIdx = order.find(i => b.canClearPlot(i) && b.gold >= (b.plots[i].rubble?.cost ?? 0) + 90);
        if (rubbleIdx !== undefined && b.towers.length >= 3) {
          b.clearPlot(rubbleIdx);
          continue;
        }
        const up = b.towers.filter(x => x.lv < 3 && b.upgradeCost(x) !== null).sort((x, y) => b.upgradeCost(x)! - b.upgradeCost(y)!)[0];
        if (up && b.gold >= b.upgradeCost(up)! + 20) { b.upgrade(up.id); continue; }
        const sp = b.mods.splits ? (b.towers.find(x => x.lv === 3 && x.kind !== 'beacon') ?? b.towers.find(x => x.lv === 3)) : undefined;
        if (sp) {
          if (b.gold >= b.splitCost(sp.kind, 'a') + 40) { b.splitTower(sp.id, sp.kind === 'watch' ? 'b' : 'a'); continue; }
          break;
        }
        if (heroMode !== 'towersOnly') {
          const gear = [...ITEM_ORDER].reverse().find(it => b.canBuy(it) && b.gold >= b.itemCost(it) + 60);
          if (gear) { b.buy(gear); continue; }
        }
        const mastery = b.towers.filter(x => x.lv === 4 && b.upgradeCost(x) !== null).sort((x, y) => b.upgradeCost(x)! - b.upgradeCost(y)!)[0];
        if (mastery && b.gold >= b.upgradeCost(mastery)! + 60) { b.upgrade(mastery.id); continue; }
        break;
      }
    } else {
      const gear = [...ITEM_ORDER].reverse().find(it => b.canBuy(it) && b.gold >= b.itemCost(it));
      if (gear) b.buy(gear);
    }

    b.step(0.5);
    b.drain();
  }
  return {
    b,
    won: b.status === 'won',
    lives: b.lives,
    level: b.hero.level,
    waves: b.wave,
    gold: b.gold,
    towers: b.towers.length,
    breakdown: b.breakdown,
  };
}

/** Mods for a player who earned about 3.5 Embers a stage and spent them in tree order. */
export function typicalMods(stageId: number): Mods {
  const cl = stageId - 1;
  let embers = Math.floor(cl * 3.5);
  const bought: string[] = [];
  for (let tier = 0; tier < 8; tier++) for (const t of TREES) {
    if (t.after > cl) continue;
    const n = t.nodes[tier];
    if (n && (n.after ?? 0) <= cl && n.cost <= embers && (!n.req || bought.includes(n.req)) && (!n.excl || !bought.includes(n.excl))) {
      bought.push(n.id);
      embers -= n.cost;
    }
  }
  return buildMods(bought, cl);
}
