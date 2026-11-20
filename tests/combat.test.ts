import { describe, expect, it } from 'vitest';
import { Battle } from '../src/game/sim';
import { STAGES } from '../src/game/data/stages';
import { buildMods } from '../src/game/mods';
import { loadSave, freshSave, SAVE_KEY, type Store } from '../src/game/save';

function memStore(raw?: string): Store {
  let v = raw ?? null;
  return { get: (k) => (k === SAVE_KEY ? v : null), set: (k, val) => { if (k === SAVE_KEY) v = val; } };
}

describe('Sprint 1 core simulation & tech tree P0 regressions', () => {
  it('Beacon stealth reveal uses full upgraded/High-Ground/Mastery range (#1)', () => {
    const mods = buildMods(['tw-reach'], 20);
    const b = new Battle(STAGES[5], { mods, seed: 1 }); // Stage 6 has high ground plots
    b.setPreviewGold(5000);
    const hiPlot = b.plots.findIndex(p => p.high && p.unlocked && !p.rubble);
    expect(hiPlot).toBeGreaterThanOrEqual(0);
    const t = b.build(hiPlot, 'beacon')!;
    b.upgrade(t.id); b.upgrade(t.id); b.splitTower(t.id, 'b'); b.upgrade(t.id); // Lv 5 Mastery
    const rng = b.stats(t).range;
    expect(rng).toBeGreaterThan(240);
    // Spawn a Veil Moth at 230 px away (outside base 200 px, inside upgraded range)
    const f = b.spawn('veilmoth');
    f.x = t.x + 230; f.y = t.y;
    // Move hero far away so only the Beacon can reveal it
    b.hero.x = 10; b.hero.y = 10; b.hero.tx = 10; b.hero.ty = 10; b.hero.anchorX = 10; b.hero.anchorY = 10;
    b.callWave();
    b.step(1 / 30);
    // Keep f at t.x + 230 if it moved slightly: check distance < rng && > 200
    f.x = t.x + 225; f.y = t.y;
    b.step(1 / 30);
    expect(f.hidden).toBe(false);
  });

  it('Second Dawn cannot be re-bought after its revive has been consumed (#2)', () => {
    const mods = buildMods([], 20);
    const b = new Battle(STAGES[15], { mods, seed: 1 });
    b.setPreviewGold(5000);
    expect(b.buy('seconddawn')).toBe(true);
    b.hero.hp = -50;
    b.step(1 / 30);
    expect(b.hero.revived).toBe(true);
    expect(b.hero.items.includes('seconddawn')).toBe(false);
    expect(b.canBuy('seconddawn')).toBe(false);
    expect(b.buy('seconddawn')).toBe(false);
  });

  it('Glasshide paneCd separates spore ticks from direct hits so Repeater/Scatter strip panes (#3)', () => {
    const b = new Battle(STAGES[16], { mods: buildMods([], 20), seed: 1 });
    const f = b.spawn('glasshide');
    expect(f.panes).toBe(3);
    // Spore cloud status tick breaks 1 pane and starts sporePaneCd (0.6s), NOT direct paneCd
    b.damage(f, 5, 'nature', false, true, false, undefined, 'status');
    expect(f.panes).toBe(2);
    // Immediate direct hit (0s later!) still breaks a pane instead of being shielded by spore tick
    b.damage(f, 20, 'pierce', false, false, false, undefined, 'towers');
    expect(f.panes).toBe(1);
    // Second twin bolt arriving 0.05s later (> 0.02s direct paneCd) breaks the last pane
    b.step(0.05);
    b.damage(f, 20, 'pierce', false, false, false, undefined, 'towers');
    expect(f.panes).toBe(0);
  });

  it('Wren keeps blocking foes while stepping 37-90 px inside her leash (#4)', () => {
    const b = new Battle(STAGES[0], { mods: buildMods([], 5), seed: 1 });
    const f = b.spawn('grub');
    b.hero.anchorX = f.x - 60; b.hero.anchorY = f.y;
    b.hero.x = f.x; b.hero.y = f.y;
    b.hero.tx = b.hero.anchorX; b.hero.ty = b.hero.anchorY;
    b.hero.moving = true;
    b.hero.focus = null;
    b.step(1 / 30);
    expect(f.blocked).toBe(true);
  });

  it('Runic Echo (bw-rune) grants additive global Attune surge without triggering Sunrise (#6)', () => {
    const mods = buildMods(['bw-lives', 'bw-salvage', 'bw-rune'], 15);
    const b = new Battle(STAGES[0], { mods, seed: 1 });
    b.setPreviewGold(500);
    const t = b.build(0, 'watch')!;
    const baseRate = b.stats(t).rate;
    b.callWave();
    // Place hero far from tower & spawn a rune on top of her
    b.hero.x = 1150; b.hero.y = 600; b.hero.tx = 1150; b.hero.ty = 600; b.hero.anchorX = 1150; b.hero.anchorY = 600;
    b.rune = { kind: 'bounty', x: 1150, y: 600, ttl: 10 };
    b.step(1 / 30);
    expect(b.hero.sunriseT).toBe(0);
    expect(b.hero.attuneSurgeT).toBeGreaterThan(2.5);
    expect(b.stats(t).rate).toBeLessThan(baseRate);
  });

  it('Overload (ar-overload) increases Rail damage on held foes (#7)', () => {
    const baseB = new Battle(STAGES[10], { mods: buildMods([], 15), seed: 1 });
    const ovB = new Battle(STAGES[10], { mods: buildMods(['ar-storm', 'ar-overload'], 15), seed: 1 });
    for (const b of [baseB, ovB]) {
      b.setPreviewGold(5000);
      const t = b.build(0, 'pylon')!;
      b.upgrade(t.id); b.upgrade(t.id); b.splitTower(t.id, 'b');
      t.cd = 0;
      const road = b.roads[0];
      let bestD = 0, bestDist = Infinity;
      for (let d = 0; d <= road.path.tot; d += 12) {
        const idx = road.path.segs.findIndex(s => s.s + s.l >= d);
        const seg = road.path.segs[Math.max(0, idx)];
        const dist = Math.hypot(seg.a[0] - t.x, seg.a[1] - t.y);
        if (dist < bestDist) { bestDist = dist; bestD = d; }
      }
      const f = b.spawn('elite', undefined, { road, d: bestD });
      f.rootT = 3;
      b.step(1 / 30);
    }
    const baseLost = baseB.foes[0].max - baseB.foes[0].hp;
    const ovLost = ovB.foes[0].max - ovB.foes[0].hp;
    expect(baseLost).toBeGreaterThan(0);
    expect(ovLost).toBeGreaterThan(baseLost * 1.2);
  });

  it('Bastion Bell (bw-citadel) pushes ground foes back, ignores fliers, and emits ironGate event (#8)', () => {
    const mods = buildMods(['bw-lives', 'bw-salvage', 'bw-gate', 'bw-citadel'], 15);
    const b = new Battle(STAGES[5], { mods, seed: 1 });
    b.callWave();
    const leaker = b.spawn('grub');
    leaker.d = leaker.road.path.tot - 1;
    const groundNear = b.spawn('grub', undefined, { road: leaker.road, d: leaker.road.path.tot - 80 });
    const flyerNear = b.spawn('moth', undefined, { road: leaker.road, d: leaker.road.path.tot - 80 });
    const startD = groundNear.d;
    b.step(1 / 30);
    expect(b.lives).toBe(b.startLives);
    expect(groundNear.d).toBeLessThan(startD - 50);
    expect(groundNear.staggerT).toBeGreaterThan(0);
    expect(flyerNear.rootT).toBe(0);
  });

  it('loadSave rejects malformed roots, clamps stars to 0..3, and prunes stage-locked capstones (#170)', () => {
    expect(loadSave(memStore('[]')).stars).toEqual({});
    const bad = JSON.stringify({
      version: 2,
      stars: { '1': 3, '2': '3', '999': 3, '3': 99 },
      nodes: ['tw-bolts', 'tw-chill', 'tw-mason', 'tw-arch'],
      settings: { sound: 'yes', autoSkills: null },
    });
    const s = loadSave(memStore(bad));
    expect(s.stars[1]).toBe(3);
    expect(s.stars[2]).toBeUndefined();
    expect(s.stars[3]).toBe(3);
    expect(s.stars[999]).toBeUndefined();
    expect(s.settings.sound).toBe(true);
    // Cleared is only stage 1 (stage 2 missing), so capstone tw-arch (after: 14) must be pruned!
    expect(s.nodes.includes('tw-arch')).toBe(false);
    expect(freshSave().version).toBe(2);
  });
});
