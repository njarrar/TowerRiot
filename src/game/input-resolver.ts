export const DRAG_SLOP = 10;
export const TAP_SLOP = 18;
export const MENU_BOUNCE_MS = 200;
export const ACTION_ARM_MS = 300;
export const TOUCH_DRAG_OFFSET_Y = 68;
export const HERO_GRAB_RADIUS = 56;

export type HitTarget =
  | { kind: 'tower'; id: number }
  | { kind: 'plot'; index: number }
  | { kind: 'switch'; index: number }
  | { kind: 'rift'; spawnId: string }
  | { kind: 'rune' }
  | { kind: 'gate'; x: number; y: number }
  | { kind: 'foe'; id: number; inLeash: boolean }
  | { kind: 'hero' }
  | { kind: 'ground' };

export type PointerAction =
  | { kind: 'none' }
  | { kind: 'panStart' }
  | { kind: 'pan'; dx: number }
  | { kind: 'heroDragStart' }
  | { kind: 'heroDrag'; x: number; y: number }
  | { kind: 'heroPin'; x: number; y: number }
  | { kind: 'aimW'; x: number; y: number; cancel: boolean }
  | { kind: 'commitW'; x: number; y: number; cancel: boolean }
  | { kind: 'tap'; target: HitTarget; x: number; y: number; pointerType: string };

/**
 * Pure multi-touch pointer arbiter enforcing:
 * - `activePointerId` locking (2nd finger cannot hijack mid-gesture)
 * - Freeze hit candidate at pointerdown (never cross-class fallthrough on pointerup)
 * - Distinct drag_slop (10) vs tap_slop (18)
 * - Finger or pen Drag-to-Pin (Wren grab radius 56) & Drag-to-Aim W (`cancel` zone hysteresis 64/48)
 * - Tap-to-aim W (`tapAim`): the lantern lands exactly under the pointer, with no drag offset and no cancel zone
 * - Wren standing on a switch: a drag moves her, a clean tap still flips the switch
 */
export class InputResolver {
  private activeId: number | null = null;
  private downScreenX = 0;
  private downScreenY = 0;
  private lastScreenX = 0;
  private pointerType = 'touch';
  private lockedTarget: HitTarget = { kind: 'ground' };
  private mode: 'idle' | 'pan' | 'heroDrag' | 'aimW' = 'idle';
  private movedDist = 0;
  private inCancelZone = false;
  /** World px the W target sits above a finger, so the finger does not hide it. 0 for mouse, pen and tap-to-aim. */
  private aimOffsetY = 0;
  /** False in tap-to-aim: releasing near Wren still throws. */
  private aimCancels = true;
  /** Down on a switch within Wren's grab radius: becomes a hero drag once the pointer moves past drag slop. */
  private pendingHero = false;
  private lastPanelOpenAt = -9999;

  markPanelOpened(nowMs: number) { this.lastPanelOpenAt = nowMs; }
  canConfirmPanelAction(nowMs: number): boolean { return nowMs - this.lastPanelOpenAt >= MENU_BOUNCE_MS; }

  onDown(opts: {
    pointerId: number;
    screenX: number;
    screenY: number;
    worldX: number;
    worldY: number;
    pointerType: string;
    aimingW: boolean;
    /** Accessibility setting: aim W by tapping the spot. */
    tapAim?: boolean;
    heroX: number;
    heroY: number;
    /** The pointer is inside Wren's grab radius, whatever `hit` says is on top. */
    heroGrab?: boolean;
    hit: HitTarget;
  }): PointerAction {
    // Secondary finger cannot hijack an active gesture; only empty ground pan can be ignored safely.
    if (this.activeId !== null) return { kind: 'none' };
    this.activeId = opts.pointerId;
    this.downScreenX = opts.screenX;
    this.downScreenY = opts.screenY;
    this.lastScreenX = opts.screenX;
    this.pointerType = opts.pointerType;
    this.movedDist = 0;
    this.lockedTarget = opts.hit;
    this.pendingHero = false;

    if (opts.aimingW) {
      this.mode = 'aimW';
      this.aimOffsetY = opts.pointerType === 'touch' && !opts.tapAim ? TOUCH_DRAG_OFFSET_Y : 0;
      this.aimCancels = !opts.tapAim;
      this.inCancelZone = this.aimCancels && Math.hypot(opts.worldX - opts.heroX, opts.worldY - opts.heroY) < 64;
      return { kind: 'aimW', x: opts.worldX, y: opts.worldY - this.aimOffsetY, cancel: this.inCancelZone };
    }

    // A finger or a pen drags Wren; a mouse clicks the ground instead.
    const drags = opts.pointerType !== 'mouse';
    if (opts.hit.kind === 'hero' && drags) {
      this.mode = 'heroDrag';
      return { kind: 'heroDragStart' };
    }

    this.mode = 'idle';
    this.pendingHero = drags && opts.hit.kind === 'switch' && !!opts.heroGrab;
    return { kind: 'none' };
  }

