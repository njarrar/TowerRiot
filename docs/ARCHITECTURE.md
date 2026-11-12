# TowerRiot: architecture and development rules

## Two-Engine Parity Pipeline
TowerRiot runs identically in TypeScript/Web (`src/`) and native Swift/iOS (`ios/TowerRiotKit` + `ios/TowerRiot`):
1. **Single Data Truth (`src/game/data/*.ts` -> `game-data.json`)**:
   - Plain data constants (`hero.ts`, `towers.ts`, `enemies.ts`, `waves.ts`, `shop.ts`, `trees.ts`, `stages.ts`) serialize to `ios/TowerRiotKit/Sources/TowerRiotKit/Resources/game-data.json`.
   - `npm run native:data` regenerates `game-data.json` and `bot-results.json`.
   - `bot-results.json` holds 54 bot runs: 20 standard stages, 20 Variant B layouts and 14 Oath runs (`tests/native-data.test.ts`).
   - `BotParityTests` in `ios/TowerRiotKit` asserts Swift simulation results match `bot-results.json` to exact integer precision.
2. **Procedural Art Parity (`src/art/lfx.js` + `src/render/scene.ts` -> `ios/TowerRiot/TowerRiot/Art`)**:
   - `npm run native:art` renders all tower levels (`1..5`), Level 4 and 5 split paths (`a`/`b`), foes, bosses, and icons via Playwright into SpriteKit atlases.
   - Run it after any change to tower art or levels, and before a device build. A code change alone does not re-bake the art.
3. **Headless Architecture**:
   - `src/game/` has zero DOM/Canvas imports.
   - `src/render/` reads battle state; never mutates simulation state.
   - Shared pure helpers: `tower-stats.ts`, `combat.ts`, `clock.ts`, `input-resolver.ts`, `validate-data.ts`.

## Design & Gameplay Invariants
- **Visual System ("Morning Keep")**: Limestone paper, iron ink, one rust accent (`--accent`). Gold (`--gold` / `--gold-deep`) is strictly reserved for stars and coins.
- **Touch Floor**: `.btn`, `.seg button`, `.sell-link`, the hero face and the skill "+" take taps across >= `44px` through an invisible `::after` pad in `src/styles.css`, so their drawn size and the layout do not change. Map levers are hit-tested at >= 44 css px at any map scale (`Scene.hitSwitch`). Stone plots are not padded yet.
- **Accessibility**: `reduceMotion` turns off shake, screen flash, rain, fog, light shafts, the lighthouse sweep and the rune blink in `src/render/scene.ts`, and all CSS animation and transition. Modal cards (result, leave, field guide) take focus and keep Tab inside (`trapFocus` in `src/ui/dom.ts`).
- **Rules that tests pin** (change the constant and the test together):
  - Towers cap at level 5, one mastery per split (`MAX_TOWER_LEVEL`, `src/game/data/towers.ts`).
  - Wren fights within a 90 px leash of her post; far kills give 15% XP (`HERO.leash`, `HERO.xpFar`, `src/game/data/hero.ts`).
  - Courier fee of 20% away from the gate in a fight (`COURIER_SURCHARGE`); runes at 30 s, every 60 s, lasting 22 s (`RUNE_FIRST`, `RUNE_EVERY`, `RUNE_LIFETIME`, `src/game/data/shop.ts`).
  - Next wave 22 s after a wave finishes spawning, 12 s at most on a clear field (`WAVE_GAP`, `src/game/sim.ts`).
  - Every boss has a health phase that opens or seals a road (`phases` in `src/game/data/enemies.ts`, `atPhase` in `src/game/data/stages.ts`).
  - Oath numbers: `TWIN_RIFTS_HP`, `SHIFTING_EARTH_DUR`, `SHIFTING_EARTH_REFUND` in `src/game/data/stages.ts`. The Oath texts in `src/ui/app.ts` must say the same.
  - Saves are version 2; an older save has its tree nodes refunded once (`SAVE_VERSION`, `src/game/save.ts`).
- **Verification Gates**:
  - `npm run typecheck` (`tsc --noEmit`)
  - `npm test` (runs `stages.test.ts`, `invariants.test.ts`, `mechanics.test.ts`, `save.test.ts`, `balance.test.ts`, `native-data.test.ts`; balance plays every standard stage on six seeds and every Variant B on three)
  - `npm run lint:arch` (runs `invariants.test.ts` and `stages.test.ts`: data schema, stage and Variant B geometry, the Pet Test)
  - `swift test --package-path ios/TowerRiotKit` (native Swift engine + parity)
