export type Vec = [number, number];

export interface Seg { a: Vec; b: Vec; l: number; s: number }
export interface Path { id: string; pts: Vec[]; segs: Seg[]; tot: number }

/** Catmull-Rom smoothing of control points, `steps` samples per span. */
export function smooth(ctrl: Vec[], steps = 12): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let k = 0; k < steps; k++) {
      const t = k / steps, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

export function makePath(id: string, pts: Vec[]): Path {
  const segs: Seg[] = [];
  let tot = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l === 0) continue;
    segs.push({ a, b, l, s: tot });
    tot += l;
  }
  return { id, pts, segs, tot };
}

export interface PathPoint { x: number; y: number; dir: number }

/** Point at distance d along the path. dir is +1 when the path heads right, -1 when it heads left. */
export function pointAt(p: Path, d: number): PathPoint {
  const dd = Math.max(0, Math.min(p.tot, d));
  let lo = 0, hi = p.segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (p.segs[mid].s <= dd) lo = mid; else hi = mid - 1;
  }
  const q = p.segs[lo];
  const t = q.l ? (dd - q.s) / q.l : 0;
  return { x: q.a[0] + (q.b[0] - q.a[0]) * t, y: q.a[1] + (q.b[1] - q.a[1]) * t, dir: Math.sign(q.b[0] - q.a[0]) || 1 };
}

/** Shortest distance from (x,y) to the path polyline. */
export function distToPath(p: Path, x: number, y: number): number {
  let best = Infinity;
  for (const q of p.segs) {
    const dx = q.b[0] - q.a[0], dy = q.b[1] - q.a[1];
    const t = Math.max(0, Math.min(1, ((x - q.a[0]) * dx + (y - q.a[1]) * dy) / (q.l * q.l)));
    const d = Math.hypot(q.a[0] + dx * t - x, q.a[1] + dy * t - y);
    if (d < best) best = d;
  }
  return best;
}
