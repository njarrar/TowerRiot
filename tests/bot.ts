import { Battle, ell } from '../src/game/sim';
import { stageById } from '../src/game/data/stages';
import { pointAt } from '../src/game/path';
import type { TowerKind } from '../src/game/data/towers';
import { ENEMIES } from '../src/game/data/enemies';
import { ITEM_ORDER, ITEMS } from '../src/game/data/shop';
import { buildMods, type Mods } from '../src/game/mods';
import { TREES } from '../src/game/data/trees';

/** A plain, greedy player used to check that every stage can be won. */
export function playStage(id: number, mods?: Mods, seed = 7, maxSeconds = 1500) {
  const b = new Battle(stageById(id), { mods, seed });
  const cover = b.plots.map(p => {
    let c = 0;
    for (const r of b.roads) for (let d = 0; d < r.path.tot; d += 20) { const q = pointAt(r.path, d); if (ell(q.x - p.x, q.y - p.y) < 210) c++; }
    return c;
  });
  // Spread out: each pick favours plots that cover road no earlier pick covers.
  const samples = b.roads.flatMap(r => { const out: { x: number; y: number }[] = []; for (let d = 0; d < r.path.tot; d += 20) { const q = pointAt(r.path, d); out.push({ x: q.x, y: q.y }); } return out; });
  const seen = new Array(samples.length).fill(0);
  const order: number[] = [];
  const left = b.plots.map((_, i) => i);
  while (left.length) {
    let bi = 0, bs = -1;
    left.forEach((pi, k) => { const p = b.plots[pi]; let sc = 0; samples.forEach((q, j) => { if (ell(q.x - p.x, q.y - p.y) < 210) sc += 1 / (1 + seen[j]); }); if (sc > bs) { bs = sc; bi = k; } });
    const pi = left.splice(bi, 1)[0]; order.push(pi);
    const p = b.plots[pi]; samples.forEach((q, j) => { if (ell(q.x - p.x, q.y - p.y) < 210) seen[j]++; });
  }
  void cover;
  const shades = b.stage.waves.some(w => w.groups.some(g => g.kind === 'shade'));
  // Like a player reading the stage card: lots of fliers means more bolts and lightning.
  let air = 0, all = 0;
  for (const w of b.stage.waves) for (const g of w.groups) { const hp = g.n; all += hp; if (ENEMIES[g.kind].flying) air += hp; }
  const airy = air / all > 0.18;
  const base: TowerKind[] = airy ? ['watch', 'pylon', 'cannon', 'beacon', 'watch', 'bell', 'pylon', 'watch', 'cannon', 'pylon', 'watch', 'roots'] : shades ? ['watch', 'cannon', 'beacon', 'bell', 'pylon', 'watch', 'cannon', 'roots', 'pylon', 'watch', 'cannon', 'pylon'] : ['watch', 'cannon', 'bell', 'pylon', 'watch', 'cannon', 'roots', 'beacon', 'pylon', 'watch', 'cannon', 'pylon'];
  const rota: TowerKind[] = base.filter(k => b.stage.towers.includes(k));
  let built = 0;
  b.callWave();
  for (let t = 0; t < maxSeconds && !b.over; t += 0.5) {
    b.autoLearn();
    const h = b.hero;
    const near = b.foes.filter(f => Math.hypot(f.x - h.x, f.y - h.y) < 100).length;
    if (near >= 3) b.castQ();
    if (near >= 2 && b.foes[0]) { const f = b.foes.reduce((a, c) => (c.d > a.d ? c : a)); b.castW(f.x, f.y); }
    if (b.foes.length > 12) b.castR();
    // Like any player: send Wren after the boss once it shows up.
    const boss = b.foes.find(f => f.def.traits?.boss);
    if (boss && h.focus !== boss.id) b.attackFoe(boss.id);
    // Spend: build on the best free plot, upgrade to 3, split to 4, equip Wren, then temper to 5-6.
    for (let guard = 0; guard < 6; guard++) {
      const free = order.find(i => !b.plots[i].sunk && !b.towers.some(x => x.plot === i));
      const kind = rota[built % rota.length];
      if (free !== undefined && b.canBuild(free, kind)) {
        const tw = b.build(free, kind);
        if (tw && kind === 'cannon') b.setMode(tw.id, 'armored');
        built++;
        continue;
      }
      const up = b.towers.filter(x => x.lv < 3 && b.upgradeCost(x) !== null).sort((x, y) => b.upgradeCost(x)! - b.upgradeCost(y)!)[0];
      if (up && b.gold >= b.upgradeCost(up)! + 20) { b.upgrade(up.id); continue; }
      const sp = b.mods.splits ? (b.towers.find(x => x.lv === 3 && x.kind !== 'beacon') ?? b.towers.find(x => x.lv === 3)) : undefined;
      if (sp) {
        if (b.gold >= b.splitCost(sp.kind, 'a') + 40) { b.splitTower(sp.id, sp.kind === 'watch' ? 'b' : 'a'); continue; }
        break;
      }
      const gear = [...ITEM_ORDER].reverse().find(it => b.canBuy(it) && b.gold >= ITEMS[it].cost + 60);
      if (gear) { b.buy(gear); continue; }
      const temper = b.towers.filter(x => x.lv >= 4 && b.upgradeCost(x) !== null).sort((x, y) => b.upgradeCost(x)! - b.upgradeCost(y)!)[0];
      if (temper && b.gold >= b.upgradeCost(temper)! + 60) { b.upgrade(temper.id); continue; }
      break;
    }
    b.step(0.5);
    b.drain();
  }
  return { b, won: b.status === 'won', lives: b.lives, level: b.hero.level, waves: b.wave, gold: b.gold, towers: b.towers.length };
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
