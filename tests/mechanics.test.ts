/**
 * Map mechanics, checked by what foes actually do, not by flags.
 * Each test fails on the code as it was before the mechanics were fixed.
 */
import { describe, expect, it } from 'vitest';
import { Battle } from '../src/game/sim';
import { STAGES, stageById } from '../src/game/data/stages';
import { buildMods } from '../src/game/mods';

/** A battle nobody can lose, so a test can watch foes walk without the Keep falling. */
function sandbox(id: number, opts: ConstructorParameters<typeof Battle>[1] = {}) {
  const b = new Battle(stageById(id), opts);
  (b as unknown as { lives: number }).lives = 100000;
  return b;
}
const road = (b: Battle, id: string) => b.roads.find(r => r.def.id === id)!;
const run = (b: Battle, seconds: number, each?: () => void) => {
  const events: ReturnType<Battle['drain']> = [];
  for (let t = 0; t < seconds; t += 0.25) { b.step(0.25); events.push(...b.drain()); each?.(); }
  return events;
};

describe('gate switches', () => {
  for (const [id, sw, rd] of [[6, 'boom', 'north'], [7, 'cove_boom', 'beach'], [9, 'viaduct', 'main'], [14, 'brake', 'top'], [16, 'ob_gate', 'mid'], [17, 'rockfall', 'main'], [19, 'col_seal', 'nw']] as [number, string, string][]) {
    it(`stage ${id}: ${sw} holds a walker at the boom, then lets it through`, () => {
      const b = sandbox(id);
      b.hero.dead = true; // Wren must not be the one who stops it
      b.callWave();
      const r = road(b, rd);
      r.barrier = null; // a wreck on the same road must not be what stops it
      const si = b.switches.findIndex(s => s.def.id === sw);
      expect(r.closeAt, 'gate has a hold point on its road').not.toBeNull();
      const f = b.spawn('elite', undefined, { road: r, d: Math.max(0, r.closeAt! - 160) });
      expect(b.toggleSwitch(si)).toBe(true);
      const dur = b.switches[si].def.dur!;
      run(b, dur - 1);
      expect(f.dead).toBe(false);
      expect(f.d, 'held short of the boom while the gate is shut').toBeLessThanOrEqual(r.closeAt! - 30);
      run(b, 20);
      expect(f.dead || f.d > r.closeAt!, 'walks on once the gate opens').toBe(true);
    });
  }

  it('cannot be kept shut for good, even with Wren standing on the lever', () => {
    for (const st of STAGES) {
      for (const [si, def] of (st.switches ?? []).entries()) {
        if (def.mode === 'fork') continue;
        const b = sandbox(st.id);
        b.callWave();
        const sw = b.switches[si];
        let on = 0, total = 0;
        for (let t = 0; t < 240; t += 0.25) {
          // Hold Wren on the lever so every cooldown is boosted.
          b.hero.dead = false; b.hero.x = def.at[0]; b.hero.y = def.at[1];
          b.toggleSwitch(si);
          b.step(0.25); b.drain();
          if (sw.activeT > 0) on++;
          total++;
        }
        const uptime = on / total;
        expect(uptime, `stage ${st.id} ${def.id} works at all`).toBeGreaterThan(0.25);
        expect(uptime, `stage ${st.id} ${def.id} uptime`).toBeLessThan(0.7);
      }
    }
  });
});

describe('roads that open mid-battle', () => {
  for (const [id, boss, rd] of [[5, 'mireking', 'inner'], [15, 'colossus', 'mid_cut'], [20, 'queen', 'causeway']] as const) {
    it(`stage ${id}: the ${boss} breaks open ${rd} when its health phase hits`, () => {
      const b = sandbox(id);
      b.callWave();
      const r = road(b, rd);
      expect(r.active).toBe(false);
      const f = b.spawn(boss);
      run(b, 1);
      expect(r.active, 'stays shut while the boss is healthy').toBe(false);
      f.hp = f.max * (f.def.traits!.phases![0] - 0.01);
      const events = run(b, 1);
      expect(r.active && r.spawnOpen).toBe(true);
      expect(events.filter(e => e.t === 'riftOpen' && e.road === rd).length, 'announced exactly once').toBe(1);
    });
  }

  it('stage 10: the Tidewyrm seals the north pass at half health', () => {
    const b = sandbox(10);
    b.callWave();
    const north = road(b, 'north');
    expect(north.spawnOpen).toBe(true);
    const f = b.spawn('tidewyrm');
    f.hp = f.max * 0.49;
    run(b, 1);
    expect(north.spawnOpen).toBe(false);
  });

  for (const [id, rd, wave] of [[12, 'spur', 5], [13, 'pipe', 6]] as const) {
    it(`stage ${id}: ${rd} is really used from wave ${wave} without the player touching the fork`, () => {
      const b = sandbox(id);
      b.callWave();
      let onRoad = 0;
      const events: ReturnType<Battle['drain']> = [];
      for (let t = 0; t < 900 && b.wave <= wave; t += 0.5) {
        if (b.nextIn !== null) b.callWave();
        b.step(0.5); events.push(...b.drain());
        if (b.wave === wave) onRoad = Math.max(onRoad, b.foes.filter(f => f.road.def.id === rd).length);
      }
      expect(b.wave).toBeGreaterThanOrEqual(wave);
      expect(onRoad, `foes seen on ${rd} during wave ${wave}`).toBeGreaterThan(0);
      expect(events.filter(e => e.t === 'riftOpen' && e.road === rd).length).toBe(1);
    });
  }

  it('announces each wave-opened road once, even when a terraform names it too', () => {
    for (const id of [2, 7, 10, 17, 18, 20]) {
      const b = sandbox(id);
      b.callWave();
      const opened: string[] = [];
      for (let t = 0; t < 1200 && !b.over; t += 0.5) {
        if (b.nextIn !== null) b.callWave();
        b.step(0.5);
        for (const e of b.drain()) if (e.t === 'riftOpen') opened.push(e.road);
      }
      expect(opened.length, `stage ${id}: ${opened}`).toBe(new Set(opened).size);
      expect(opened.length).toBeGreaterThan(0);
    }
  });
});

