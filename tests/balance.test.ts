/**
 * Balance, measured with the plain greedy bot in `bot.ts`.
 *
 * One seed proves little: the same stage can swing from a clean win to a loss on another seed.
 * So every claim here is made over several seeds.
 */
import { describe, expect, it } from 'vitest';
import { STAGES, type OathId, type StageVariant } from '../src/game/data/stages';
import { Battle } from '../src/game/sim';
import { playStage, typicalMods } from './bot';

const SEEDS = [1, 2, 3, 4, 5, 7];
const ALT_SEEDS = [1, 4, 7];
const OATHS: OathId[] = ['twinRifts', 'shiftingEarth', 'longNight'];

interface Outcome { wins: number; runs: number; share: number; lives: number[]; start: number }
const memo = new Map<string, Outcome>();

/** Play one stage layout on several seeds. `share` is the average share of the Keep's lives kept. */
function outcome(id: number, variant: StageVariant, seeds: number[]): Outcome {
  const key = `${id}:${variant}:${seeds}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const mods = typicalMods(id);
  const start = new Battle(STAGES[id - 1], { mods, variant }).lives;
  const rs = seeds.map(seed => playStage(id, mods, seed, 1500, { variant }));
  const o: Outcome = {
    wins: rs.filter(r => r.won).length, runs: rs.length, start,
    lives: rs.map(r => r.lives),
    share: rs.reduce((a, r) => a + r.lives, 0) / rs.length / start,
  };
  memo.set(key, o);
  return o;
}
const band = (from: number, to: number) => {
  let sum = 0;
  for (let id = from; id <= to; id++) sum += outcome(id, 'standard', SEEDS).share;
  return sum / (to - from + 1);
};

describe('balance: a plain greedy player', () => {
  for (const st of STAGES) {
    it(`wins stage ${st.id} ${st.name} on every seed`, () => {
      const o = outcome(st.id, 'standard', SEEDS);
      console.log(`stage ${st.id}: won ${o.wins}/${o.runs}, lives kept ${Math.round(o.share * 100)}% [${o.lives.join(', ')}] of ${o.start}`);
      expect(o.wins, `lives per seed ${SEEDS}: ${o.lives}`).toBe(o.runs);
    }, 60000);
  }

  it('finds stages 1 to 6 easy: no seed drops below three stars', () => {
    for (let id = 1; id <= 6; id++) {
      const o = outcome(id, 'standard', SEEDS);
      for (const lives of o.lives) expect(lives / o.start, `stage ${id}`).toBeGreaterThanOrEqual(0.9);
    }
  }, 120000);

  it('gets harder after stage 6, band by band, and stays winnable', () => {
    const early = band(1, 6), mid = band(7, 13), late = band(14, 20);
    console.log(`lives kept: stages 1-6 ${Math.round(early * 100)}%, 7-13 ${Math.round(mid * 100)}%, 14-20 ${Math.round(late * 100)}%`);
    expect(early).toBeGreaterThanOrEqual(0.97);
    expect(mid).toBeLessThan(early - 0.03);
    expect(late).toBeLessThan(mid - 0.1);
    // The design asks for about two stars in the last region: half the lives or more on average.
    expect(band(16, 20)).toBeGreaterThanOrEqual(0.5);
    // No late stage is a coin flip: the worst seed still keeps a quarter of the lives.
    for (let id = 7; id <= 20; id++) {
      const o = outcome(id, 'standard', SEEDS);
      expect(Math.min(...o.lives) / o.start, `stage ${id} worst seed`).toBeGreaterThanOrEqual(0.25);
    }
  }, 240000);
});

describe('balance: Variant B', () => {
  for (const st of STAGES) {
    it(`can be won on stage ${st.id} (${st.alt!.name}) on every seed tried`, () => {
      const o = outcome(st.id, 'alt', ALT_SEEDS);
      console.log(`stage ${st.id} B: won ${o.wins}/${o.runs}, lives kept ${Math.round(o.share * 100)}% [${o.lives.join(', ')}] of ${o.start}`);
      expect(o.wins, `lives per seed ${ALT_SEEDS}: ${o.lives}`).toBe(o.runs);
    }, 60000);
  }
});

describe('balance: oaths', () => {
  // Oaths are optional challenges, so the bot does not have to win them. Each must run to a result and must bite.
  for (const oath of OATHS) {
    it(`${oath} plays to a result on all 20 stages and costs the bot lives on at least five of them`, () => {
      let harder = 0;
      const lines: string[] = [];
      for (const st of STAGES) {
        const mods = typicalMods(st.id);
        const r = playStage(st.id, mods, 7, 1500, { oaths: [oath] });
        expect(r.b.over, `stage ${st.id} ${oath} finished`).toBe(true);
        const base = playStage(st.id, mods, 7);
        if (r.lives < base.lives) harder++;
        lines.push(`${st.id}:${r.won ? r.lives : 'L'}/${base.lives}`);
      }
      console.log(`${oath} lives (oath/standard) by stage: ${lines.join(' ')}`);
      expect(harder, `${oath} costs the bot lives on at least a quarter of the stages`).toBeGreaterThanOrEqual(5);
    }, 240000);
  }
});

describe('star rule', () => {
  it('matches the stars a finished battle gives', async () => {
    const { starLives } = await import('../src/game/sim');
    for (const start of [15, 20, 23, 25, 30, 40]) {
      const n = starLives(start);
      expect(n.three / start).toBeGreaterThanOrEqual(0.9);
      expect((n.three - 1) / start).toBeLessThan(0.9);
      expect(n.two / start).toBeGreaterThanOrEqual(0.5);
      expect((n.two - 1) / start).toBeLessThan(0.5);
    }
    expect(starLives(20)).toEqual({ three: 18, two: 10 });
    expect(starLives(30)).toEqual({ three: 27, two: 15 });
  });
});
