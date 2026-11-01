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
