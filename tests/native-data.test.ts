/**
 * The native iOS game reads its towers, foes, stages and trees from a JSON file made from
 * the TypeScript data, so both games share one source of truth. This test fails when the JSON
 * is stale. Run `npm run native:data` to write it again.
 *
 * It also records what the balance bot does on every stage. The Swift engine runs the same bot
 * and must land on exactly the same numbers, which proves the two engines play the same game.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TOWERS, TOWER_ORDER, BEACON_BUFF } from '../src/game/data/towers';
import { ENEMIES } from '../src/game/data/enemies';
import { HERO, SKILLS, SWEEP, SNARE, ATTUNE, SUNRISE } from '../src/game/data/hero';
import { ITEMS, ITEM_ORDER, ITEM_SLOTS, SELL_ITEM, RUNES, RUNE_ORDER, RUNE_FIRST, RUNE_EVERY } from '../src/game/data/shop';
import { TREES } from '../src/game/data/trees';
import { STAGES, REGIONS } from '../src/game/data/stages';
import { playStage, typicalMods } from './bot';

const KIT = 'ios/TowerRiotKit';
const DATA = `${KIT}/Sources/TowerRiotKit/Resources/game-data.json`;
const BOT = `${KIT}/Tests/TowerRiotKitTests/Resources/bot-results.json`;
const update = process.env.UPDATE_NATIVE_DATA === '1';

function gameData() {
  return {
    towers: TOWER_ORDER.map(k => TOWERS[k]),
    beaconBuff: BEACON_BUFF,
    enemies: Object.values(ENEMIES),
    hero: { ...HERO, respawn: undefined, respawnBase: 4 },
    skills: (['q', 'w', 'e', 'r'] as const).map(k => {
      const s = SKILLS[k];
      return { key: s.key, name: s.name, desc: s.desc, maxRank: s.maxRank, cd: s.cd, needLevel: Array.from({ length: s.maxRank }, (_, i) => s.needLevel(i + 1)) };
    }),
    sweep: SWEEP, snare: SNARE, attune: ATTUNE, sunrise: SUNRISE,
    items: ITEM_ORDER.map(id => ITEMS[id]),
    itemSlots: ITEM_SLOTS, sellItem: SELL_ITEM,
    runes: RUNE_ORDER.map(k => ({ kind: k, ...RUNES[k] })),
    runeFirst: RUNE_FIRST, runeEvery: RUNE_EVERY,
    trees: TREES,
    regions: REGIONS,
    stages: STAGES,
  };
}

function botResults() {
  return STAGES.map(st => {
    const r = playStage(st.id, typicalMods(st.id));
    return { stage: st.id, won: r.won, lives: r.lives, waves: r.waves, level: r.level, gold: r.gold, towers: r.towers, kills: r.b.kills, clock: Math.round(r.b.clock * 1000) / 1000 };
  });
}

function check(path: string, json: string) {
  if (update) { writeFileSync(path, json); return; }
  expect(existsSync(path), `${path} is missing: run npm run native:data`).toBe(true);
  expect(readFileSync(path, 'utf8') === json, `${path} is stale: run npm run native:data`).toBe(true);
}

describe('native game data', () => {
  it('matches the TypeScript data', () => {
    check(DATA, JSON.stringify(gameData(), null, 1) + '\n');
  });

  it('records the balance bot results the Swift engine must match', () => {
    check(BOT, JSON.stringify(botResults(), null, 1) + '\n');
  }, 120000);
});
