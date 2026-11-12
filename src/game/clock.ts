/** Fixed 1/30 s battle step clock shared between human gameplay frames and tests. */
export const FIXED_STEP = 1 / 30;
export const MAX_FRAME_DT = 0.05;

export class BattleClock {
  private acc = 0;

  reset() { this.acc = 0; }

  /** Consume raw frame elapsed seconds into fixed `1/30` ticks scaled by speed. */
  advance(rawDt: number, speed: number, paused: boolean, stepFn: (stepDt: number) => void) {
    if (paused) return;
    const clamped = Math.min(MAX_FRAME_DT, Math.max(0, rawDt));
    this.acc += clamped * speed;
    while (this.acc >= FIXED_STEP - 1e-9) {
      this.acc -= FIXED_STEP;
      stepFn(FIXED_STEP);
    }
  }
}
