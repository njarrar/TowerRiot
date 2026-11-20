import { describe, expect, it } from 'vitest';
import { Battle } from '../src/game/sim';
import { stageById } from '../src/game/data/stages';
import { freshSave, modsFor } from '../src/game/save';
import { pointAt } from '../src/game/path';
import { RUNE_LIFETIME } from '../src/game/data/shop';

function makeBattle(stageId = 1, opts?: { variant?: 'standard' | 'alt'; oaths?: ('twinRifts' | 'shiftingEarth' | 'longNight')[] }) {
  const b = new Battle(stageById(stageId), { mods: modsFor(freshSave()), seed: 42, variant: opts?.variant ?? 'standard', oaths: opts?.oaths ?? [] });
  b.setPreviewGold(5000);
  return b;
}

describe('Enemy Overhaul Waves 1 & 2 behaviors', () => {
  it('Grub Swarm Surge speeds up packs of 4+ Grubs by +15%', () => {
    const bSolo = makeBattle(1);
    const solo = bSolo.spawn('grub', undefined, { road: bSolo.roads[0], d: 100 });
    solo.speed = 50;
    bSolo.step(0.5);

    const bPack = makeBattle(1);
    const lead = bPack.spawn('grub', undefined, { road: bPack.roads[0], d: 100 });
    lead.speed = 50;
    for (let i = 0; i < 3; i++) {
      const g = bPack.spawn('grub', undefined, { road: bPack.roads[0], d: 96 - i * 4 });
      g.speed = 50;
    }
    bPack.step(0.5);
    expect(lead.d - 100).toBeGreaterThan((solo.d - 100) * 1.1);
  });

  it('Mender channels an interruptible heal beam that snaps for 3s when frozen/rooted', () => {
    const b = makeBattle(1);
    const ally = b.spawn('shell', undefined, { road: b.roads[0], d: 140 });
    ally.hp = ally.max * 0.5;
    const mender = b.spawn('mender', undefined, { road: b.roads[0], d: 120 });
    b.step(0.5);
    expect(mender.healTarget).toBe(ally.id);
    expect(ally.hp).toBeGreaterThan(ally.max * 0.5);

    // Freeze Mender -> beam snaps and locks out healing for 3s
    mender.freezeT = 1.0;
    b.step(0.1);
    expect(mender.healTarget).toBeNull();
    const hpAfterSnap = ally.hp;
    mender.freezeT = 0;
    b.step(1.0);
    expect(mender.healTarget).toBeNull();
    expect(ally.hp).toBeCloseTo(hpAfterSnap, 4);
  });

  it('Sapper Volatile Powder Keg detonates for 120 Fire AoE when killed armed', () => {
    const b = makeBattle(1);
    const sapper = b.spawn('sapper', undefined, { road: b.roads[0], d: 150 });
    const victim = b.spawn('shell', undefined, { road: b.roads[0], d: 160 });
    const beforeHp = victim.hp;
    b.damage(sapper, 9999, 'pierce', false);
    const evs = b.drain();
    expect(evs.some(e => e.t === 'boom')).toBe(true);
    expect(victim.hp).toBeLessThan(beforeHp - 100);
  });

  it('Warden Directional Front Aegis absorbs 40% from frontal towers while flanking/Storm bypass', () => {
    const b = makeBattle(1);
    const road = b.roads[0];
    const p = pointAt(road.path, 200);
    const pAhead = pointAt(road.path, 208);
    const hx = pAhead.x - p.x, hy = pAhead.y - p.y;
    const tFront = b.build(0, 'watch')!;
    const tBack = b.build(1, 'watch')!;
    tFront.x = p.x + hx * 20; tFront.y = p.y + hy * 20;
    tBack.x = p.x - hx * 20; tBack.y = p.y - hy * 20;

    const w1 = b.spawn('warden', undefined, { road, d: 200 });
    const w2 = b.spawn('warden', undefined, { road, d: 200 });
    const dFront = b.damage(w1, 100, 'pierce', false, false, false, tFront);
    const dBack = b.damage(w2, 100, 'pierce', false, false, false, tBack);
    expect(dFront).toBeCloseTo(dBack * 0.6, 2);

    const w3 = b.spawn('warden', undefined, { road, d: 200 });
    const dStorm = b.damage(w3, 100, 'storm', false, false, false, tFront);
    expect(dStorm).toBeGreaterThan(100); // takes.storm = 1.3 and bypasses front shield
  });

  it('Herald killed by Wren strips -20% top Hollow adaptation and emits heraldCleanse', () => {
    const b = makeBattle(1);
    b.resist.pierce = 0.45;
    b.resist.fire = 0.2;
    const h = b.spawn('herald', undefined, { road: b.roads[0], d: 120 });
    b.damage(h, 9999, 'hero', true);
    const evs = b.drain();
    expect(b.resist.pierce).toBeCloseTo(0.25, 4);
    expect(evs.some(e => e.t === 'heraldCleanse' && e.el === 'pierce')).toBe(true);
  });

  it('Rune Stalker detours to steal active Runes and rewards Wren with +35g on kill', () => {
    const b = makeBattle(1);
    b.rune = { kind: 'haste', x: 500, y: 300, ttl: 5 };
    const thief = b.spawn('runethief', undefined, { road: b.roads[0], d: 100 });
    thief.x = 460; thief.y = 300;
    const goldBefore = b.gold;
    b.damage(thief, 9999, 'hero', true);
    expect(b.gold).toBeGreaterThanOrEqual(goldBefore + 35);
    expect(b.rune?.ttl).toBe(RUNE_LIFETIME);

    // Second stalker actually steals the rune
    const thief2 = b.spawn('runethief', undefined, { road: b.roads[0], d: 100 });
    thief2.x = 485; thief2.y = 300;
    b.step(0.5);
    expect(b.rune).toBeNull();
    expect(b.drain().some(e => e.t === 'runeStolen')).toBe(true);
  });

  it('Gilded Scarab escapes with 0 life loss', () => {
    const b = makeBattle(3);
    const livesBefore = b.lives;
    const road = b.roads[0];
    b.spawn('scarab', undefined, { road, d: road.path.tot - 4 });
    b.step(0.2);
    expect(b.lives).toBe(livesBefore);
    expect(b.drain().some(e => e.t === 'escape')).toBe(true);
  });

  it('Wick Leech siphons nearby Beacon and halves its radius', () => {
    const b = makeBattle(8);
    const openPlot = b.plots.findIndex(p => p.unlocked && !p.rubble);
    const beacon = b.build(openPlot, 'beacon')!;
    const baseRange = b.stats(beacon).range;
    const leech = b.spawn('wickleech', undefined, { road: b.roads[0], d: 100 });
    leech.x = beacon.x + 20; leech.y = beacon.y;
    // Update foes without teleporting leech off the beacon by stepping tiny dt after positioning road close or directly checking
    const nearestD = (() => {
      let bestD = 0, bestDist = Infinity;
      for (let d = 0; d < b.roads[0].path.tot; d += 10) {
        const pt = pointAt(b.roads[0].path, d);
        const dist = Math.hypot(pt.x - beacon.x, pt.y - beacon.y);
        if (dist < bestDist) { bestDist = dist; bestD = d; }
      }
      return bestD;
    })();
    leech.d = nearestD;
    const pt = pointAt(b.roads[0].path, nearestD);
    beacon.x = pt.x; beacon.y = pt.y;
    leech.x = pt.x; leech.y = pt.y;
    b.step(0.05);
    expect(beacon.siphoned).toBe(true);
    expect(b.stats(beacon).range).toBeCloseTo(baseRange * 0.5, 1);
  });

  it('Tether Twins split damage 50/50 while within 160 px', () => {
    const b = makeBattle(16);
    const a = b.spawn('tether', undefined, { road: b.roads[0], d: 120 });
    const c = b.spawn('tether', undefined, { road: b.roads[0], d: 110 });
    expect(a.linkPartnerId).toBe(c.id);
    expect(c.linkPartnerId).toBe(a.id);
    const hpA = a.hp, hpC = c.hp;
    b.damage(a, 100, 'pierce', false);
    expect(hpA - a.hp).toBeCloseTo(50, 1);
    expect(hpC - c.hp).toBeCloseTo(50, 1);
  });

  it('Multi-phase bosses trigger signature skills (Tidewyrm Drenched, Colossus Phase 2 shed plates, Queen Phase 2/3)', () => {
    // Tidewyrm Drenched +40% Storm window
    const bt = makeBattle(10);
    const wyrm = bt.spawn('tidewyrm', undefined, { road: bt.roads[0], d: 100 });
    wyrm.drenchedT = 3;
    const dStorm = bt.damage(wyrm, 100, 'storm', false);
    // takes.storm = 1.25 * drenched 1.4 = 1.75 => 175
    expect(dStorm).toBeCloseTo(175, 1);

    // Colossus Phase 2 sheds brass plating
    const bc = makeBattle(15);
    const col = bc.spawn('colossus', undefined, { road: bc.roads[0], d: 100 });
    const p1Dmg = bc.damage(col, 100, 'pierce', false);
    expect(p1Dmg).toBeCloseTo(35, 1); // plated 0.35
    col.phase = 1;
    const p2Dmg = bc.damage(col, 100, 'pierce', false);
    expect(p2Dmg).toBeCloseTo(100, 1); // plating shed!

    // Queen Phase 2 spawns Twin Heralds & Phase 3 triggers 6s Spectral Flight
    const bq = makeBattle(20);
    const q = bq.spawn('queen', undefined, { road: bq.roads[0], d: 200 });
    q.hp = q.max * 0.6;
    bq.step(0.05);
    expect(q.phase).toBe(1);
    expect(bq.foes.filter(f => f.kind === 'herald').length).toBe(2);
    q.hp = q.max * 0.25;
    bq.step(0.05);
    expect(q.phase).toBe(2);
    expect(q.flightT).toBeGreaterThan(5);
  });

  it('Crowned Elites spawn with deterministic affix on Wave 4 in Variant B', () => {
    const b = makeBattle(3, { variant: 'alt' });
    b.wave = 4;
    const f = b.spawn('grub');
    expect(f.affix).not.toBeNull();
    expect(f.max).toBeGreaterThan(f.def.hp * b.scale * 1.4);
  });
});
