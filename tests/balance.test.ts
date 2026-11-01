import { describe, expect, it } from 'vitest';
import { STAGES } from '../src/game/data/stages';
import { playStage, typicalMods } from './bot';

describe('balance: a plain greedy player', () => {
  for (const st of STAGES) {
    it(`can win stage ${st.id} ${st.name}`, () => {
      const r = playStage(st.id, typicalMods(st.id));
      console.log(`stage ${st.id}: won=${r.won} lives=${r.lives} waves=${r.waves} wren=${r.level} towers=${r.towers} gold=${r.gold}`);
      expect(r.won).toBe(true);
    }, 30000);
  }
});

describe('star rule', () => {
  it('matches the stars a finished battle gives', async () => {
    const { starLives } = await import('../src/game/sim');
    for (const start of [15, 20, 23, 25]) {
      const n = starLives(start);
      expect(n.three / start).toBeGreaterThanOrEqual(0.9);
      expect((n.three - 1) / start).toBeLessThan(0.9);
      expect(n.two / start).toBeGreaterThanOrEqual(0.5);
      expect((n.two - 1) / start).toBeLessThan(0.5);
    }
    expect(starLives(20)).toEqual({ three: 18, two: 10 });
  });
});
