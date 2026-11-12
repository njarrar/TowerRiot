import { describe, expect, it } from 'vitest';
import { SAVE_KEY, SAVE_VERSION, buyNode, embers, freshSave, loadSave, recordResult, writeSave, type Store } from '../src/game/save';
import { NODES, TREES } from '../src/game/data/trees';

const memory = (raw?: string): Store & { raw: string | null } => {
  const m = { raw: raw ?? null, get: () => m.raw, set: (_k: string, v: string) => { m.raw = v; } };
  return m;
};

/** A finished campaign with three stars everywhere. */
const perfectStars = () => Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, 3]));

describe('saves', () => {
  it('starts fresh when there is no save or the save is broken', () => {
    expect(loadSave(memory())).toEqual(freshSave());
    expect(loadSave(memory('{not json'))).toEqual(freshSave());
  });

  it('refunds every tree node from a save written before the trees were rebalanced', () => {
    // A version-1 save that owned every node of the first tree, bought at the old prices.
    const old = { version: 1, stars: perfectStars(), nodes: TREES[0].nodes.map(n => n.id), settings: { sound: false }, seenIntro: true };
    const s = loadSave(memory(JSON.stringify(old)));
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.nodes).toEqual([]);
    expect(s.treesRefunded).toBe(true);
    expect(s.stars[20]).toBe(3);
    expect(s.settings.sound).toBe(false);
    expect(s.seenIntro).toBe(true);
    const e = embers(s);
    expect(e.spent).toBe(0);
    expect(e.free).toBe(e.earned);
  });

  it('does not flag a refund for an old save that owned no nodes', () => {
    const s = loadSave(memory(JSON.stringify({ version: 1, stars: { 1: 3 }, nodes: [] })));
    expect(s.treesRefunded).toBe(false);
  });

  it('keeps bought nodes across a save and load on the current version', () => {
    const s = freshSave();
    s.stars = perfectStars();
    const first = TREES[0].nodes.find(n => !n.req && (n.after ?? 0) === 0)!;
    expect(buyNode(s, first.id)).toBe(true);
    const store = memory();
    writeSave(store, s);
    const back = loadSave(store);
    expect(back.nodes).toEqual([first.id]);
    expect(back.treesRefunded).toBe(false);
    expect(store.raw).toContain(`"version":${SAVE_VERSION}`);
    expect(SAVE_KEY).toBe('towerriot.save.v1');
  });

  it('never loads a save that owes Embers or holds a node without its prerequisite', () => {
    const needsReq = [...NODES.values()].find(n => n.req)!;
    const everything = [...NODES.keys()];
    // Current version, one star in total, yet it claims every node: it must be cut back to what it can pay for.
    const s = loadSave(memory(JSON.stringify({ version: SAVE_VERSION, stars: { 1: 1 }, nodes: everything })));
    expect(embers(s).free).toBeGreaterThanOrEqual(0);
    for (const id of s.nodes) {
      const n = NODES.get(id)!;
      if (n.req) expect(s.nodes).toContain(n.req);
      if (n.excl) expect(s.nodes).not.toContain(n.excl);
    }
    // A node whose prerequisite is missing is dropped even when the Embers are there.
    const rich = loadSave(memory(JSON.stringify({ version: SAVE_VERSION, stars: perfectStars(), nodes: [needsReq.id] })));
    expect(rich.nodes).toEqual([]);
  });

  it('pays one Ember for a first Variant B clear and one for a first Oath clear of a stage, once each', () => {
    const s = freshSave();
    expect(recordResult(s, 1, 3)).toBe(5); // 3 stars + 2 for the clear
    expect(recordResult(s, 1, 3)).toBe(0);
    expect(recordResult(s, 1, 2, { variant: 'alt' })).toBe(1);
    expect(recordResult(s, 1, 3, { variant: 'alt' })).toBe(0);
    expect(recordResult(s, 1, 1, { oaths: ['longNight'] })).toBe(1);
    expect(recordResult(s, 1, 3, { oaths: ['twinRifts', 'shiftingEarth'] })).toBe(0);
    expect(s.oathsCleared['1:twinRifts']).toBe(true);
  });
});
