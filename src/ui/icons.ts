import { LFX } from '../art/lfx.js';
import { paintTower } from '../render/scene';
import type { TowerKind } from '../game/data/towers';
import type { EnemyKind } from '../game/data/enemies';

const cache = new Map<string, string>();

/** A tower painted once into a small image, for menus. */
export function towerIcon(kind: TowerKind, size = 96): string {
  const key = `t:${kind}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = size * 2; c.height = size * 2;
  const g = c.getContext('2d')!;
  g.scale(2 * size / 128, 2 * size / 128);
  paintTower(g, kind, 64, 120, 0.56, 'base', 11);
  paintTower(g, kind, 64, 120, 0.56, 'emit', 11);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

/** A foe painted once, for the stage card and codex. */
export function foeIcon(kind: EnemyKind, size = 72): string {
  const key = `f:${kind}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = size * 2; c.height = size * 2;
  const g = c.getContext('2d')!;
  g.scale(2 * size / 128, 2 * size / 128);
  for (const pass of ['base', 'emit'] as const) {
    switch (kind) {
      case 'moth': case 'ashmoth': LFX.moth(g, 64, 70, 0.8, pass, 51, 30); break;
      case 'queen': LFX.moth(g, 64, 70, 0.9, pass, 51, 30); break;
      case 'shell': case 'sapper': case 'elite': case 'warden': case 'colossus': LFX.shellback(g, 62, 100, kind === 'colossus' ? 1 : 0.85, pass, 61, 1, kind === 'shell' ? 1 : 0); break;
      default: LFX.grub(g, 64, 92, kind === 'skitter' ? 0.6 : 0.85, pass, 41, 1);
    }
  }
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

/** Wren's head and shoulders, painted once, for the hero card. */
export function heroIcon(size = 40): string {
  const key = `h:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = size * 2; c.height = size * 2;
  const g = c.getContext('2d')!;
  g.scale(2 * size / 128, 2 * size / 128);
  // Frame the upper body: she is drawn feet at (x, y), about 110 px tall at scale 1.4.
  LFX.wren(g, 66, 186, 3.6, 'base');
  LFX.wren(g, 66, 186, 3.6, 'emit');
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

/* Small line icons for the HUD, drawn on a 24 grid with the current text colour. */
const svg = (body: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const SKILL_ICON: Record<'q' | 'w' | 'e' | 'r', string> = {
  // A spear and the arc of its sweep.
  q: svg('<path d="M5 19 19 5"/><path d="M15 5h4v4"/><path d="M4 12a8 8 0 0 0 8 8" stroke-dasharray="2 3"/>'),
  // A lantern on its ring.
  w: svg('<path d="M12 3v3"/><rect x="7.5" y="6" width="9" height="12" rx="2"/><path d="M9 21h6"/><path d="M12 10v4"/>'),
  // Wren at the centre of a ring of towers.
  e: svg('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8.5" stroke-dasharray="3 3"/>'),
  // The sun on the horizon.
  r: svg('<path d="M3 17h18"/><path d="M7 17a5 5 0 0 1 10 0"/><path d="M12 6v2M5.5 9.5l1.4 1.4M18.5 9.5l-1.4 1.4"/>'),
};

export const LOCK_ICON = svg('<rect x="6" y="11" width="12" height="9" rx="2"/><path d="M9 11V8a3 3 0 0 1 6 0v3"/>');

export const ELEMENT_ICON: Record<string, string> = {
  pierce: svg('<path d="M4 20 18 6"/><path d="M13 5h6v6"/><path d="M4 16v4h4"/>'),
  fire: svg('<path d="M12 3c3 4 6 6.5 6 11a6 6 0 0 1-12 0c0-3 1.6-4.6 2.8-6.2C9.6 10 11 11 11.5 12.5 13 10 12.8 6.5 12 3z"/>'),
  frost: svg('<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5"/>'),
  storm: svg('<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>'),
  nature: svg('<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19 13 11"/>'),
};

/** A speaker with sound waves, and the same speaker struck through: sound on and muted. */
export const SOUND_ICON = svg('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>');
export const MUTE_ICON = svg('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>');
export const PAUSE_ICON = svg('<path d="M9 5v14M15 5v14"/>');
export const PLAY_ICON = svg('<path d="M8 5v14l11-7z"/>');
/** A door left ajar: leave the battle. */
export const LEAVE_ICON = svg('<path d="M14 4H6v16h8"/><path d="M11 12h10M17 8l4 4-4 4"/>');
/** Wings, for foes that fly. */
export const WING_ICON = svg('<path d="M12 14c-2-4-5-6-9-6 1 4 4 7 9 8 5-1 8-4 9-8-4 0-7 2-9 6z"/>');
