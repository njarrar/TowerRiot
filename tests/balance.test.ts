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
