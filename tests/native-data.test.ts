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
import { TOWERS, TOWER_ORDER, BEACON_BUFF, MAX_TOWER_LEVEL } from '../src/game/data/towers';
import { ENEMIES } from '../src/game/data/enemies';
import { HERO, SKILLS, SWEEP, SNARE, ATTUNE, SUNRISE } from '../src/game/data/hero';
import { COURIER_SURCHARGE, ITEMS, ITEM_ORDER, ITEM_SLOTS, SELL_ITEM, RUNES, RUNE_ORDER, RUNE_FIRST, RUNE_EVERY, RUNE_LIFETIME, RUNE_WARN_SEC } from '../src/game/data/shop';
import { TREES } from '../src/game/data/trees';
import { STAGES, REGIONS, type OathId, type StageVariant } from '../src/game/data/stages';
import { playStage, typicalMods } from './bot';

const KIT = 'ios/TowerRiotKit';
const DATA = `${KIT}/Sources/TowerRiotKit/Resources/game-data.json`;
const BOT = `${KIT}/Tests/TowerRiotKitTests/Resources/bot-results.json`;
const update = process.env.UPDATE_NATIVE_DATA === '1';

function gameData() {
  return {
    maxTowerLevel: MAX_TOWER_LEVEL,
    towers: TOWER_ORDER.map(k => TOWERS[k]),
    beaconBuff: BEACON_BUFF,
    enemies: Object.values(ENEMIES),
    hero: HERO,
    skills: (['q', 'w', 'e', 'r'] as const).map(k => {
      const s = SKILLS[k];
      return { key: s.key, name: s.name, desc: s.desc, maxRank: s.maxRank, cd: s.cd, needLevel: s.needLevel };
    }),
    sweep: SWEEP, snare: SNARE, attune: ATTUNE, sunrise: SUNRISE,
    items: ITEM_ORDER.map(id => ITEMS[id]),
    itemSlots: ITEM_SLOTS, sellItem: SELL_ITEM, courierSurcharge: COURIER_SURCHARGE,
    runes: RUNE_ORDER.map(k => ({ kind: k, ...RUNES[k] })),
    runeFirst: RUNE_FIRST, runeEvery: RUNE_EVERY, runeLifetime: RUNE_LIFETIME, runeWarnSec: RUNE_WARN_SEC,
    trees: TREES,
    regions: REGIONS,
    stages: STAGES,
  };
}

/** Oath runs recorded for the Swift engine: each oath on a spread of stages, and all three at once on a Variant B layout. */
const OATH_ROWS: { stage: number; variant?: StageVariant; oaths: OathId[] }[] = [
  ...[3, 9, 14, 19].flatMap(stage => (['twinRifts', 'shiftingEarth', 'longNight'] as OathId[]).map(o => ({ stage, oaths: [o] }))),
  { stage: 6, variant: 'alt', oaths: ['twinRifts', 'shiftingEarth', 'longNight'] },
  { stage: 16, variant: 'alt', oaths: ['twinRifts', 'shiftingEarth', 'longNight'] },
];

function botResults() {
  const row = (stage: number, variant?: StageVariant, oaths?: OathId[]) => {
    const r = playStage(stage, typicalMods(stage), 7, 1500, { variant, oaths });
    return {
      stage, ...(variant ? { variant } : {}), ...(oaths ? { oaths } : {}),
      won: r.won, lives: r.lives, waves: r.waves, level: r.level, gold: r.gold, towers: r.towers, kills: r.b.kills, clock: Math.round(r.b.clock * 1000) / 1000,
    };
  };
  return [
    // The first 20 rows keep their old shape: the standard layout, no oaths.
    ...STAGES.map(st => row(st.id)),
    // Then every Variant B layout, then the oath runs.
    ...STAGES.map(st => row(st.id, 'alt')),
    ...OATH_ROWS.map(o => row(o.stage, o.variant, o.oaths)),
  ];
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
