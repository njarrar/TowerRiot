# TowerRiot

**Hold the Lantern Keep.** Build towers on stone plots, raise your hero Wren from level 1 to 16 in every fight, steal last hits for gold, grab runes, and outthink a Hollow that learns which towers you lean on.

TowerRiot is a classic tower defence game with a hero you control. It runs in any browser, on phones and tablets, and as a native app on iOS and Android. Once loaded, it never needs the internet again.

**Play it now: [njarrar.github.io/TowerRiot](https://njarrar.github.io/TowerRiot/)**

![The title screen](docs/images/title.jpg)

---

## Why it is fun

- **Your hero grows in every match.** Wren starts each stage at level 1. Kill foes to level her up, then spend points on four skills: Q, W, E and R. By the boss wave she is a different fighter.
- **Last hits pay.** When Wren lands the killing blow, you earn 50% more gold. Towers soften the crowd, Wren takes the prize.
- **Shop at the gate, or pay the courier.** Boots, blades, plate and a spear of dawn. At the gate you pay the plain price; out in a fight a courier brings it for 20% more. Four slots, so choose.
- **Runes on the map.** Every minute a rune glows at a set spot on the field: haste, double damage, regeneration or bounty. It fades after 22 seconds. Is it worth leaving your post?
- **Foes think.** At every fork, each foe weighs how much fire waits down each road and picks the safer one. Stack every tower on one lane and the swarm walks the other.
- **The Hollow adapts.** In later stages, the enemy grows resistant to the element you use most. Mix fire, frost, storm, nature and steel or pay for it.
- **Every map changes as you play.** Tides close fords, lava floods passes, sappers chew through wrecks, belts speed foes up, plots sink, night falls. Ponds drain, new rifts tear open mid-battle with one wave's warning, tunnels carry foes ahead, and every boss breaks the map as its health falls.
- **You change the map too.** Pull a boom gate to hold a road shut, throw a fork lever to send the horde the other way, brake a conveyor, or clear the rubble off a plot.
- **Every stage plays twice.** Clear a stage and its Variant B opens: the same ground with roads turned round, breaches that open early, night, or ruins on the best plots. Three Oaths make any stage harder for one more Ember.

![Battle at Low Tide](docs/images/battle-low-tide.jpg)

---

## Wren, the hero

Drag Wren to a spot and she holds it: she fights any foe within 90 px of her post and blocks up to two on the road. With a mouse, click the ground instead. Tap a foe to send her after it. If she falls, she returns to the gate after a few seconds. Foes that die far from her give only 15% of their XP, so where she stands matters.

| Key | Skill | What it does |
|---|---|---|
| **Q** | Spear Sweep | Spins her spear and hits every foe around her. |
| **W** | Lantern Snare | Throws a lantern up to 200 px. Foes where it lands are held in place and burn for 2 seconds. Opens after stage 1. |
| **E** | Attune | Passive. Towers near Wren attack faster. |
| **R** | Sunrise | Every tower fires twice as fast, and every hidden foe shows. Opens at level 6, after stage 7. |

The gate works as her well: stand there to heal. She can shop from anywhere while she stands. At the gate, before the first wave, and between waves on a clear field she pays the plain price. Anywhere else a courier adds 20%. Items sell back for half. Time slows while you aim Lantern Snare.

| Item | Cost | Sold from | Effect |
|---|---|---|---|
| Clockwork boots | 60 | the start | +40% move speed |
| Ring of moss | 80 | the start | +7 health a second |
| Ember blade | 110 | the start | +12 spear damage |
| Brass lantern | 110 | after stage 6 | Lights hidden foes from further away |
| Warden's plate | 150 | the start | +260 health, 20% less damage taken |
| Cleaving spear | 240 | after stage 4 | Strikes also hit foes beside the target |
| Ember spear | 300 | after stage 11 | +22 damage; strikes burn and make foes take 25% more damage |
| Dawn mantle | 330 | after stage 13 | +220 health, less damage taken, and nearby towers hit 12% harder |
| Spear of dawn | 340 | after stage 9 | +30 damage and 25% faster strikes |
| Second dawn | 390 | after stage 15 | The first time Wren falls, she stands right back up |

![Ember Pass, deep in the Ashen Rift](docs/images/battle-ember-pass.jpg)

---

## Six towers, twelve paths

Each tower has three levels. At the top, split it into one of two forms (splits open after stage 8). A split tower can then take one last upgrade, its mastery, to level 5: 24% more damage and a perk of its own, with 8% more range for bells and beacons (a Beacon's mastery strengthens its aura instead of dealing damage). Level 5 is the cap.

| Tower | Role | Split A, then its mastery | Split B, then its mastery |
|---|---|---|---|
| **Watch tower** | Fast, long range bolts | Longbow spire: more range, crits. Then Keenwind spire | Repeater: twice the fire rate. Then Twin drum repeater |
| **Forge cannon** | Shells that burst on the road | Siege mortar: range and damage. Then Grand siege mortar | Scatter gun: three shells a shot. Then Tri-barrel salvo |
| **Frost bell** | A pulse that slows everything near it | Glacier: freezes foes solid. Then Permafrost bell | Chime: slowed foes take more damage. Then Harmonic resonance |
| **Storm pylon** | Lightning that jumps between foes | Tesla crown: three more jumps. Then Arc-overlord crown | Rail: one huge bolt. Then Breach lance |
| **Root garden** | Thorns that hold a foe in place | Bramble: holds a whole group. Then Heartwood bramble | Spore pod: a poison cloud. Then Blooming canopy |
| **Beacon** | No attack. Boosts nearby towers and reveals Shades | War drum: faster towers nearby. Then Sovereign drum | Watchfire: longer range nearby. Then Blazing lens |

Set each tower to aim at the foe furthest along, the strongest, the most armored or the closest. Load the Armory's ember, frost or storm rounds for extra effects. Selling a tower returns 70% of what you spent on it.

---

## Know your foes

| Foe | Watch out |
|---|---|
| Grub | Slow and soft. Comes in crowds. |
| Skitter | Very fast and frail. Fire struggles to catch it. |
| Shellback | Bolts do half damage, fire cracks it. |
| Moth | Flies. Cannons and roots cannot reach it. |
| Warden | Shields foes near it. Lightning hurts it most. |
| Mender | Heals foes around it. Kill it first. |
| Shade | Unseen until a Beacon or Wren lights it. |
| Splitter | Bursts into three Skitters when it dies. |
| Sapper | Chews through wrecks and walls to open new roads. |
| Burrower | Digs under the road where nothing can reach it. |
| Ash moth | Flies and cannot burn. Frost brings it down. |
| Iron Shellback | Armored. Small hits barely scratch it. |

And four bosses, one at the end of each region: **The Mire King**, **The Tidewyrm**, **The Brass Colossus** and **The Hollow Queen**. Each one changes the map as its health falls. At half health the Mire King smashes an inner causeway to the Keep, the Tidewyrm drowns the north pass, and the Colossus breaks straight through the anvil. The Queen does it twice, at two thirds and at one third.

![Lighthouse Rock](docs/images/battle-lighthouse.jpg)

---

## The campaign: 20 stages, 4 regions

![The campaign map](docs/images/campaign.jpg)

| Region | Its rules | Stages |
|---|---|---|
| **Mosslight Vale** | Forks, night and the swamp | 1 Lantern Road, 2 Fork in the Moss, 3 Switchback Hill, 4 Firefly Night, 5 The Mire King |
| **Saltglass Coast** | Tides, wrecks and storms | 6 Low Tide, 7 Shipwreck Cove, 8 Lighthouse Rock, 9 Storm Shelf, 10 The Tidewyrm |
| **Cogwheel Foundry** | Belts, gears and steam | 11 Conveyor Hall, 12 Gear Garden, 13 Steam Vents, 14 Assembly Line, 15 The Brass Colossus |
| **Ashen Rift** | Lava, high ground and the Queen | 16 Ember Pass, 17 Avalanche Ridge, 18 Mirror Lake, 19 The Hollow Gate, 20 The Hollow Queen |

Every stage brings a new foe or a new twist. Earn up to three stars on each by keeping the Keep's lives: 3 for 90% or more, 2 for half or more, 1 for a win. Beat a boss to win a relic that stays with you: the Mire Crown and the Ash Sigil each add 10% tower damage, the Tide Pearl adds 15% range to towers near water, and the Brass Heart gives Wren one more skill point.

### Levers, tunnels and rubble

- **Boom gates** (stages 6, 7, 9, 14, 16, 17 and 19). Tap the lever and foes on that road wait at the boom for 10 or 11 seconds. Then the gate rests for 18 to 20 seconds before it can be pulled again.
- **Fork levers** (stages 12, 13, 14 and 18). New foes take the other branch. A lever needs 16 seconds between pulls.
- **The conveyor brake** (stage 11). The belt road runs at 55% speed for 11 seconds, then the brake rests for 18.
- Stand Wren by a lever and it is ready again twice as fast.
- **Tunnels, chutes and rifts** (nine stages). From a set wave on, every third or fourth ground foe that reaches the mouth comes out further down the road. Bosses never take them.
- **Rubble** lies on some plots. Pay to clear it (30 to 90 gold), or stand Wren beside it for 3 to 5 seconds once the fight is on and she clears it for free.

### Variant B and Oaths

Clear a stage once and two things open on its card.

- **Variant B** is a second layout of the same stage, with its own name and its own stars. All 20 stages have one. The first clear of each pays 1 Ember.
- **Oaths** are three challenges you can switch on for any cleared stage, in either layout. Clear a stage with any Oath active for +1 Ember, once per stage.

| Oath | What it does |
|---|---|
| **Twin Rifts** | Every road is live from wave 1, and every foe is 15% tougher. |
| **Shifting Earth** | Two plots sink mid-battle and their towers refund only half. Tides, lava and steam hold roads shut for 40% less time. |
| **Long Night** | Night never lifts. Hidden foes only show in light. |

---

## Skill trees

![The skill trees](docs/images/trees.jpg)

Stars earn Embers. Spend them across four trees between stages. Refunds are free, so try other builds.

- **Towerworks** (from the start): sharper bolts, wider blasts, deeper chill, cheaper towers.
- **Armory** (after stage 4): ember, frost and storm rounds, Shatter and Overload combos, and Borrowed edge, which lends Wren the rounds of the nearest loaded tower.
- **Wren** (after stage 1): stronger sweeps, richer last hits, a longer snare, start at level 3.
- **Bulwark** (after stage 7): more lives, a war chest, better resale, richer early calls, and an iron gate that forgives the first leak of each wave.

After stage 14 each tree opens two capstones. You may take only one of each pair.

Each star is 1 Ember and the first clear of a stage is 2 more, so a perfect campaign earns 100. The first clear of each Variant B adds 1, and the first Oath clear of each stage adds 1: 140 in all. Every node plus one capstone per tree costs 136, so the last of them come from Variant B and the Oaths.

A save from before the trees were rebalanced gets every node refunded once, and the trees screen says so.

---

## Play anywhere, fully offline

![Steam Vents on a phone](docs/images/phone-steam-vents.jpg)

- **Web and mobile web.** A service worker caches the whole game on first load, so it keeps working with no signal. Add it to your home screen and it opens full screen, like an app.
- **iOS and Android.** iOS is a native Swift app with every picture and sound inside it. Android wraps the web game with Capacitor, every file bundled inside. No server, no account, no ads, no network calls.
- **Phones, tablets and desktops.** Play sideways or upright. The controls sit beside the map on wide screens and below it on short ones. Held upright, a phone shows the map at full height under a strip of stats, with Wren and the skills below; drag the map left and right to see the rest, and red notches at the edges point to foes out of view. Everything keeps clear of notches and rounded corners.
- **Saves stay on your device.**

### Controls

| Action | Touch | Keyboard and mouse |
|---|---|---|
| Build | Tap a stone plot, tap a tower, tap it again | Click a plot, or 1 to 6 |
| Clear rubble | Tap the plot | Click the plot |
| Upgrade, split, master, aim, sell | Tap a tower | Click a tower |
| Move Wren | Drag her | Click the ground, or right click |
| Pull a lever | Tap it | Click it |
| Skills | Q W E R buttons. Drag to aim W | Q W E R |
| Next wave early (pays bonus gold) | Wave button | Space |
| Speed and pause | Buttons | F and P |
| Shop | Shop button | B |

Settings hold sound, calm motion, auto skill points and damage numbers, plus four ways to fit the game to your hands: tap the ground to move Wren, tap to aim Lantern Snare, call the next wave by itself once the field is clear, and a left-handed HUD.

---

## Run it

You need Node.js 20 or newer.

```bash
npm install
npm run dev        # play at http://localhost:5173
npm test           # stage, rule and save tests, plus a bot that plays every stage and every Variant B
npm run typecheck  # TypeScript only
npm run build      # typecheck, build to dist/, write the offline cache
npm run preview    # serve the built game
```

### Web release

Every push to `main` runs the tests, builds the game and publishes it to [GitHub Pages](https://njarrar.github.io/TowerRiot/) (`.github/workflows/pages.yml`).

### iOS app (native)

The iOS game is a native Swift app in `ios/`, with no web view. It plays the same 20 stages by the same rules, with art painted by the same painters, fully offline.

- `ios/TowerRiotKit` is a Swift package with the battle engine, the game data and saves. It builds and tests on any machine with Swift: `cd ios/TowerRiotKit && swift test`. The web tests record 54 runs of the same bot (every stage, every Variant B and 14 Oath runs), and a Swift test must land on the very same numbers.
- `ios/TowerRiot` is the app: SpriteKit draws the battle, SwiftUI draws the menus, and a small synth makes the sounds. Open `ios/TowerRiot/TowerRiot.xcodeproj` in Xcode 16 or newer and run.
- The web game stays the one source for numbers and art. After changing them, run:

```bash
npm run native:data   # write the towers, foes, stages and trees for Swift
npm run native:art    # paint the sprites, maps and menu pictures for the iOS app
```

Run both before you build for a device. The art step paints with the same painters the web game uses (`src/art/lfx.js`), in a headless browser, so both games look alike once it has run. Every push that touches `ios/` builds the app and runs the Swift tests on a Mac (`.github/workflows/ios.yml`).

#### Play it on your iPhone

You need a Mac with Xcode 16 or newer and a free Apple ID. The art in the repo is a bake of the web painters. If towers or maps have changed since that bake (tower level 5 is new), run `npm run native:art` first.

1. Clone the repo and open `ios/TowerRiot/TowerRiot.xcodeproj` in Xcode.
2. In Xcode, open Settings, then Accounts, and add your Apple ID.
3. Click the TowerRiot project, then the TowerRiot target, then Signing & Capabilities. Pick your name under Team. If Xcode says the bundle id is taken, change `com.njarrar.towerriot` to anything of your own.
4. Plug the iPhone in with a cable, unlock it and tap Trust. On the phone, turn on Settings, Privacy & Security, Developer Mode, and let it restart.
5. Pick the iPhone in the device menu at the top of Xcode and press Run (Cmd R).
6. The first time, the phone blocks the app. Open Settings, General, VPN & Device Management, tap your Apple ID and tap Trust. Then open TowerRiot.

With a free Apple ID the app stops opening after 7 days. Press Run again to renew it.

### Android app

```bash
npm run cap:android   # build, sync and open Android Studio
```

The app turns with the phone: sideways or upright. Run `npm run icons` to repaint the app icon (Wren and the Keep) for the web, iOS and Android.

---

## How it is built

- **TypeScript and Vite**, no game engine. The map and every unit draw to a single canvas.
- **A headless battle engine** (`src/game/sim.ts`) with a seeded random source and fixed time steps, so the same moves always give the same result. The screen only reads its events.
- **Balance tested by a bot.** `tests/balance.test.ts` plays every stage on six seeds and every Variant B on three with a simple strategy. It fails if any can't be won, if stages 1 to 6 drop below three stars, or if the campaign stops getting harder.
- **Map checks.** `tests/stages.test.ts` makes sure no plot sits on a road or in water, no tide closes every road at once, and every Variant B and Oath really changes its stage.
- **Rule checks.** `tests/invariants.test.ts`, `tests/mechanics.test.ts` and `tests/save.test.ts` pin the rules: the level 5 cap, Wren's leash, the courier fee, boom gates, boss phases, rubble, how a battle ends, the Oaths, and old saves.
- **Painted art in code.** The ground of each stage is painted once when it loads, then towers, foes, light and weather draw on top every frame.
- **Sound made on the fly** with the Web Audio API. No sound files to download.

```
src/
  game/        battle engine, damage and tower maths, saves
    data/      towers, foes, waves, the 20 stages, hero, shop, trees
  render/      the canvas scene and effects
  art/         the painting library
  ui/          title, campaign, trees, settings and the battle screen
  audio/       sound
tests/         stage, rule and save checks, and the balance bot
scripts/       offline cache, app icons, iOS art bake
tools/bake/    the page that paints the iOS art
ios/           the native iOS app (Swift) and its engine package
android/       Android app shell
```

---

## What changed lately

The November 2026 overhaul:

- **Towers stop at level 5:** one mastery for each split replaces Temper I and II.
- **Maps move:** ponds drain, rifts open mid-battle with a wave's warning, and tunnels carry foes ahead.
- **Every boss breaks the map:** at half health the Mire King and the Colossus open new roads, the Tidewyrm seals the north pass, and the Hollow Queen floods the cloister.
- **Levers that work:** boom gates hold walkers at the bar on all seven gate stages. Fork levers send foes down roads that open mid-battle. A lever's cooldown starts when its effect ends, so Wren can't keep one on for good.
- **Rubble on plots:** pay to clear it, or let Wren clear it for free once the fight is on.
- **Variant B** for all 20 stages. Each one reverses whole or not at all, and its text says what it does.
- **Three Oaths**, each on all 20 stages. Twin Rifts: every road is live from wave 1 and foes are 15% tougher. Shifting Earth: two plots sink mid-battle at half refund, and tides, lava and steam hold roads 40% shorter. Long Night: night never lifts. A first clear with any Oath pays 1 Ember, once per stage.
- **Wren holds a post:** drag her there and she fights within a 90 px leash. Kills far from her give 15% XP.
- **Shop anywhere:** a courier adds 20% away from the gate in a fight.
- **Runes fade** after 22 seconds, with a warning first.
- **Trees open sooner** (after stages 1, 4 and 7) and capstones after stage 14, at new prices. Interest on banked gold is gone. Old saves get their nodes refunded once, with a note on the trees screen.
- **A fourth relic:** the Ash Sigil, from the Hollow Queen, now granted.
- **Difficulty:** stages 1 to 6 are easy, then it rises. Losing your last life is always a loss, even if the last foe falls on the same tick.
- **Settings:** tap to move, tap to aim, auto-call once the field is clear, a left-handed HUD.
- **Easier to tap:** buttons, chips, tabs and levers take taps across 44 px. Dialogs keep keyboard focus inside. The lighthouse beam stops when motion is reduced. Pen input works.
- **iOS fixes:** no stuck slow motion after a cancelled aim, taps near Wren reach the towers and plots around her, the left-handed HUD works in every layout, and a win counts even if you leave during the result screen.

## Design notes

The full design, from the three planning angles of level design, play and art, lives in [docs/DESIGN.md](docs/DESIGN.md).

How the web and iOS engines stay in step, and the rules the tests hold, are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
