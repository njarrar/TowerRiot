# TowerRiot game design

TowerRiot is a classic tower defence game with an early Dota touch. You hold the Lantern Keep with towers you build, and one hero, Wren, grows from level 1 to 16 inside every stage.

## A match

- Every stage is a map with one or more roads that run from Hollow rifts to the Keep gate.
- Foes come in **waves**. You call the first wave; after that the next one starts on a timer, or early if you call it for bonus gold.
- Smart routing: on a fork, foes take the side with fewer towers.
- You **win** when the last wave is beaten. You **lose** when the Keep's lives run out.

## Wren, the hero (the Dota part)

- Tap the ground to move her. She fights foes near her and blocks up to two of them on the road.
- She levels from 1 to 16 **inside each match**. XP comes from any foe that dies near her.
- Each level gives one skill point:
  - **Q Spear Sweep**: hits every foe around her.
  - **W Lantern Snare**: throws a lantern that roots foes where it lands.
  - **E Attune** (passive): towers near her attack faster.
  - **R Sunrise** (ultimate, levels 6, 11 and 16): every tower fires twice as fast and hidden foes show.
- **Last hits**: when Wren lands the killing blow she earns 50% more gold.
- When she falls she comes back after a timer that grows with her level.

## Gold, towers and the shop

- One purse pays for towers, upgrades and Wren's items. That trade is the core choice of every match.
- Towers are built on stone plots. Each has three levels, then splits into one of two forms at level 4.
- The **shop** sits at the Keep gate. Wren must stand near the gate to buy. She carries up to four items.

## Runes

- A **rune** appears at a fixed spot on the map every 60 seconds: Haste, Double Damage, Regeneration or Bounty. Send Wren to grab it.

## The Hollow

- The Hollow **adapts**: every three waves it hardens against the element you used most (up to 60%). Mixing towers matters.
- Each region adds a map rule: tides, wrecks, belts, vents, lava.
- The fifth stage of each region is a boss.

## Between stages

- Stars (one to three per stage) become Embers, spent in four trees: Towerworks, Armory (tower rounds), Wren and Bulwark (the Keep).

## Twenty stages

Each region adds a map rule. The fifth stage of each region is a boss. See `src/game/data/stages.ts` for the maps.

## Look and feel

The game is set in the morning. Keep every new screen to these rules.

- **Surfaces:** pale limestone paper with dark iron text. Panels over the map use the same paper, slightly see-through.
- **One accent:** rust red, only for the thing you act on (Play, Start, buy, the next stage, a skill point to spend).
- **Gold is for stars and coin only.** Not for titles, borders or selection.
- **Type:** Cinzel for the logo, screen titles, stage names and battle banners. Barlow for everything else, card titles and the hero name included. No italic headings.
- **Map light:** a light edge shade by day and a morning grade baked into the ground once. Night and lava stages keep their dark on purpose.
- **Motion:** short and once. Nothing bobs or pulses forever. Calm motion and the system reduce-motion setting turn effects off.
- **Phones:** no button or label wraps onto two lines. Shrink an icon before you wrap text.
- **No browser dialogs.** Ask in a card inside the game.

All colours live as tokens at the top of `src/styles.css`.
