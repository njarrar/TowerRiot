import { describe, expect, it } from 'vitest';
import { STAGES, spawnsOf } from '../src/game/data/stages';
import { makePath, smooth, distToPath } from '../src/game/path';

describe('stages', () => {
  it('has twenty stages with ids 1 to 20 in order', () => {
    expect(STAGES.map(s => s.id)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  for (const st of STAGES) {
    describe(`${st.id} ${st.name}`, () => {
      const roads = st.roads.map(r => ({ r, p: makePath(r.id, smooth(r.ctrl)) }));
      const waters = st.waters.map(w => ({ w, p: makePath('w', smooth(w.ctrl)) }));
      const spawns = spawnsOf(st);

      it('keeps every plot off the roads and water, apart and on screen', () => {
        const bad: string[] = [];
        st.plots.forEach((pl, i) => {
          const [x, y] = pl.at;
          if (x < 40 || x > 1245 || y < 60 || y > 690) bad.push(`plot ${i} off screen`);
          for (const { r, p } of roads) { const d = distToPath(p, x, y); if (d < r.w / 2 + 24) bad.push(`plot ${i} ${Math.round(d)}px from road ${r.id}`); }
          for (const { w, p } of waters) { const d = distToPath(p, x, y); if (d < w.w / 2 + 22) bad.push(`plot ${i} ${Math.round(d)}px from water`); }
          st.plots.forEach((o, j) => { if (j > i && Math.hypot(o.at[0] - x, o.at[1] - y) < 64) bad.push(`plots ${i} and ${j} overlap`); });
        });
        expect(bad).toEqual([]);
      });

      it('names only spawns and roads that exist', () => {
        for (const w of st.waves) for (const g of w.groups) {
          if (g.spawn) expect(spawns.has(g.spawn), `spawn ${g.spawn}`).toBe(true);
        }
        const ids = new Set(st.roads.map(r => r.id));
        for (const s of st.shifts ?? []) for (const c of s.closes) expect(ids.has(c)).toBe(true);
        for (const b of st.barriers ?? []) expect(ids.has(b.road)).toBe(true);
        for (const b of st.belts ?? []) expect(ids.has(b.road)).toBe(true);
        for (const v of st.vents ?? []) expect(ids.has(v.road)).toBe(true);
      });

      it('never closes every road from one rift at the same time', () => {
        for (let t = 0; t < 200; t += 0.5) {
          const closed = new Set((st.shifts ?? []).filter(s => ((t - s.start) % s.every + s.every) % s.every < s.dur).flatMap(s => s.closes));
          for (const [id, rs] of spawns) expect(rs.some(r => !closed.has(r.id)), `rift ${id} at ${t}s`).toBe(true);
        }
      });

      it('has enough plots and waves to be a real stage', () => {
        expect(st.plots.length).toBeGreaterThanOrEqual(9);
        expect(st.waves.length).toBeGreaterThanOrEqual(6);
      });
    });
  }
});
