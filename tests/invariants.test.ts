import { describe, expect, it } from 'vitest';
import { Battle, WAVE_GAP } from '../src/game/sim';
import { stageById } from '../src/game/data/stages';
import { pointAt } from '../src/game/path';
import { HERO } from '../src/game/data/hero';
import { MAX_TOWER_LEVEL } from '../src/game/data/towers';
import { COURIER_SURCHARGE, ITEMS } from '../src/game/data/shop';
import { validateGameData } from '../src/game/validate-data';
import { playStage, typicalMods } from './bot';

describe('engine & data invariants', () => {
  it('passes static data schema validation with zero issues', () => {
    expect(validateGameData()).toEqual([]);
  });

  it('caps towers at Lv 5 split mastery (Lv 6 Temper II cut)', () => {
    expect(MAX_TOWER_LEVEL).toBe(5);
    // Stage 9 starts with cleared Stage 8 -> split specializations unlocked (`mods.splits === true`).
    const b = new Battle(stageById(9), { mods: typicalMods(9) });
    b.setPreviewGold(5000);
    const t = b.build(0, 'watch')!;
    expect(t).not.toBeNull();
    expect(b.upgrade(t.id)).toBe(true); // Lv 2
    expect(b.upgrade(t.id)).toBe(true); // Lv 3
    expect(b.upgradeCost(t)).toBeNull();
    expect(b.splitTower(t.id, 'b')).toBe(true); // Lv 4 Twin
    expect(b.upgrade(t.id)).toBe(true); // Lv 5 Mastery
    expect(t.lv).toBe(5);
    expect(b.upgradeCost(t)).toBeNull();
    expect(b.upgrade(t.id)).toBe(false);
  });

  it('lets Wren fight from her post without ever leaving her 90 px leash', () => {
    expect(HERO.leash).toBe(90);
    const b = new Battle(stageById(1));
    const r = b.roads[0];
    const post = pointAt(r.path, r.path.tot * 0.5);
    b.moveHero(post.x, post.y);
    for (let i = 0; i < 80; i++) { b.step(0.25); b.drain(); }
    expect(Math.hypot(b.hero.x - post.x, b.hero.y - post.y)).toBeLessThan(12);
    b.callWave();
    let far = 0;
    for (let i = 0; i < 400 && !b.over; i++) {
      b.step(0.25); b.drain();
      if (!b.hero.dead) far = Math.max(far, Math.hypot(b.hero.x - b.hero.anchorX, b.hero.y - b.hero.anchorY));
    }
    // She strays at most her leash plus one step of overshoot, and she really fights from there.
    expect(far).toBeLessThanOrEqual(HERO.leash + 18);
    expect(far).toBeGreaterThan(5);
    expect(b.breakdown.hero + b.breakdown.skills).toBeGreaterThan(0);
  });

  it('applies +20% Courier Surcharge when Wren shops away from the Gate during combat', () => {
    const b = new Battle(stageById(11));
    const baseCost = ITEMS.cleave.cost;
    const gate = b.gate[0];
    b.callWave();
    b.moveHero(gate[0], gate[1]);
    b.step(5);
    expect(b.itemCost('cleave')).toBe(baseCost);
    b.moveHero(gate[0] - 400, gate[1] - 200);
    b.step(6);
    expect(b.itemCost('cleave')).toBe(Math.round(baseCost * (1 + COURIER_SURCHARGE)));
  });

  it('does not shave active hero skill cooldowns on early wave calls', () => {
    const b = new Battle(stageById(2));
    b.autoLearn();
    // Place two strong towers so Wave 1 finishes and opens the early-call window cleanly.
    b.build(0, 'watch');
    b.build(1, 'watch');
    b.callWave();
    for (let i = 0; i < 160 && b.nextIn === null; i++) b.step(0.25);
    expect(b.nextIn).not.toBeNull();
    expect(WAVE_GAP).toBe(22);
    b.castQ();
    const cdBefore = b.hero.cd.q;
    expect(cdBefore).toBeGreaterThan(2);
    b.callWave();
    expect(b.hero.cd.q).toBeCloseTo(cdBefore, 5);
  });

  it('drains the moss pond on stage 2 at wave 5 and lets a rubble plot be bought clear on stage 8', () => {
    // Stage 2: Wave 5 drains moss pond, opens bog road & plot 12.
    const b2 = new Battle(stageById(2));
    b2.setPreviewGold(1200);
    b2.build(3, 'watch');
    b2.build(4, 'watch');
    b2.build(5, 'cannon');
    expect(b2.plots[12].unlocked).toBe(false);
    expect(b2.roads.find(r => r.def.id === 'bog')?.active).toBe(false);
    b2.callWave();
    for (let i = 0; i < 600 && b2.wave < 5; i++) {
      if (b2.nextIn !== null) b2.callWave();
      b2.step(0.5);
    }
    expect(b2.wave).toBeGreaterThanOrEqual(5);
    expect(b2.waters[0].drained).toBe(true);
    expect(b2.plots[12].unlocked).toBe(true);
    expect(b2.roads.find(r => r.def.id === 'bog')?.active).toBe(true);

    // Stage 8: a rubble plot cannot be built on until it is cleared, and clearing costs its price.
    const b8 = new Battle(stageById(8));
    b8.setPreviewGold(500);
    const cost = b8.plots[0].rubble!.cost;
    expect(b8.canBuild(0, 'watch')).toBe(false);
    expect(b8.clearPlot(0)).toBe(true);
    expect(b8.gold).toBe(500 - cost);
    expect(b8.plots[0].rubble).toBeNull();
    expect(b8.canBuild(0, 'watch')).toBe(true);
  });

  it('plays the same battle twice from the same seed, in any layout and under any oath', () => {
    for (const [id, opts] of [[10, { variant: 'alt', oaths: ['twinRifts', 'longNight'] }], [16, { oaths: ['shiftingEarth'] }], [3, { variant: 'alt' }]] as const) {
      const a = playStage(id, typicalMods(id), 7, 1500, opts as never);
      const b = playStage(id, typicalMods(id), 7, 1500, opts as never);
      expect([b.won, b.lives, b.waves, b.gold, b.b.kills, b.b.clock]).toEqual([a.won, a.lives, a.waves, a.gold, a.b.kills, a.b.clock]);
      expect(a.b.over).toBe(true);
    }
  });

  it('passes the Pet Test: the battle is worse without Wren played, and worse without towers', () => {
    for (const id of [12, 17]) {
      const mods = typicalMods(id);
      const both = playStage(id, mods, 7);
      const wrenIdle = playStage(id, mods, 7, 1500, { heroMode: 'towersOnly' });
      const noTowers = playStage(id, mods, 7, 1500, { heroMode: 'heroOnly' });
      expect(both.won, `stage ${id} with both`).toBe(true);
      expect(wrenIdle.lives, `stage ${id}: towers alone keep fewer lives`).toBeLessThan(both.lives);
      expect(noTowers.lives, `stage ${id}: Wren alone keeps fewer lives`).toBeLessThan(both.lives);
      expect(noTowers.towers).toBe(0);
      expect(both.breakdown.hero + both.breakdown.skills).toBeGreaterThan(0);
    }
  });
});
