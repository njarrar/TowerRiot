# TowerRiot game design

TowerRiot is a classic tower defence game with an early Dota touch. You hold the Lantern Keep with towers you build, and one hero, Wren, grows from level 1 to 16 inside every stage.

## A match

- Every stage is a map with one or more roads that run from Hollow rifts to the Keep gate.
- Foes come in **waves**. You call the first wave. After that the next one starts 22 seconds after the last foe of a wave has left its rift, or 12 seconds at most once the field is clear. Call it early for bonus gold: 2 gold for each second you skip.
- A card by the call button shows what the next wave sends (counts, fliers) and warns when the Hollow will adapt.
- Smart routing: on a fork, foes take the side with fewer towers.
- Maps change during a match. Roads open on a set wave (marked one wave ahead) or when a boss hits a health mark; water drains; plots open, or sink and refund their tower in full.
- You **win** when the last wave is beaten. You **lose** when the Keep's lives run out.
- **Stars** come from lives kept: 3 for 90% or more, 2 for half or more, 1 for a win. The lives pill shows the stars you hold, the stage card states the rule, and the win card says what 3 stars needed.
- Stage 1 marks one plot and asks for a tower before it explains Wren.
- A defeat card names the foe that took the most lives, with its counter.
- Difficulty: foe health climbs 6% a stage, and 10% more a stage in the Ashen Rift (16 to 20). Each stage tunes that with its own `hpMul`, and each Variant B with `alt.hpMul`. A plain greedy test player, played on six seeds, should keep three stars on stages 1 to 6, lose more lives band by band after that (7 to 13, then 14 to 20), and still take about 2 stars on stages 16 to 20.

## Wren, the hero (the Dota part)

- She starts each stage out on the main road, not at the gate. Drag her to a post (a mouse clicks the ground; a setting lets a touch tap do the same). She holds that post, fights foes within a 90 px leash of it, and blocks up to two of them on the road. Tap a foe to send her after it.
- She levels from 1 to 16 **inside each match**. Foes that die near her give full XP; foes that die anywhere else give 15%.
- Auto skill points are on by default in Mosslight Vale and off after it, unless the player sets them in Settings.
- Each level gives one skill point:
  - **Q Spear Sweep**: hits every foe around her.
  - **W Lantern Snare**: throws a lantern, up to 200 px, that roots foes where it lands and burns them for 2 seconds. Opens after stage 1.
  - **E Attune** (passive): towers near her attack faster.
  - **R Sunrise** (ultimate, levels 6, 11 and 16): every tower fires twice as fast and hidden foes show. Opens after stage 7.
- **Last hits**: when Wren lands the killing blow she earns 50% more gold.
- When she falls she comes back at the gate after 4 seconds plus one for each level.

## Gold, towers and the shop

- One purse pays for towers, upgrades and Wren's items. That trade is the core choice of every match.
- Towers are built on stone plots. Each has three levels, then splits into one of two forms at level 4 (splits open after stage 8). Level 5 is that split's **mastery**, and the cap: 24% more damage and one perk of its own, with 8% more range for bells and beacons.
- Selling a tower returns 70% of the gold spent on it.
- The **shop** sits at the Keep gate, and Wren can buy from anywhere while she stands. At the gate, before the first wave, and between waves on a clear field she pays the plain price. Anywhere else a courier adds 20%. She carries up to four items and sells them back for half.
- Some plots start under **rubble**. Pay to clear one, or stand Wren beside it for a few seconds. Her free clearing only works once the first wave has been called.

## Runes

- A **rune** appears at a fixed spot on the map every 60 seconds, the first one 30 seconds in: Haste, Double Damage, Regeneration or Bounty. Send Wren to grab it. It fades after 22 seconds, and blinks with a countdown for the last 5.

## The Hollow

- The Hollow **adapts**, from the second region on: every three waves it hardens against the element you used most, by 20% a time up to 60%, and only when that element did more than 42% of the damage. Mixing towers matters.
- Each region adds a map rule: tides, wrecks, belts, vents, lava.
- The fifth stage of each region is a boss. Every boss has a health mark that changes the map. At half health the Mire King opens an inner causeway, the Tidewyrm seals the north pass, and the Colossus opens a road through the middle. The Queen has two marks, at two thirds and one third: the first opens a causeway, the second seals a road.

