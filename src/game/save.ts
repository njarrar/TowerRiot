import { STAGES } from './data/stages';
import { NODES, TREES } from './data/trees';
import { buildMods, type Mods } from './mods';

export const SAVE_KEY = 'towerriot.save.v1';

export interface Settings { sound: boolean; reduceMotion: boolean; autoSkills: boolean }
export interface Save {
  version: 1;
  /** Best stars per stage id. */
  stars: Record<number, number>;
  /** Bought tree nodes. */
  nodes: string[];
  settings: Settings;
  seenIntro: boolean;
}

export const freshSave = (): Save => ({
  version: 1, stars: {}, nodes: [],
  settings: { sound: true, reduceMotion: false, autoSkills: false },
  seenIntro: false,
});

/** Storage may be missing or throw (private mode); the game still runs, it just forgets. */
export interface Store { get(k: string): string | null; set(k: string, v: string): void }
export const browserStore = (): Store => ({
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
});

export function loadSave(store: Store): Save {
  const raw = store.get(SAVE_KEY);
  if (!raw) return freshSave();
  try {
    const s = JSON.parse(raw) as Partial<Save>;
    const base = freshSave();
    return {
      version: 1,
      stars: typeof s.stars === 'object' && s.stars ? s.stars : {},
      nodes: Array.isArray(s.nodes) ? s.nodes.filter(id => NODES.has(id)) : [],
      settings: { ...base.settings, ...(s.settings ?? {}) },
      seenIntro: !!s.seenIntro,
    };
  } catch {
    return freshSave();
  }
}

export const writeSave = (store: Store, s: Save) => store.set(SAVE_KEY, JSON.stringify(s));

/** Highest stage id cleared in a row from stage 1. */
export function cleared(s: Save): number {
  let n = 0;
  for (const st of STAGES) { if ((s.stars[st.id] ?? 0) > 0) n = st.id; else break; }
  return n;
}

export const isUnlocked = (s: Save, id: number) => id <= cleared(s) + 1;
export const totalStars = (s: Save) => Object.values(s.stars).reduce((a, b) => a + b, 0);

/** Embers: one per star plus two per stage cleared, minus what the trees cost. */
export function embers(s: Save): { earned: number; spent: number; free: number } {
  const earned = totalStars(s) + 2 * Object.values(s.stars).filter(v => v > 0).length;
  const spent = s.nodes.reduce((a, id) => a + (NODES.get(id)?.cost ?? 0), 0);
  return { earned, spent, free: earned - spent };
}

export function canBuyNode(s: Save, id: string): boolean {
  const n = NODES.get(id);
  if (!n || s.nodes.includes(id)) return false;
  const tree = TREES.find(t => t.nodes.includes(n))!;
  if (tree.after > cleared(s)) return false;
  if (n.req && !s.nodes.includes(n.req)) return false;
  return embers(s).free >= n.cost;
}

export function buyNode(s: Save, id: string): boolean {
  if (!canBuyNode(s, id)) return false;
  s.nodes.push(id);
  return true;
}

/** Refund every node. Free, so players can try other builds. */
export function resetTrees(s: Save) { s.nodes = []; }

/** Record a result; keeps the best stars. Returns Embers newly earned. */
export function recordResult(s: Save, stageId: number, stars: number): number {
  const before = embers(s).earned;
  s.stars[stageId] = Math.max(s.stars[stageId] ?? 0, stars);
  return embers(s).earned - before;
}

export const modsFor = (s: Save): Mods => buildMods(s.nodes, cleared(s));
