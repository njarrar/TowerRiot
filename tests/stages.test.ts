import { describe, expect, it } from 'vitest';
import { STAGES, TWIN_RIFTS_HP, resolveStageVariant, spawnsOf, stageSignature, type OathId } from '../src/game/data/stages';
import { makePath, smooth, distToPath, pointAt } from '../src/game/path';

function inPoly(poly: [number, number][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

describe('stages', () => {
  it('has twenty distinct stages with ids 1 to 20 and unique Variant B layouts', () => {
    expect(STAGES.map(s => s.id)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    const names = new Set(STAGES.map(s => s.name));
    expect(names.size).toBe(20);
    const altNames = new Set(STAGES.map(s => s.alt?.name).filter(Boolean));
    expect(altNames.size).toBe(20);

    // Every stage has distinct road geometry + plot centroid signature.
    const signatures = new Set(STAGES.map(s => {
      const roadSig = s.roads.map(r => `${r.ctrl[0].join(',')}-${r.ctrl[r.ctrl.length - 1].join(',')}:${r.ctrl.length}`).join('|');
      const cx = Math.round(s.plots.reduce((a, p) => a + p.at[0], 0) / s.plots.length);
      return `${roadSig}#${cx}`;
    }));
    expect(signatures.size).toBe(20);
  });

  it('keeps every layout coherent: a stage reverses whole or not at all, and no rift sits on a Keep', () => {
    for (const raw of STAGES) {
      const rev = raw.alt?.reverseRoads ?? [];
      if (rev.length) expect([...rev].sort(), `stage ${raw.id} reverses only part of its roads`).toEqual(raw.roads.map(r => r.id).sort());
      for (const variant of ['standard', 'alt'] as const) {
        const st = resolveStageVariant(raw, variant);
        for (const a of st.roads) for (const b of st.roads) {
          const [sx, sy] = a.ctrl[0], [ex, ey] = b.ctrl[b.ctrl.length - 1];
          expect(Math.hypot(sx - ex, sy - ey) >= 140, `stage ${raw.id} ${variant}: ${a.id} starts on the end of ${b.id}`).toBe(true);
        }
      }
    }
  });

  it('makes Variant B, Twin Rifts and Shifting Earth change every one of the 20 stages', () => {
    for (const raw of STAGES) {
      const std = resolveStageVariant(raw);
      const sig = stageSignature(std);
      expect(stageSignature(resolveStageVariant(raw, 'alt')), `stage ${raw.id} Variant B`).not.toBe(sig);

      const twin = resolveStageVariant(raw, 'standard', ['twinRifts']);
      expect((twin.hpMul ?? 1) / (std.hpMul ?? 1), `stage ${raw.id} Twin Rifts toughens foes`).toBeCloseTo(TWIN_RIFTS_HP, 9);
      expect(TWIN_RIFTS_HP).toBeGreaterThan(1);
      expect(twin.roads.every(r => r.openOnPhase !== undefined || (r.openAtWave ?? 1) === 1)).toBe(true);
      expect(twin.plots.map(p => p.openAtWave)).toEqual(std.plots.map(p => p.openAtWave));

      const shift = resolveStageVariant(raw, 'standard', ['shiftingEarth']);
      const added = shift.plots.map((p, i) => ({ p, i })).filter(({ p, i }) => p.sinkAt !== undefined && std.plots[i].sinkAt === undefined);
      expect(added.length, `stage ${raw.id} Shifting Earth sinks two plots`).toBe(2);
      expect(added[0].p.sinkAt).not.toBe(added[1].p.sinkAt);
      for (const { p } of added) expect(p.sinkAt! >= 2 && p.sinkAt! <= raw.waves.length).toBe(true);
      (std.shifts ?? []).forEach((s, i) => expect(shift.shifts![i].dur, 'closures are cut short').toBeLessThan(s.dur));
    }
  });

  it('sends foes to a rift that a variant or oath opens early', () => {
    let checked = 0;
    for (const raw of STAGES) {
      for (const [variant, oaths] of [['alt', []], ['standard', ['twinRifts']]] as ['standard' | 'alt', OathId[]][]) {
        const st = resolveStageVariant(raw, variant, oaths);
        for (const r of st.roads) {
          const was = raw.roads.find(o => o.id === r.id)!;
          if (r.openOnPhase !== undefined || (r.openAtWave ?? 1) >= (was.openAtWave ?? 1)) continue;
          // Untagged stages share one rift, and a rift that was already live is already fed.
          if (!raw.waves.some(w => w.groups.some(g => g.spawn === r.spawn))) continue;
          const liveBefore = Math.min(...raw.roads.filter(o => o.spawn === r.spawn && o.openOnPhase === undefined).map(o => o.openAtWave ?? 1));
          if (liveBefore <= (r.openAtWave ?? 1)) continue;
          const first = st.waves.findIndex(w => w.groups.some(g => g.spawn === r.spawn));
          expect(first + 1, `stage ${raw.id} ${variant} [${oaths}]: road ${r.id} opens on wave ${r.openAtWave ?? 1}`).toBeLessThanOrEqual(r.openAtWave ?? 1);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('never closes every road from one rift, in any layout or under any oath', () => {
    const oathSets: OathId[][] = [[], ['shiftingEarth'], ['twinRifts', 'shiftingEarth', 'longNight']];
    for (const raw of STAGES) for (const variant of ['standard', 'alt'] as const) for (const oaths of oathSets) {
      const st = resolveStageVariant(raw, variant, oaths);
      const spawns = spawnsOf(st);
      for (const s of st.shifts ?? []) expect(s.dur, `stage ${raw.id} shift longer than its cycle`).toBeLessThan(s.every);
      for (let t = 0; t < 400; t += 0.5) {
        const closed = new Set((st.shifts ?? []).filter(s => ((t - s.start) % s.every + s.every) % s.every < s.dur).flatMap(s => s.closes));
        for (const [id, rs] of spawns) {
          expect(rs.some(r => !closed.has(r.id)), `stage ${raw.id} ${variant} [${oaths}] rift ${id} at ${t}s`).toBe(true);
        }
      }
    }
  });

  for (const raw of STAGES) {
    for (const variant of ['standard', 'alt'] as const) {
      const st = resolveStageVariant(raw, variant);
      describe(`${st.id} ${st.name} [${variant}]`, () => {
        const roads = st.roads.map(r => ({ r, p: makePath(r.id, smooth(r.ctrl)) }));
        const waters = st.waters.map(w => ({ w, p: makePath(w.id ?? 'w', smooth(w.ctrl)) }));
        const spawns = spawnsOf(st);

        it('keeps every plot clear of HUD top, roads, active water, overlaps, and within tower reach', () => {
          const bad: string[] = [];
          st.plots.forEach((pl, i) => {
            const [x, y] = pl.at;
            if (x < 40 || x > 1245 || y < 115 || y > 690) bad.push(`plot ${i} out of safe bounds (${x},${y})`);
            for (const { r, p } of roads) {
              const d = distToPath(p, x, y);
              if (d < r.w / 2 + 24) bad.push(`plot ${i} ${Math.round(d)}px from road ${r.id}`);
            }
            const plotWave = pl.openAtWave ?? 1;
            for (const { w, p } of waters) {
              // Ignore water bodies that already drained on or before this plot becomes buildable.
              if (w.drainAtWave !== undefined && w.drainAtWave <= plotWave) continue;
              const d = distToPath(p, x, y);
              if (d < w.w / 2 + 22) bad.push(`plot ${i} ${Math.round(d)}px from water ${w.id ?? ''}`);
            }
            st.plots.forEach((o, j) => {
              if (j > i && Math.hypot(o.at[0] - x, o.at[1] - y) < 64) bad.push(`plots ${i} and ${j} overlap`);
            });
            let minEll = Infinity;
            for (const { p } of roads) {
              for (let d = 0; d <= p.tot; d += 12) {
                const pt = pointAt(p, d);
                const e = Math.hypot(pt.x - x, (pt.y - y) / 0.8);
                if (e < minEll) minEll = e;
              }
            }
            const maxEll = st.high && inPoly(st.high, x, y) ? 225 : 190;
            if (minEll > maxEll) bad.push(`plot ${i} cannot reach any road (${Math.round(minEll)} > ${maxEll})`);
          });
          expect(bad).toEqual([]);
        });

        it('keeps every gate endpoint inside the visible playfield', () => {
          for (const r of st.roads) {
            const [gx, gy] = r.ctrl[r.ctrl.length - 1];
            expect(gx >= 40 && gx <= 1250 && gy >= 60 && gy <= 690, `${r.id} gate [${gx}, ${gy}]`).toBe(true);
          }
        });

        it('references only valid spawns, roads, waters, and plot indices', () => {
          for (const w of st.waves) for (const g of w.groups) {
            if (g.spawn) expect(spawns.has(g.spawn), `spawn ${g.spawn}`).toBe(true);
          }
          const roadIds = new Set(st.roads.map(r => r.id));
          const waterIds = new Set(st.waters.map(w => w.id).filter(Boolean));
          for (const s of st.shifts ?? []) for (const c of s.closes) expect(roadIds.has(c)).toBe(true);
          for (const b of st.barriers ?? []) expect(roadIds.has(b.road)).toBe(true);
          for (const b of st.belts ?? []) expect(roadIds.has(b.road)).toBe(true);
          for (const v of st.vents ?? []) expect(roadIds.has(v.road)).toBe(true);
          for (const sw of st.switches ?? []) {
            for (const id of sw.closesA ?? []) expect(roadIds.has(id)).toBe(true);
            for (const id of sw.closesB ?? []) expect(roadIds.has(id)).toBe(true);
            if (sw.targetRoad) expect(roadIds.has(sw.targetRoad)).toBe(true);
            if (sw.mode !== 'fork') expect((sw.dur ?? 0) > 0 && (sw.dur ?? 0) < sw.cd, `switch ${sw.id} auto-resets before cd`).toBe(true);
          }
          for (const po of st.portals ?? []) {
            expect(roadIds.has(po.fromRoad), `portal ${po.id} fromRoad`).toBe(true);
            expect(roadIds.has(po.toRoad), `portal ${po.id} toRoad`).toBe(true);
          }
          for (const tf of st.terraforms ?? []) {
            for (const wId of tf.waters ?? []) expect(waterIds.has(wId), `terraform water ${wId}`).toBe(true);
            for (const rId of tf.openRoads ?? []) expect(roadIds.has(rId), `terraform openRoad ${rId}`).toBe(true);
            for (const rId of tf.closeRoads ?? []) expect(roadIds.has(rId), `terraform closeRoad ${rId}`).toBe(true);
            for (const pi of tf.openPlots ?? []) expect(pi >= 0 && pi < st.plots.length, `openPlot ${pi}`).toBe(true);
            for (const pi of tf.sinkPlots ?? []) expect(pi >= 0 && pi < st.plots.length, `sinkPlot ${pi}`).toBe(true);
          }
        });

        it('never closes every active road from one rift at the same time', () => {
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
  }
});
