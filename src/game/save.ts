import { STAGES, type OathId } from './data/stages';
import { NODES, TREES } from './data/trees';
import { buildMods, type Mods } from './mods';

/** The storage key keeps its first name so old saves are found. The save's own `version` field says which rules wrote it. */
export const SAVE_KEY = 'towerriot.save.v1';
/** Version 2: the trees were rebalanced (new costs, new prerequisites, three nodes replaced). */
export const SAVE_VERSION = 2;

export interface Settings {
  sound: boolean;
  reduceMotion: boolean;
  /** Spend Wren's skill points for her. Null means the default: on in the first region, off after. */
  autoSkills: boolean | null;
  /** Show damage numbers over foes. */
  dmgNumbers: boolean;
  /** Motor accessibility option: allow tapping empty road/ground to move Wren on touchscreens. */
  tapGroundMove: boolean;
  /** Accessibility fallback: tap-to-aim W Lantern Snare instead of drag-to-aim. */
  tapAimW: boolean;
  /** Auto-call the next wave once the field is clear. */
  autoNext: boolean;
  /** Mirror battle HUD action dock to the left side for left-handed thumb ergonomics. */
  leftHandHud: boolean;
}

export interface Save {
  version: 2;
  /** Best stars per stage id (Standard). */
  stars: Record<number, number>;
  /** Best stars per stage id in Replay Variant B (`alt`). */
  altStars: Record<number, number>;
  /** Best stars earned with at least one Challenge Oath active. */
  oathStars: Record<number, number>;
  /** Unlocked boss/codex achievements & relics. */
  oathsCleared: Record<string, boolean>;
  /** Bought tree nodes. */
  nodes: string[];
  settings: Settings;
  seenIntro: boolean;
  /** True after an older save had its tree nodes refunded, until the player has seen the note on the trees screen. */
  treesRefunded?: boolean;
}

export const freshSave = (): Save => ({
  version: 2,
  stars: {},
  altStars: {},
  oathStars: {},
  oathsCleared: {},
  nodes: [],
  settings: {
    sound: true, reduceMotion: false, autoSkills: null, dmgNumbers: false,
    tapGroundMove: false, tapAimW: false, autoNext: false, leftHandHud: false,
  },
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
    const s = JSON.parse(raw) as Partial<Save> & { version?: number };
    const base = freshSave();
    const old = s.version !== SAVE_VERSION;
    const hadNodes = Array.isArray(s.nodes) && s.nodes.length > 0;
    const out: Save = {
      version: 2,
      stars: typeof s.stars === 'object' && s.stars ? s.stars : {},
      altStars: typeof s.altStars === 'object' && s.altStars ? s.altStars : {},
      oathStars: typeof s.oathStars === 'object' && s.oathStars ? s.oathStars : {},
      oathsCleared: typeof s.oathsCleared === 'object' && s.oathsCleared ? s.oathsCleared : {},
      // An older save bought its nodes at the old prices: refund them all rather than leave the player in debt.
      nodes: old || !Array.isArray(s.nodes) ? [] : s.nodes.filter(id => NODES.has(id)),
      settings: { ...base.settings, ...(s.settings ?? {}) },
      seenIntro: !!s.seenIntro,
      treesRefunded: old ? hadNodes : !!s.treesRefunded,
    };
    pruneNodes(out);
    return out;
  } catch {
    return freshSave();
  }
}

export const writeSave = (store: Store, s: Save) => store.set(SAVE_KEY, JSON.stringify(s));

/** Drop nodes a save cannot hold: a missing prerequisite, both of an either-or pair, or more than its Embers pay for. */
function pruneNodes(s: Save) {
  for (let changed = true; changed;) {
    changed = false;
    const keep: string[] = [];
    for (const id of s.nodes) {
      const n = NODES.get(id);
      const ok = !!n && !keep.includes(id) && (!n.req || s.nodes.includes(n.req)) && !(n.excl && keep.includes(n.excl));
      if (ok) keep.push(id); else changed = true;
    }
    s.nodes = keep;
    if (!changed && embers(s).free < 0) { s.nodes = s.nodes.slice(0, -1); changed = true; }
  }
}

/** Highest stage id cleared in a row from stage 1. */
export function cleared(s: Save): number {
  let n = 0;
  for (const st of STAGES) { if ((s.stars[st.id] ?? 0) > 0) n = st.id; else break; }
  return n;
}

export const isUnlocked = (s: Save, id: number) => id <= cleared(s) + 1;
export const totalStars = (s: Save) => Object.values(s.stars).reduce((a, b) => a + b, 0);
export const totalAltStars = (s: Save) => Object.values(s.altStars).reduce((a, b) => a + b, 0);

/** Embers: 1 per star + 2 per standard clear + 1 per Variant B first clear (or +1 for Oath clear), minus what trees cost. */
export function embers(s: Save): { earned: number; spent: number; free: number } {
  const std = totalStars(s) + 2 * Object.values(s.stars).filter(v => v > 0).length;
  const alt = Object.values(s.altStars).filter(v => v > 0).length;
  const oath = Object.values(s.oathStars).filter(v => v > 0).length;
  const earned = std + alt + oath;
  const spent = s.nodes.reduce((a, id) => a + (NODES.get(id)?.cost ?? 0), 0);
  return { earned, spent, free: earned - spent };
}

export function canBuyNode(s: Save, id: string): boolean {
  const n = NODES.get(id);
  if (!n || s.nodes.includes(id)) return false;
  const tree = TREES.find(t => t.nodes.includes(n))!;
  const cl = cleared(s);
  if (tree.after > cl || (n.after ?? 0) > cl) return false;
  if (n.req && !s.nodes.includes(n.req)) return false;
  if (n.excl && s.nodes.includes(n.excl)) return false;
  return embers(s).free >= n.cost;
}

export function buyNode(s: Save, id: string): boolean {
  if (!canBuyNode(s, id)) return false;
  s.nodes.push(id);
  return true;
}

/** Refund every node. Free, so players can try other builds. */
export function resetTrees(s: Save) { s.nodes = []; }

/** Record a result; keeps best stars across standard / Variant B / Oaths. Returns Embers newly earned. */
export function recordResult(
  s: Save,
  stageId: number,
  stars: number,
  opts: { variant?: 'standard' | 'alt'; oaths?: OathId[] } = {},
): number {
  const before = embers(s).earned;
  if (opts.variant === 'alt') {
    s.altStars[stageId] = Math.max(s.altStars[stageId] ?? 0, stars);
  } else {
    s.stars[stageId] = Math.max(s.stars[stageId] ?? 0, stars);
  }
  if (opts.oaths?.length) {
    s.oathStars[stageId] = Math.max(s.oathStars[stageId] ?? 0, stars);
    for (const o of opts.oaths) s.oathsCleared[`${stageId}:${o}`] = true;
  }
  return embers(s).earned - before;
}

export const modsFor = (s: Save): Mods => buildMods(s.nodes, cleared(s));
