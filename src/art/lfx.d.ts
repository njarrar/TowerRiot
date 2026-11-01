/** The hand-painted canvas art library. Every painter draws in two passes: 'base' (matter) and 'emit' (glow). */
type Ctx = CanvasRenderingContext2D;
type Pass = 'base' | 'emit';
type V = [number, number];
type Light = [number, number, number, number, string?];
export interface LfxExtra {
  forgeCannon(c: Ctx, x: number, y: number, s: number, pass: Pass, seed: number): void;
  cannonBarrel(c: Ctx, x: number, y: number, s: number, aim: number, recoil: number, flash: number): void;
  beaconTower(c: Ctx, x: number, y: number, s: number, pass: Pass, seed: number): void;
  beaconFire(c: Ctx, x: number, y: number, s: number, t: number): void;
  rootGarden(c: Ctx, x: number, y: number, s: number, pass: Pass, seed: number): void;
  rootPods(c: Ctx, x: number, y: number, s: number, t: number, hot: number): void;
  paintField(c: Ctx, w: number, h: number, m: unknown): void;
}
export interface Lfx {
  watchTower(c: Ctx, x: number, y: number, s: number, pass: Pass, seed: number): void;
  frostBell(c: Ctx, x: number, y: number, s: number, pass: Pass, seed: number): void;
  stormPylon(c: Ctx, x: number, y: number, s: number, pass: Pass, seed: number, zap?: V | null): void;
  grub(c: Ctx, x: number, y: number, s: number, pass: Pass, seed: number, face: number): void;
  moth(c: Ctx, x: number, y: number, s: number, pass: Pass, seed: number, alt: number): void;
  shellback(c: Ctx, x: number, y: number, s: number, pass: Pass, seed: number, face: number, frost: number): void;
  wren(c: Ctx, x: number, y: number, s: number, pass: Pass): void;
  gate(c: Ctx, x: number, y: number, pass: Pass): void;
  ruinWall(c: Ctx, x: number, y: number, len: number, seed: number): void;
  deadTree(c: Ctx, x: number, y: number, s: number, seed: number): void;
  standingStone(c: Ctx, x: number, y: number, h: number, seed: number): void;
  plot(c: Ctx, x: number, y: number, seed: number, empty: number): void;
  shadow(c: Ctx, x: number, y: number, rx: number, ry: number, a: number): void;
  glow(c: Ctx, x: number, y: number, r: number, color: string, a: number): void;
  darkness(c: Ctx, w: number, h: number, lights: Light[], amt: number): void;
  vignette(c: Ctx, w: number, h: number, a: number): void;
  fog(c: Ctx, w: number, h: number, seed: number, t: number, a: number): void;
  bolt(c: Ctx, x0: number, y0: number, x1: number, y1: number, seed: number, segs: number, width: number): void;
  strokePts(c: Ctx, pts: V[]): void;
  catmull(pts: V[], steps: number): V[];
  offset(pts: V[], o: number, seed: number, wob: number): V[];
  groundTile(c: Ctx, w: number, h: number, seed: number, kind: string | null): void;
  mix(a: number, b: number, t: number): number;
  TAU: number;
  EXTRA: LfxExtra;
}
export declare const LFX: Lfx;