  onMove(opts: {
    pointerId: number;
    screenX: number;
    screenY: number;
    worldX: number;
    worldY: number;
    canPan: boolean;
    heroX: number;
    heroY: number;
  }): PointerAction {
    if (this.activeId !== opts.pointerId) return { kind: 'none' };
    const dist = Math.hypot(opts.screenX - this.downScreenX, opts.screenY - this.downScreenY);
    this.movedDist = Math.max(this.movedDist, dist);

    if (this.mode === 'aimW') {
      const dHero = Math.hypot(opts.worldX - opts.heroX, opts.worldY - opts.heroY);
      // 64 enter / 48 exit hysteresis prevents flicker on cancel boundary
      this.inCancelZone = this.aimCancels && (this.inCancelZone ? dHero < 64 : dHero < 48);
      return { kind: 'aimW', x: opts.worldX, y: opts.worldY - this.aimOffsetY, cancel: this.inCancelZone };
    }

    if (this.mode === 'heroDrag') {
      return { kind: 'heroDrag', x: opts.worldX, y: opts.worldY };
    }

    if (this.pendingHero && this.mode === 'idle' && dist > DRAG_SLOP) {
      this.pendingHero = false;
      this.mode = 'heroDrag';
      return { kind: 'heroDragStart' };
    }

    if (opts.canPan && this.mode === 'idle' && Math.abs(opts.screenX - this.downScreenX) > DRAG_SLOP) {
      this.mode = 'pan';
      this.lastScreenX = opts.screenX;
      return { kind: 'panStart' };
    }

    if (this.mode === 'pan') {
      const dx = opts.screenX - this.lastScreenX;
      this.lastScreenX = opts.screenX;
      return { kind: 'pan', dx };
    }

    return { kind: 'none' };
  }

  onUp(opts: { pointerId: number; screenX: number; screenY: number; worldX: number; worldY: number }): PointerAction {
    if (this.activeId !== opts.pointerId) return { kind: 'none' };
    this.activeId = null;
    const mode = this.mode;
    const target = this.lockedTarget;
    const ptr = this.pointerType;
    const cancel = this.inCancelZone;
    const total = Math.max(this.movedDist, Math.hypot(opts.screenX - this.downScreenX, opts.screenY - this.downScreenY));
    this.mode = 'idle';
    this.lockedTarget = { kind: 'ground' };
    this.inCancelZone = false;
    this.pendingHero = false;

    if (mode === 'aimW') {
      return { kind: 'commitW', x: opts.worldX, y: opts.worldY - this.aimOffsetY, cancel };
    }
    if (mode === 'heroDrag') {
      return { kind: 'heroPin', x: opts.worldX, y: opts.worldY };
    }
    if (mode === 'pan' || total > TAP_SLOP) {
      return { kind: 'none' };
    }
    return { kind: 'tap', target, x: opts.worldX, y: opts.worldY, pointerType: ptr };
  }

  onCancel(pointerId?: number) {
    if (pointerId !== undefined && this.activeId !== pointerId) return;
    this.activeId = null;
    this.mode = 'idle';
    this.lockedTarget = { kind: 'ground' };
    this.inCancelZone = false;
    this.pendingHero = false;
  }
}