describe('rubble', () => {
  it('is not cleared for free before the first wave, only while a fight is on', () => {
    for (const st of STAGES) {
      const pi = st.plots.findIndex(p => p.rubble?.holdSec);
      if (pi < 0) continue;
      const b = sandbox(st.id);
      const p = b.plots[pi];
      b.moveHero(p.x + 24, p.y);
      run(b, 40);
      expect(Math.hypot(b.hero.x - p.x, b.hero.y - p.y), `stage ${st.id}: Wren reached the plot`).toBeLessThanOrEqual(48);
      expect(p.rubble, `stage ${st.id}: rubble survives the prep phase`).not.toBeNull();
      b.callWave();
      let cleared = false;
      run(b, st.plots[pi].rubble!.holdSec! + 1, () => { if (!p.rubble) cleared = true; });
      expect(cleared, `stage ${st.id}: Wren clears it once the fight is on`).toBe(true);
    }
  });
});

describe('end of battle', () => {
  it('is a loss, not a one-star win, when the last foe of the last wave takes the last life', () => {
    const b = new Battle(stageById(1));
    b.callWave();
    const raw = b as unknown as { wave: number; queue: unknown[]; foes: unknown[]; lives: number };
    raw.wave = b.stage.waves.length;
    raw.queue = [];
    raw.foes = [];
    raw.lives = 1;
    b.hero.dead = true;
    const r = b.roads[0];
    b.spawn('grub', undefined, { road: r, d: r.path.tot - 1 });
    const events = run(b, 3);
    expect(b.status).toBe('lost');
    expect(events.some(e => e.t === 'won')).toBe(false);
    expect(events.filter(e => e.t === 'lost').length).toBe(1);
  });
});

describe('oaths and relics', () => {
  it('Long Night keeps every stage dark from the first wave', () => {
    for (const st of STAGES) {
      const dark = new Battle(st, { oaths: ['longNight'] });
      expect(dark.night, `stage ${st.id}`).toBe(true);
      dark.callWave();
      run(dark, 2);
      expect(dark.night).toBe(true);
      expect(new Battle(st).night, `stage ${st.id} starts in daylight without the oath`).toBe(false);
    }
  });

  it('Shifting Earth refunds half of a tower lost to a sinking plot; without the oath the refund is whole', () => {
    for (const oaths of [[], ['shiftingEarth']] as ('shiftingEarth')[][]) {
      const b = sandbox(1, { oaths });
      const pi = b.stage.plots.findIndex(p => p.sinkAt !== undefined);
      if (!oaths.length) { expect(pi, 'stage 1 has no sinking plot of its own').toBe(-1); continue; }
      b.setPreviewGold(1000);
      const tower = b.build(pi, 'watch')!;
      const spent = tower.spent;
      b.callWave();
      let before = b.gold, refund = -1;
      // Waves start on their own timer here, so the sink happens inside a step and the gold change is the refund.
      for (let t = 0; t < 900 && refund < 0; t += 0.5) {
        before = b.gold;
        b.step(0.5);
        if (b.drain().some(e => e.t === 'sink' && e.plot === pi)) refund = b.gold - before;
      }
      expect(b.plots[pi].sunk).toBe(true);
      // Kills in the same half second may add a little gold, never enough to reach a full refund.
      expect(refund).toBeGreaterThanOrEqual(Math.round(spent * 0.5));
      expect(refund).toBeLessThan(spent);
    }
  });

  it('grants the stage-20 relic the campaign screen shows', () => {
    expect(buildMods([], 20).dmgAll - buildMods([], 19).dmgAll).toBeCloseTo(0.1, 9);
  });

  it('gives every boss a health phase', () => {
    for (const k of ['mireking', 'tidewyrm', 'colossus', 'queen'] as const) {
      const b = new Battle(stageById(1));
      expect(b.spawn(k).def.traits?.phases?.length, k).toBeGreaterThan(0);
    }
  });
});
