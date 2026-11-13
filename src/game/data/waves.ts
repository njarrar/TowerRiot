import { ENEMIES, type EnemyKind } from './enemies';

export interface Group { kind: EnemyKind; n: number; gap: number; spawn?: string; delay: number }
export interface WaveDef { hint: string; groups: Group[] }

const DEFAULT_GAP: Partial<Record<EnemyKind, number>> = {
  grub: 0.9, skitter: 0.5, shell: 2.2, moth: 0.8, warden: 6, mender: 4, shade: 1.2,
  splitter: 1.6, sapper: 2, burrower: 1.4, ashmoth: 0.9, elite: 2.6,
  husk: 0.9, hound: 0.7, glasshide: 2.4, veilmoth: 0.9, ram: 7, herald: 6,
};

/**
 * Parse a compact wave line, for example `12 grub, 6 skitter @s +4 /0.6`.
 * Each group is `<count> <kind>` then any of `@spawn`, `+delay` (seconds), `/gap` (seconds).
 */
export function parseWave(line: string): Group[] {
  return line.split(',').map(part => {
    const t = part.trim().split(/\s+/);
    const n = Number(t[0]);
    const kind = t[1] as EnemyKind;
    if (!Number.isFinite(n) || n < 1) throw new Error(`Bad count in wave group "${part}"`);
    if (!ENEMIES[kind]) throw new Error(`Unknown foe "${t[1]}" in wave group "${part}"`);
    const grp: Group = { kind, n, gap: DEFAULT_GAP[kind] ?? 3, delay: 0 };
    for (const m of t.slice(2)) {
      if (m.startsWith('@')) grp.spawn = m.slice(1);
      else if (m.startsWith('+')) grp.delay = Number(m.slice(1));
      else if (m.startsWith('/')) grp.gap = Number(m.slice(1));
      else throw new Error(`Unknown wave modifier "${m}" in "${part}"`);
    }
    return grp;
  });
}

/** Build a wave list from [hint, line] pairs. */
export const waves = (list: [string, string][]): WaveDef[] => list.map(([hint, line]) => ({ hint, groups: parseWave(line) }));

/** Seconds from wave start until its last foe leaves the rift. */
export const waveLength = (w: WaveDef) => Math.max(...w.groups.map(g => g.delay + (g.n - 1) * g.gap));