## Levers and tunnels

- **Boom gates** hold foes on one road at the boom for 10 or 11 seconds, then rest for 18 to 20 seconds. The rest only starts once the gate has opened again, so a gate cannot be kept shut.
- **Fork levers** send new foes down the other branch. 16 seconds between pulls.
- **The conveyor brake** runs its belt road at 55% speed for 11 seconds, then rests for 18.
- A lever with Wren standing by it is ready again twice as fast.
- **Tunnels, chutes and rifts** open on a set wave. From then on every third or fourth ground foe that reaches the mouth comes out further along. Bosses never take them.

## Between stages

- Stars (one to three per stage) become Embers, spent in four trees: Towerworks (open from the start), Armory (tower rounds, after stage 4), Wren (after stage 1) and Bulwark (the Keep, after stage 7). Each tree ends in two capstones, open after stage 14; take one of each pair. Refunds are free.
- Embers: 1 for each star and 2 more for the first clear of a stage, 100 in a perfect campaign. The first clear of each Variant B adds 1 and the first Oath clear of each stage adds 1, 140 in all. Every node plus one capstone per tree costs 136.
- Each boss leaves a relic: Mire Crown (+10% tower damage), Tide Pearl (+15% range for towers near water), Brass Heart (+1 skill point for Wren), Ash Sigil (+10% tower damage).
- Saves carry a version, now 2. A save older than that was made before the trees were rebalanced: every node it holds is refunded once on load, and the trees screen shows a note until the player dismisses it or leaves.

## Twenty stages

Each region adds a map rule. The fifth stage of each region is a boss. See `src/game/data/stages.ts` for the maps.

Every stage has a **Variant B**, a second layout that opens once the stage is cleared: roads turned round, breaches that open early, night, ruined plots, or a faster tide. It keeps its own stars.

Three **Oaths** can be switched on for any cleared stage, in either layout:

- **Twin Rifts**: Every road is live from wave 1, and every foe is 15% tougher.
- **Shifting Earth**: Two plots sink mid-battle and their towers refund only half. Tides, lava and steam hold roads shut for 40% less time.
- **Long Night**: Night never lifts. Hidden foes only show in light.

## Settings

- Sound, calm motion, auto skill points, damage numbers.
- Tap the ground to move Wren on a touchscreen (off by default; dragging her always works).
- Tap to aim Lantern Snare: tap W, then tap the spot.
- Auto-call the next wave once the field is clear.
- Left-handed HUD.

## Look and feel

The game is set in the morning. Keep every new screen to these rules.

- **Surfaces:** pale limestone paper with dark iron text. Panels over the map use the same paper, slightly see-through.
- **One accent:** rust red, only for the thing you act on (Play, Start, buy, the next stage, a skill point to spend).
- **Gold is for stars and coin only.** Not for titles, borders or selection.
- **Type:** Cinzel for the logo, screen titles, stage names and battle banners. Barlow for everything else, card titles and the hero name included. No italic headings.
- **Map light:** each region paints its ground in day colours (Vale grass, Coast sand, Foundry slate) with low sun from the upper right. The road is always lighter or darker than the ground around it. Night and the Ashen Rift keep their dark on purpose.
- **Plots** are pale paved pads set into the ground. A small rust "+" shows on every plot you can afford right now.
- **Foes** stay dark with a green glow in their seams, the one strong colour the Hollow owns. Rifts are torn cracks in the ground, fully on the map.
- **Banners** are small paper cards at the top of the map, ink on paper. They queue; they never cover each other.
- **Numbers on the map:** gold from kills close together adds up into one number. Level-ups show on the hero card. Damage numbers are off unless the player turns them on.
- **Motion:** short and once. Nothing bobs or pulses forever. Calm motion and the system reduce-motion setting turn effects off.
- **Phones:** no button or label wraps onto two lines. Shrink an icon before you wrap text. Buttons and map levers take a tap across at least 44 px, even when they are drawn smaller.
- **Skills** show a picture and a name, never only a keyboard letter. A locked skill says when it opens.
- **No browser dialogs.** Ask in a card inside the game.

All colours live as tokens at the top of `src/styles.css`.
