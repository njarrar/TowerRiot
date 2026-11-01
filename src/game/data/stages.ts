import type { Vec } from '../path';
import type { TowerKind } from './towers';
import { waves, type WaveDef } from './waves';

export type Region = 0 | 1 | 2 | 3;

export interface Road {
  id: string;
  /** Which rift the road starts from. Roads that share a spawn are a fork: foes pick the safer one. */
  spawn: string;
  ctrl: Vec[];
  w: number;
}
export interface Plot { at: Vec; /** Gear plots are only up on the matching waves: 'a' on odd waves, 'b' on even. */ gear?: 'a' | 'b'; /** The plot sinks at the start of this wave. Any tower on it is refunded. */ sinkAt?: number }
export interface Water { ctrl: Vec[]; w: number }
/** A timed rule that closes roads: a tide over a ford, lava over a pass, steam in a hall. */
export interface Shift { kind: 'tide' | 'lava' | 'steam'; closes: string[]; every: number; start: number; dur: number; at: Vec; r: number; label: string }
/** A wreck that blocks a road until Sappers chew through it. */
export interface Barrier { road: string; at: number; hp: number }
/** A conveyor belt: foes on it move faster. Distances are shares of the road (0 to 1). */
export interface Belt { road: string; from: number; to: number; mult: number }
/** A steam vent on a road. It blasts foes standing on it. */
export interface Vent { road: string; at: number; every: number; dmg: number }

export interface StageDef {
  id: number;
  name: string;
  region: Region;
  twist: string;
  newFoe: string;
  /** Text shown on the stage card about what this stage unlocks. */
  unlocks: string;
  startGold: number;
  lives: number;
  towers: TowerKind[];
  roads: Road[];
  waters: Water[];
  /** Lava instead of water (region 4). */
  lava?: boolean;
  high?: Vec[];
  plots: Plot[];
  bridges: [number, number, number, number][];
  /** Where runes appear. */
  rune: Vec;
  heroStart: Vec;
  shifts?: Shift[];
  barriers?: Barrier[];
  belts?: Belt[];
  vents?: Vent[];
  weather?: 'rain';
  /** Night falls on even waves. */
  night?: boolean;
  /** A fixed lighthouse that lights a wide circle. */
  lighthouse?: Vec;
  /** Extra foe health for this stage, on top of the usual climb. Default 1. */
  hpMul?: number;
  /** The Hollow adapts every n waves. Default 3. */
  adaptEvery?: number;
  waves: WaveDef[];
}

export const REGIONS = [
  { name: 'Mosslight Vale', rule: 'Forks, night and the swamp', color: '#7fae6a' },
  { name: 'Saltglass Coast', rule: 'Tides, wrecks and storms', color: '#5fa8d0' },
  { name: 'Cogwheel Foundry', rule: 'Belts, gears and steam', color: '#d99a3a' },
  { name: 'Ashen Rift', rule: 'Lava, high ground and the Queen', color: '#d0603a' },
] as const;

const P = (...pts: Vec[]): Plot[] => pts.map(at => ({ at }));
const ALL: TowerKind[] = ['watch', 'cannon', 'bell', 'pylon', 'roots', 'beacon'];

/* =========================== Region 1: Mosslight Vale =========================== */

const s1: StageDef = {
  id: 1, name: 'Lantern Road', region: 0,
  twist: 'One road, one gate. Learn to build, upgrade and send Wren where she is needed.', newFoe: 'Grub', unlocks: 'Watch tower, Forge cannon',
  startGold: 240, lives: 20, towers: ['watch', 'cannon'],
  roads: [{ id: 'main', spawn: 'w', w: 54, ctrl: [[-40, 300], [140, 300], [300, 470], [470, 470], [570, 260], [700, 250], [800, 260], [900, 420], [1060, 450], [1222, 440]] }],
  waters: [{ w: 70, ctrl: [[702, -40], [692, 120], [706, 250], [684, 420], [716, 580], [700, 770]] }],
  plots: P([190, 440], [380, 370], [400, 570], [574, 394], [600, 150], [806, 386], [960, 330], [980, 550], [1120, 340]),
  bridges: [[703, 253, 0.02, 60]], rune: [480, 640], heroStart: [1060, 380],
  waves: waves([
    ['Grubs crawl in', '8 grub /1.3'],
    ['More grubs', '12 grub /1'],
    ['Skitters, fast and frail', '8 grub, 6 skitter +6'],
    ['A skitter swarm', '16 skitter /0.55'],
    ['The road fills up', '16 grub /0.7, 10 skitter +8'],
    ['A Shellback leads them', '1 shell, 18 grub +3 /0.6, 12 skitter +10'],
  ]),
};

const s2: StageDef = {
  id: 2, name: 'Fork in the Moss', region: 0,
  twist: 'The road splits around a pond. Foes take the side with fewer towers.', newFoe: 'Skitter', unlocks: 'Frost bell, Wren\'s W skill',
  startGold: 280, lives: 20, towers: ['watch', 'cannon', 'bell'],
  roads: [
    { id: 'north', spawn: 'w', w: 50, ctrl: [[-40, 370], [200, 370], [330, 220], [600, 170], [840, 240], [960, 370], [1222, 380]] },
    { id: 'south', spawn: 'w', w: 50, ctrl: [[-40, 370], [200, 370], [330, 540], [620, 590], [850, 500], [960, 370], [1222, 380]] },
  ],
  waters: [{ w: 76, ctrl: [[440, 380], [560, 370], [690, 390], [760, 410]] }],
  plots: P([150, 480], [300, 380], [470, 270], [470, 490], [640, 270], [660, 490], [760, 110], [760, 660], [868, 382], [1080, 290], [1080, 480]),
  bridges: [], rune: [600, 300], heroStart: [1040, 380],
  waves: waves([
    ['Grubs test both roads', '10 grub /1.1'],
    ['Skitters split up', '12 skitter /0.7'],
    ['Mixed pack', '12 grub /0.9, 8 skitter +5 /0.6'],
    ['They find your weak side', '20 skitter /0.45'],
    ['Heavy grubs', '24 grub /0.55'],
    ['Shellbacks', '3 shell /3, 12 grub +4 /0.8'],
    ['Swarm', '24 skitter /0.35, 14 grub +6 /0.7'],
    ['Everything at once', '4 shell /2.4, 20 skitter +3 /0.4, 20 grub +8 /0.5'],
  ]),
};

const s3: StageDef = {
  id: 3, name: 'Switchback Hill', region: 0,
  twist: 'The road winds down the hill three times. A tower in the middle covers two passes.', newFoe: 'Shellback', unlocks: 'Root garden',
  startGold: 300, lives: 20, towers: ['watch', 'cannon', 'bell', 'roots'],
  roads: [{ id: 'main', spawn: 'w', w: 50, ctrl: [[-40, 130], [300, 128], [700, 132], [1000, 150], [1110, 230], [1050, 330], [880, 345], [520, 340], [260, 360], [190, 450], [270, 545], [560, 570], [900, 575], [1222, 560]] }],
  waters: [{ w: 34, ctrl: [[1300, 300], [1200, 380], [1190, 470], [1300, 520]] }],
  high: [[0, 0], [1280, 0], [1280, 210], [1160, 240], [1000, 230], [700, 220], [300, 225], [0, 230], [0, 0]],
  plots: P([200, 240], [480, 236], [780, 240], [1170, 120], [380, 450], [620, 455], [860, 455], [1100, 450], [100, 350], [700, 660], [1030, 660]),
  bridges: [], rune: [600, 455], heroStart: [1000, 470],
  waves: waves([
    ['Grubs down the hill', '12 grub /1'],
    ['Skitters', '16 skitter /0.5'],
    ['The first Shellback', '2 shell /3, 10 grub +2'],
    ['A long column', '24 grub /0.6'],
    ['Shells and swarms', '4 shell /2.4, 18 skitter +5 /0.4'],
    ['Fast and heavy', '20 skitter /0.35, 4 shell +6'],
    ['A wall of shells', '8 shell /1.8'],
    ['Everything rolls down', '6 shell /2, 24 grub +2 /0.5, 24 skitter +12 /0.35'],
  ]),
};

const s4: StageDef = {
  id: 4, name: 'Firefly Night', region: 0,
  twist: 'Night falls on even waves. Shades slip past anything that cannot see them, so light the road.', newFoe: 'Shade', unlocks: 'Beacon',
  startGold: 340, lives: 20, towers: ['watch', 'cannon', 'bell', 'roots', 'beacon'], night: true,
  roads: [
    { id: 'north', spawn: 'n', w: 50, ctrl: [[-40, 160], [220, 170], [420, 260], [560, 360], [700, 360], [820, 280], [980, 260], [1100, 360], [1222, 380]] },
    { id: 'south', spawn: 's', w: 50, ctrl: [[-40, 580], [200, 560], [400, 470], [560, 360], [700, 360], [820, 280], [980, 260], [1100, 360], [1222, 380]] },
  ],
  waters: [{ w: 60, ctrl: [[690, 600], [800, 612], [900, 580], [960, 540]] }],
  plots: P([160, 260], [160, 480], [300, 370], [440, 370], [640, 250], [640, 470], [820, 400], [900, 160], [1000, 380], [1130, 250], [1120, 490], [380, 110], [380, 630]),
  bridges: [], rune: [560, 600], heroStart: [960, 400],
  waves: waves([
    ['Two rifts open', '8 grub @n, 8 grub @s +1'],
    ['Night: Shades walk', '6 shade @n /1.4, 10 grub @s'],
    ['Shellbacks in the morning', '3 shell @n /3, 3 shell @s /3 +1, 10 skitter @n +6'],
    ['Night: a Shade pack', '10 shade @s /1, 10 skitter @n'],
    ['Morning rush', '20 skitter @n /0.4, 20 grub @s /0.6'],
    ['Night: shadows and shells', '8 shade @n /1.1, 4 shell @s, 8 shade @s +8'],
    ['Daybreak column', '6 shell @n /2, 24 grub @s /0.5, 12 skitter @n +10'],
    ['Night: the long dark', '16 shade @n /0.8, 16 shade @s /0.8 +2, 6 shell @n +10'],
  ]),
};

const s5: StageDef = {
  id: 5, name: 'The Mire King', region: 0,
  twist: 'Boss. The road spirals into the swamp and the swamp swallows a plot every other wave.', newFoe: 'The Mire King', unlocks: 'Relic: Mire crown (+10% tower damage)',
  startGold: 420, lives: 20, towers: ['watch', 'cannon', 'bell', 'roots', 'beacon'],
  roads: [{ id: 'main', spawn: 'w', w: 50, ctrl: [[-40, 620], [200, 640], [600, 655], [1000, 640], [1170, 520], [1190, 300], [1090, 140], [800, 92], [400, 100], [210, 200], [190, 380], [300, 480], [600, 512], [880, 482], [980, 370], [890, 262], [700, 250], [600, 330], [700, 380]] }],
  waters: [{ w: 40, ctrl: [[420, 380], [480, 370], [520, 410]] }, { w: 36, ctrl: [[1040, 280], [1080, 360], [1060, 420]] }],
  plots: [
    { at: [400, 575] }, { at: [800, 578] }, { at: [1068, 554] }, { at: [1126, 355], sinkAt: 8 }, { at: [600, 175] }, { at: [900, 178] },
    { at: [300, 300], sinkAt: 4 }, { at: [423, 428], sinkAt: 6 }, { at: [780, 400] }, { at: [520, 250] }, { at: [80, 480] }, { at: [1230, 640] },
  ],
  bridges: [], rune: [340, 180], heroStart: [800, 420],
  waves: waves([
    ['The swamp stirs', '14 grub /0.8'],
    ['Skitters skim the mud', '20 skitter /0.45'],
    ['Shells in the reeds', '5 shell /2.2, 10 grub +4'],
    ['Shades at dusk', '10 shade /1, 10 grub +3'],
    ['A heavy tide', '6 shell /2, 24 skitter +4 /0.35'],
    ['The court of the King', '8 shell /1.8, 20 grub +2 /0.5, 8 shade +10'],
    ['The Mire King rises', '1 mireking, 20 grub +5 /1, 6 shell +20 /3'],
  ]),
};

/* =========================== Region 2: Saltglass Coast =========================== */

const TAIL6: Vec[] = [[548, 362], [620, 364], [700, 366], [790, 330], [880, 252], [1000, 244], [1075, 322], [1085, 448], [1150, 512], [1222, 520]];
const s6: StageDef = {
  id: 6, name: 'Low Tide', region: 1,
  twist: 'Two rifts, one bridge. The tide floods the south ford and the Hollow takes the long way round.', newFoe: 'Moth', unlocks: 'Storm pylon',
  startGold: 420, lives: 20, towers: ALL,
  roads: [
    { id: 'north', spawn: 'n', w: 52, ctrl: [[-40, 150], [130, 158], [260, 214], [390, 206], [478, 292], ...TAIL6] },
    { id: 'south', spawn: 's', w: 52, ctrl: [[-40, 612], [140, 610], [246, 546], [330, 500], [432, 440], ...TAIL6] },
    { id: 'detour', spawn: 's', w: 30, ctrl: [[-40, 612], [140, 610], [246, 546], [206, 420], [252, 300], [262, 216], [390, 206], [478, 292], ...TAIL6] },
  ],
  waters: [{ w: 78, ctrl: [[702, -40], [668, 110], [690, 250], [670, 365], [640, 500], [662, 620], [640, 770]] }, { w: 30, ctrl: [[284, 770], [304, 640], [330, 500], [440, 556], [560, 566], [646, 516]] }],
  high: [[790, 0], [1280, 0], [1280, 150], [1150, 170], [990, 160], [880, 128], [800, 86], [790, 0]],
  plots: P([380, 330], [575, 470], [800, 480], [955, 352], [965, 110], [1012, 560], [140, 480], [120, 300], [590, 245], [830, 600], [380, 90]),
  bridges: [[668, 365, Math.atan2(2, 80), 64]], rune: [480, 640], heroStart: [1000, 440],
  shifts: [{ kind: 'tide', closes: ['south'], every: 40, start: 18, dur: 16, at: [330, 500], r: 48, label: 'The tide floods the south ford' }],
  waves: waves([
    ['Two rifts open', '8 grub @n /1.2, 8 grub @s /1.2 +2'],
    ['Skitters on both roads', '10 skitter @n /0.7, 10 skitter @s /0.7 +1'],
    ['Moths over the river', '8 moth @n /1, 12 grub @s /0.9'],
    ['Shellbacks, armored', '3 shell @s /3, 14 grub @n /0.8'],
    ['A Mender walks with them', '2 mender @n /6, 16 grub @n /0.7, 14 skitter @s +3 /0.6'],
    ['Skitter swarm', '22 skitter @n /0.4, 22 skitter @s +2 /0.4'],
    ['A Warden shields the pack', '1 warden @s, 18 grub @s +1.5 /0.6, 10 moth @n +4'],
    ['Moth cloud', '20 moth @n /0.55, 12 moth @s +3 /0.7'],
    ['Shellback column', '6 shell @n /2.2, 2 mender @n +2 /8, 16 skitter @s'],
    ['Elite wave', '2 warden @n /10, 5 shell @s /2.5, 24 grub @n +4 /0.5, 14 moth @s +6 /0.7, 3 mender @s +8'],
  ]),
};

const s7: StageDef = {
  id: 7, name: 'Shipwreck Cove', region: 1,
  twist: 'A wreck blocks the short beach road. Sappers chew through it, and then the Hollow has a shortcut.', newFoe: 'Sapper', unlocks: 'Armory tree: tower rounds',
  startGold: 440, lives: 20, towers: ALL,
  roads: [
    { id: 'cliff', spawn: 'w', w: 50, ctrl: [[-40, 420], [160, 405], [300, 260], [520, 160], [800, 150], [1000, 225], [1100, 360], [1222, 420]] },
    { id: 'beach', spawn: 'w', w: 50, ctrl: [[-40, 420], [160, 435], [320, 555], [640, 588], [900, 560], [1100, 470], [1222, 420]] },
  ],
  waters: [{ w: 170, ctrl: [[-60, 790], [400, 760], [800, 775], [1340, 750]] }],
  plots: P([300, 400], [480, 300], [650, 280], [830, 290], [980, 360], [700, 450], [480, 450], [140, 290], [140, 560], [1150, 240], [1170, 560], [820, 60]),
  bridges: [], rune: [640, 380], heroStart: [1000, 440],
  barriers: [{ road: 'beach', at: 0.45, hp: 500 }],
  waves: waves([
    ['The cliff road', '12 grub /0.9'],
    ['Sappers on the beach', '2 sapper /3, 10 skitter +3 /0.6'],
    ['Moths off the sea', '10 moth /0.8, 10 grub +2'],
    ['More Sappers', '4 sapper /2, 14 grub +2 /0.7'],
    ['Splitting tide', '4 shell /2.4, 16 skitter +3 /0.4'],
    ['Wardens wade in', '1 warden, 16 grub +1 /0.6, 3 sapper +4 /3'],
    ['Moth cloud', '24 moth /0.5'],
    ['Shells and sappers', '6 shell /2, 4 sapper +2 /2, 20 skitter +8 /0.35'],
    ['The storm fleet', '2 warden /8, 6 shell +2 /2, 16 moth +4 /0.6, 2 mender +6 /6, 20 grub +10 /0.5'],
  ]),
};

const s8: StageDef = {
  id: 8, name: 'Lighthouse Rock', region: 1,
  twist: 'Two roads wrap the rock. Towers on the rock see further, and the lighthouse shows every Shade in its beam.', newFoe: 'Splitter', unlocks: 'Wren\'s ultimate: Sunrise',
  startGold: 560, lives: 20, towers: ALL, lighthouse: [640, 360],
  roads: [
    { id: 'north', spawn: 'n', w: 50, ctrl: [[-40, 200], [300, 140], [640, 128], [980, 180], [1100, 330], [1222, 360]] },
    { id: 'south', spawn: 's', w: 50, ctrl: [[-40, 560], [300, 615], [640, 625], [980, 560], [1100, 400], [1222, 360]] },
  ],
  waters: [{ w: 90, ctrl: [[-40, -10], [400, 10], [900, -5], [1320, 20]] }],
  high: [[470, 300], [520, 240], [640, 225], [770, 245], [820, 320], [810, 440], [740, 505], [610, 515], [500, 470], [460, 380], [470, 300]],
  plots: P([540, 320], [740, 320], [560, 450], [720, 450], [200, 380], [400, 380], [880, 380], [1010, 370], [900, 260], [900, 480], [300, 260], [300, 500]),
  bridges: [], rune: [1000, 640], heroStart: [960, 370],
  waves: waves([
    ['Both roads wake', '10 grub @n, 10 grub @s +1'],
    ['Splitters', '4 splitter @n /2, 4 splitter @s /2 +1'],
    ['Shades in the beam', '6 shade @n /1.2, 6 shade @s /1.2 +2, 8 grub @n +4'],
    ['Moths and Menders', '12 moth @n /0.7, 2 mender @s /5, 12 grub @s +1'],
    ['Splitter swarm', '8 splitter @n /1.2, 8 splitter @s /1.2 +3'],
    ['Wardens', '1 warden @n, 1 warden @s +3, 14 grub @n +1 /0.6, 14 grub @s +4 /0.6'],
    ['Shells in the dark', '5 shell @n /2.2, 10 shade @s /0.9'],
    ['Moth cloud', '20 moth @n /0.5, 20 moth @s /0.5 +2'],
    ['The breakers', '2 warden @n /8, 8 splitter @s /1.2, 6 shell @n +6 /2, 12 shade @s +10 /0.8'],
    ['Last light', '8 splitter @n /1.1, 8 splitter @s /1.1, 2 mender @n +4 /4, 16 skitter @s +8 /0.35, 10 moth @n +12 /0.6'],
  ]),
};

const s9: StageDef = {
  id: 9, name: 'Storm Shelf', region: 1,
  twist: 'Rain soaks everything. Lightning jumps twice as far and fire burns weaker. The road crosses itself on a stone viaduct.', newFoe: 'Warden', unlocks: 'Tower splits at level 4',
  startGold: 480, lives: 20, towers: ALL, weather: 'rain',
  roads: [{ id: 'main', spawn: 'w', w: 48, ctrl: [[-40, 180], [260, 190], [460, 300], [640, 392], [820, 480], [1000, 545], [1130, 440], [1140, 280], [1010, 200], [820, 300], [640, 392], [460, 486], [280, 560], [140, 600]] }],
  waters: [],
  plots: P([640, 260], [640, 530], [470, 395], [810, 395], [1010, 370], [300, 320], [300, 420], [960, 640], [180, 420], [820, 160], [460, 160], [1220, 370]),
  bridges: [[640, 392, 0.48, 46]], rune: [980, 380], heroStart: [600, 390],
  waves: waves([
    ['Rain on the shelf', '14 grub /0.8'],
    ['Wardens march', '1 warden, 12 grub +1 /0.7'],
    ['Skitter rush', '24 skitter /0.35'],
    ['Splitters', '6 splitter /1.4, 10 grub +3'],
    ['Moths in the storm', '18 moth /0.55'],
    ['Two Wardens', '2 warden /8, 6 shell +2 /2'],
    ['Menders and shells', '3 mender /4, 8 shell +1 /1.8'],
    ['Splitting storm', '10 splitter /1, 24 skitter +5 /0.3'],
    ['Shade squall', '16 shade /0.6, 2 warden +4 /6'],
    ['The thunderhead', '3 warden /6, 10 shell +2 /1.6, 20 moth +6 /0.5, 4 mender +8 /4'],
  ]),
};

const s10: StageDef = {
  id: 10, name: 'The Tidewyrm', region: 1,
  twist: 'Boss. Two bridges, two tides. Each bridge floods in turn, and the Wyrm dives under to heal.', newFoe: 'The Tidewyrm', unlocks: 'Relic: Tide pearl (+15% tower range near water)',
  startGold: 640, lives: 20, towers: ALL,
  roads: [
    { id: 'north', spawn: 'w', w: 50, ctrl: [[-40, 360], [140, 360], [300, 230], [560, 185], [740, 190], [1000, 250], [1222, 360]] },
    { id: 'south', spawn: 'w', w: 50, ctrl: [[-40, 360], [140, 360], [300, 500], [560, 540], [740, 532], [1000, 470], [1222, 360]] },
  ],
  waters: [{ w: 92, ctrl: [[652, -40], [632, 190], [650, 360], [632, 540], [652, 770]] }],
  plots: P([280, 360], [440, 360], [440, 90], [440, 640], [860, 360], [860, 100], [860, 620], [1060, 360], [540, 360], [770, 360], [160, 120], [160, 600]),
  bridges: [[636, 188, 0.03, 64], [636, 538, -0.03, 64]], rune: [1100, 640], heroStart: [940, 360],
  shifts: [
    { kind: 'tide', closes: ['north'], every: 50, start: 10, dur: 18, at: [636, 188], r: 60, label: 'High tide on the north bridge' },
    { kind: 'tide', closes: ['south'], every: 50, start: 35, dur: 18, at: [636, 538], r: 60, label: 'High tide on the south bridge' },
  ],
  waves: waves([
    ['The water rises', '16 grub /0.7'],
    ['Splitters on the bridges', '8 splitter /1.2'],
    ['Wardens and moths', '2 warden /6, 10 moth +2 /0.7'],
    ['Shells', '7 shell /1.8'],
    ['Menders', '4 mender /3, 20 grub +1 /0.5'],
    ['Shades on the foam', '20 shade /0.6'],
    ['Spray of skitters', '40 skitter /0.25, 3 warden +6 /5'],
    ['The Tidewyrm', '1 tidewyrm, 10 moth +6 /0.9, 4 shell +12 /3, 6 splitter +24 /1.6'],
  ]),
};

/* =========================== Region 3: Cogwheel Foundry =========================== */

const s11: StageDef = {
  id: 11, name: 'Conveyor Hall', region: 2,
  twist: 'Iron belts carry foes faster. Slow them before the belts, hit them after.', newFoe: 'Mender', unlocks: 'Shop item: Cleaving spear',
  startGold: 520, lives: 20, towers: ALL,
  roads: [{ id: 'main', spawn: 'w', w: 50, ctrl: [[-40, 140], [420, 150], [440, 330], [220, 360], [200, 560], [640, 580], [660, 330], [880, 150], [1100, 160], [1120, 400], [900, 560], [1222, 610]] }],
  waters: [],
  plots: P([300, 255], [570, 240], [100, 460], [330, 460], [540, 450], [780, 380], [1000, 290], [780, 630], [993, 430], [1200, 470], [760, 60], [1240, 230]),
  bridges: [], rune: [100, 640], heroStart: [960, 420],
  belts: [{ road: 'main', from: 0.16, to: 0.32, mult: 1.7 }, { road: 'main', from: 0.58, to: 0.74, mult: 1.7 }],
  waves: waves([
    ['Grubs on the belt', '18 grub /0.6'],
    ['Menders keep them going', '3 mender /4, 14 grub +1 /0.7'],
    ['Skitters at speed', '30 skitter /0.3'],
    ['Iron shells', '8 shell /1.8'],
    ['Splitters', '10 splitter /1'],
    ['Wardens on the line', '2 warden /6, 3 mender +2 /4, 16 grub +3 /0.6'],
    ['Moths in the rafters', '24 moth /0.45'],
    ['Shift change', '10 shell /1.4, 6 mender +3 /3, 30 skitter +10 /0.25'],
    ['Full output', '4 warden /5, 12 splitter +2 /1, 20 moth +8 /0.5, 6 mender +12 /3'],
  ]),
};

const s12: StageDef = {
  id: 12, name: 'Gear Garden', region: 2,
  twist: 'The garden turns. Gear plots rise on alternate waves: gold plots on odd waves, iron plots on even ones.', newFoe: 'Burrower', unlocks: 'Bulwark tree',
  startGold: 560, lives: 20, towers: ALL,
  roads: [
    { id: 'main', spawn: 'w', w: 50, ctrl: [[-40, 600], [180, 590], [300, 440], [320, 250], [460, 130], [700, 120], [860, 240], [880, 440], [1000, 600], [1222, 600]] },
    { id: 'top', spawn: 'n', w: 46, ctrl: [[1000, -40], [1010, 120], [1100, 300], [1060, 470], [1000, 600], [1222, 600]] },
  ],
  waters: [],
  plots: [
    { at: [160, 450], gear: 'a' }, { at: [470, 290], gear: 'a' }, { at: [720, 300], gear: 'a' }, { at: [960, 470], gear: 'a' },
    { at: [460, 470], gear: 'b' }, { at: [600, 400], gear: 'b' }, { at: [740, 460], gear: 'b' }, { at: [1180, 420], gear: 'b' },
    { at: [180, 250] }, { at: [600, 250] }, { at: [960, 280] }, { at: [1140, 120] }, { at: [600, 640] },
  ],
  bridges: [], rune: [600, 520], heroStart: [960, 560],
  waves: waves([
    ['The garden wakes', '16 grub @w /0.7'],
    ['Burrowers dig in', '4 burrower @w /2, 10 grub @n /0.8'],
    ['Two fronts', '20 skitter @w /0.35, 10 skitter @n /0.5'],
    ['Shells and menders', '6 shell @w /2, 2 mender @n /5'],
    ['Under the roots', '8 burrower @w /1.4, 5 burrower @n /1.8'],
    ['Splitters', '10 splitter @w /1.1, 4 splitter @n /2'],
    ['Moths', '16 moth @w /0.5, 10 moth @n /0.6'],
    ['Wardens', '2 warden @w /6, 1 warden @n, 16 grub @w +2 /0.5'],
    ['Iron and earth', '10 shell @w /1.4, 7 burrower @n /1.2, 4 mender @w +6 /3'],
    ['The garden turns', '3 warden @w /5, 6 burrower @n /1.4, 11 splitter @w +6 /1, 14 moth @n +10 /0.6'],
  ]),
};

const s13: StageDef = {
  id: 13, name: 'Steam Vents', region: 2,
  twist: 'Two halls run side by side. Vents blast foes on the road, and Wren standing on a vent makes it fire twice as often.', newFoe: 'Ash moth', unlocks: 'Shop item: Brass lantern',
  startGold: 580, lives: 20, towers: ALL,
  roads: [
    { id: 'upper', spawn: 'a', w: 48, ctrl: [[-40, 160], [300, 170], [520, 300], [760, 300], [960, 180], [1100, 250], [1222, 360]] },
    { id: 'lower', spawn: 'b', w: 48, ctrl: [[-40, 560], [300, 560], [520, 420], [760, 420], [960, 540], [1100, 460], [1222, 360]] },
  ],
  waters: [],
  plots: P([732, 360], [400, 360], [880, 360], [300, 270], [300, 460], [560, 190], [560, 530], [780, 190], [780, 530], [1000, 360], [160, 360], [1100, 120], [1100, 600]),
  bridges: [], rune: [160, 640], heroStart: [960, 360],
  vents: [{ road: 'upper', at: 0.45, every: 7, dmg: 60 }, { road: 'lower', at: 0.45, every: 7, dmg: 60 }, { road: 'upper', at: 0.78, every: 9, dmg: 80 }, { road: 'lower', at: 0.78, every: 9, dmg: 80 }],
  waves: waves([
    ['Steam rising', '12 grub @a /0.8, 12 grub @b /0.8 +1'],
    ['Ash moths', '8 ashmoth @a /0.9, 8 ashmoth @b /0.9 +2'],
    ['Burrowers', '6 burrower @a /1.4, 6 burrower @b /1.4 +1'],
    ['Shells', '5 shell @a /2, 5 shell @b /2 +1'],
    ['Menders on both halls', '2 mender @a /5, 2 mender @b /5, 16 skitter @a +2 /0.4, 16 skitter @b +3 /0.4'],
    ['Ash cloud', '16 ashmoth @a /0.5, 16 ashmoth @b /0.5 +3'],
    ['Wardens', '1 warden @a, 1 warden @b +2, 10 splitter @a +3 /1, 10 splitter @b +4 /1'],
    ['Heavy steam', '8 shell @a /1.6, 8 burrower @b /1.2, 12 ashmoth @a +8 /0.6'],
    ['Pressure', '2 warden @a /6, 2 warden @b /6, 10 shell @b +2 /1.5, 20 ashmoth @a +6 /0.5, 4 mender @b +10 /3'],
  ]),
};

const s14: StageDef = {
  id: 14, name: 'Assembly Line', region: 2,
  twist: 'Three lines feed one gate. Iron Shellbacks come off the line armored, so small hits barely scratch them.', newFoe: 'Iron Shellback', unlocks: 'Shop item: Spear of dawn',
  startGold: 620, lives: 20, towers: ALL,
  roads: [
    { id: 'top', spawn: 't', w: 46, ctrl: [[380, -40], [400, 140], [560, 280], [800, 360], [960, 360], [1060, 240], [1180, 300], [1222, 360]] },
    { id: 'mid', spawn: 'm', w: 46, ctrl: [[-40, 360], [300, 360], [560, 360], [800, 360], [960, 360], [1060, 240], [1180, 300], [1222, 360]] },
    { id: 'bot', spawn: 'b', w: 46, ctrl: [[380, 760], [400, 580], [560, 440], [800, 360], [960, 360], [1060, 240], [1180, 300], [1222, 360]] },
  ],
  waters: [],
  plots: P([240, 250], [240, 470], [440, 270], [440, 450], [680, 250], [680, 470], [880, 270], [880, 450], [1060, 380], [1160, 160], [600, 100], [600, 620], [1100, 540]),
  bridges: [], rune: [140, 140], heroStart: [960, 420],
  waves: waves([
    ['Three lines start', '8 grub @t, 8 grub @m +1, 8 grub @b +2'],
    ['Iron off the line', '2 elite @m /4, 10 skitter @t /0.5, 10 skitter @b /0.5'],
    ['Burrowers', '6 burrower @t /1.4, 6 burrower @b /1.4 +1'],
    ['Ash moths', '12 ashmoth @m /0.6, 6 elite @m +4 /2.5'],
    ['Menders', '3 mender @t /4, 3 mender @b /4, 20 grub @m /0.5'],
    ['Splitters', '8 splitter @t /1.1, 8 splitter @b /1.1'],
    ['Heavy line', '8 elite @m /2, 2 warden @t /6'],
    ['Full shift', '6 elite @t /2, 6 elite @b /2, 20 ashmoth @m +4 /0.5, 4 mender @m +8 /3'],
    ['Overtime', '3 warden @m /5, 10 elite @t /1.6, 12 burrower @b /1, 16 splitter @m +10 /0.8'],
  ]),
};

const s15: StageDef = {
  id: 15, name: 'The Brass Colossus', region: 2,
  twist: 'Boss. Brass plates turn most damage away. Chill the Colossus with frost and the plates crack.', newFoe: 'The Brass Colossus', unlocks: 'Relic: Brass heart (+1 Wren skill point)',
  startGold: 680, lives: 20, towers: ALL,
  roads: [{ id: 'main', spawn: 'w', w: 54, ctrl: [[-40, 120], [500, 120], [900, 125], [1120, 250], [1130, 470], [900, 600], [500, 605], [200, 580], [130, 460], [-40, 440]] }],
  waters: [],
  high: [[320, 260], [900, 250], [960, 360], [900, 470], [320, 470], [260, 360], [320, 260]],
  plots: P([400, 300], [620, 300], [840, 300], [400, 430], [620, 430], [840, 430], [1000, 360], [300, 360], [700, 220], [700, 510], [1240, 360], [200, 220], [1000, 660]),
  bridges: [], rune: [1240, 120], heroStart: [200, 440],
  waves: waves([
    ['The foundry floor', '20 grub /0.5'],
    ['Iron Shellbacks', '6 elite /2'],
    ['Ash moths', '20 ashmoth /0.5'],
    ['Burrowers and menders', '10 burrower /1, 4 mender +2 /3'],
    ['Wardens', '3 warden /5, 20 skitter +2 /0.3'],
    ['Splitter pile', '16 splitter /0.8'],
    ['The Colossus wakes', '1 colossus, 8 elite +8 /3, 4 mender +14 /4, 20 ashmoth +24 /0.6'],
  ]),
};

/* =========================== Region 4: Ashen Rift =========================== */

const s16: StageDef = {
  id: 16, name: 'Ember Pass', region: 3, lava: true,
  twist: 'Three roads through the pass. Lava closes one of them at a time, so the fight moves.', newFoe: 'Burrower swarm', unlocks: 'Wren gear: Ember spear',
  startGold: 680, lives: 20, towers: ALL, hpMul: 1.8,
  roads: [
    { id: 'top', spawn: 'w', w: 46, ctrl: [[-40, 360], [160, 360], [300, 180], [640, 130], [980, 180], [1100, 330], [1222, 360]] },
    { id: 'mid', spawn: 'w', w: 46, ctrl: [[-40, 360], [160, 360], [400, 380], [640, 345], [880, 380], [1100, 355], [1222, 360]] },
    { id: 'bot', spawn: 'w', w: 46, ctrl: [[-40, 360], [160, 360], [300, 540], [640, 600], [980, 540], [1100, 390], [1222, 360]] },
  ],
  waters: [{ w: 36, ctrl: [[640, -40], [660, 60], [630, 110]] }, { w: 36, ctrl: [[640, 770], [620, 680], [650, 630]] }],
  plots: P([420, 270], [640, 240], [860, 270], [420, 470], [640, 470], [860, 470], [160, 220], [160, 500], [1000, 270], [1000, 460], [300, 70], [1180, 220], [1180, 500]),
  bridges: [], rune: [100, 640], heroStart: [1080, 360],
  shifts: [
    { kind: 'lava', closes: ['top'], every: 54, start: 0, dur: 18, at: [640, 130], r: 56, label: 'Lava floods the high pass' },
    { kind: 'lava', closes: ['mid'], every: 54, start: 18, dur: 18, at: [640, 345], r: 56, label: 'Lava floods the middle road' },
    { kind: 'lava', closes: ['bot'], every: 54, start: 36, dur: 18, at: [640, 600], r: 56, label: 'Lava floods the low road' },
  ],
  waves: waves([
    ['Ash on the wind', '20 grub /0.5'],
    ['Burrower swarm', '14 burrower /0.7'],
    ['Ash moths', '20 ashmoth /0.45'],
    ['Iron', '8 elite /1.8'],
    ['Splitters', '14 splitter /0.8'],
    ['Wardens and menders', '3 warden /5, 4 mender +2 /3, 20 grub +3 /0.4'],
    ['Shades through the smoke', '24 shade /0.5'],
    ['Deep burrow', '24 burrower /0.5, 6 elite +6 /2'],
    ['The pass burns', '4 warden /4, 12 elite +2 /1.4, 24 ashmoth +8 /0.4, 16 burrower +14 /0.6'],
  ]),
};

const s17: StageDef = {
  id: 17, name: 'Avalanche Ridge', region: 3, lava: true,
  twist: 'The ridge gives range to towers on it, but avalanches bury ridge plots as the waves go on.', newFoe: 'Iron swarm', unlocks: 'Wren gear: Dawn mantle',
  startGold: 720, lives: 20, towers: ALL, hpMul: 1.7,
  roads: [{ id: 'main', spawn: 'w', w: 50, ctrl: [[-40, 640], [200, 620], [400, 520], [520, 400], [700, 420], [860, 560], [1060, 600], [1160, 450], [1110, 300], [1222, 250]] }],
  waters: [{ w: 34, ctrl: [[300, 770], [340, 690], [430, 660]] }],
  high: [[0, 0], [1000, 0], [1010, 160], [900, 280], [700, 300], [400, 310], [0, 330], [0, 0]],
  plots: [
    { at: [200, 200] }, { at: [400, 210], sinkAt: 7 }, { at: [600, 220], sinkAt: 4 }, { at: [800, 210], sinkAt: 10 }, { at: [940, 120] },
    { at: [300, 430] }, { at: [640, 540] }, { at: [820, 420] }, { at: [1000, 470] }, { at: [1240, 400] }, { at: [1040, 680] }, { at: [120, 520] },
  ],
  bridges: [], rune: [500, 640], heroStart: [1000, 520],
  waves: waves([
    ['Up the ridge', '24 grub /0.45'],
    ['Iron swarm', '10 elite /1.4'],
    ['Ash moths', '24 ashmoth /0.4'],
    ['Burrowers', '20 burrower /0.6'],
    ['Splitters', '16 splitter /0.7'],
    ['Wardens', '4 warden /4, 24 skitter +2 /0.25'],
    ['Menders and iron', '6 mender /2, 12 elite +2 /1.2'],
    ['Shades in the snow', '30 shade /0.4'],
    ['Rockfall', '16 elite /1, 20 burrower +6 /0.5'],
    ['The ridge breaks', '5 warden /3, 20 splitter +3 /0.6, 30 ashmoth +10 /0.35, 8 mender +16 /2'],
  ]),
};

const s18: StageDef = {
  id: 18, name: 'Mirror Lake', region: 3, lava: true,
  twist: 'Two gates across a lake of fire. Foes copy your weak side, so defend both and keep Wren moving.', newFoe: 'Everything doubled', unlocks: 'Shop item: Second dawn',
  startGold: 760, lives: 20, towers: ALL, hpMul: 1.2,
  roads: [
    { id: 'north', spawn: 'w', w: 48, ctrl: [[-40, 380], [160, 380], [300, 240], [600, 180], [900, 200], [1222, 200]] },
    { id: 'south', spawn: 'w', w: 48, ctrl: [[-40, 380], [160, 380], [300, 520], [600, 580], [900, 560], [1222, 560]] },
  ],
  waters: [{ w: 92, ctrl: [[360, 382], [600, 372], [880, 380], [1000, 385]] }],
  plots: P([440, 90], [760, 90], [440, 660], [760, 660], [1100, 380], [1100, 90], [1100, 660], [600, 270], [600, 480], [880, 290], [880, 470], [180, 250], [180, 510]),
  bridges: [], rune: [1240, 380], heroStart: [1100, 300],
  waves: waves([
    ['Reflections', '24 grub /0.4'],
    ['Twins', '10 splitter /0.9'],
    ['Iron', '12 elite /1.2'],
    ['Ash moths', '18 ashmoth /0.4, 12 grub +2 /0.5'],
    ['Burrowers', '14 burrower /0.7, 10 grub +2 /0.5'],
    ['Wardens', '4 warden /3, 6 mender +2 /2'],
    ['Shades', '24 shade /0.45, 8 elite +4 /1.5'],
    ['Mirror storm', '16 elite /0.9, 30 skitter +2 /0.2'],
    ['Double image', '4 warden /4, 14 splitter +3 /0.6, 20 ashmoth +10 /0.4, 6 mender +14 /2.5'],
  ]),
};

const s19: StageDef = {
  id: 19, name: 'The Hollow Gate', region: 3, lava: true,
  twist: 'Four rifts, every foe. The Hollow adapts after every wave, not every third one.', newFoe: 'All of them', unlocks: 'Capstones in every tree',
  startGold: 820, lives: 20, towers: ALL, adaptEvery: 1, hpMul: 1.5,
  roads: [
    { id: 'nw', spawn: 'nw', w: 44, ctrl: [[-40, 160], [240, 200], [480, 330], [640, 360], [800, 360], [960, 250], [1100, 300], [1222, 360]] },
    { id: 'sw', spawn: 'sw', w: 44, ctrl: [[-40, 560], [240, 520], [480, 390], [640, 360], [800, 360], [960, 250], [1100, 300], [1222, 360]] },
    { id: 'n', spawn: 'n', w: 44, ctrl: [[620, -40], [600, 120], [640, 360], [800, 360], [960, 250], [1100, 300], [1222, 360]] },
    { id: 's', spawn: 's', w: 44, ctrl: [[620, 760], [600, 600], [640, 360], [800, 360], [960, 250], [1100, 300], [1222, 360]] },
  ],
  waters: [],
  plots: P([395, 222], [408, 490], [760, 240], [760, 480], [500, 140], [500, 580], [960, 380], [1100, 180], [1100, 470], [220, 360], [880, 640], [880, 80], [1240, 560]),
  bridges: [], rune: [200, 640], heroStart: [960, 420],
  waves: waves([
    ['Four rifts tear open', '8 grub @nw, 8 grub @sw +1, 8 grub @n +2, 8 grub @s +3'],
    ['Iron from the north', '6 elite @n /2, 10 skitter @sw /0.4'],
    ['Shades from the south', '10 shade @s /0.8, 6 burrower @nw /1.2'],
    ['Ash and splitters', '16 ashmoth @nw /0.5, 10 splitter @sw /1'],
    ['Wardens from all sides', '1 warden @nw, 1 warden @sw, 1 warden @n, 1 warden @s, 24 grub @nw +4 /0.3'],
    ['Menders', '4 mender @n /3, 4 mender @s /3, 12 elite @nw /1.4'],
    ['Burrow everywhere', '8 burrower @nw /1, 8 burrower @sw /1, 6 burrower @n /1.2'],
    ['Moth storm', '24 moth @n /0.4, 24 ashmoth @s /0.4'],
    ['Iron tide', '12 elite @nw /1, 12 elite @sw /1, 3 warden @n +4 /4'],
    ['The Gate opens', '4 warden @nw /4, 16 splitter @sw /0.7, 30 shade @s /0.3, 24 ashmoth @n /0.4, 8 mender @nw +10 /2'],
  ]),
};

const s20: StageDef = {
  id: 20, name: 'The Hollow Queen', region: 3, lava: true,
  twist: 'Final boss. The Queen walks from the far rifts. Each time she breaks a phase, the lava moves and new roads open.', newFoe: 'The Hollow Queen', unlocks: 'The ending',
  startGold: 1000, lives: 20, towers: ALL,
  roads: [
    { id: 'high', spawn: 'ne', w: 46, ctrl: [[1320, 120], [1000, 130], [700, 200], [400, 160], [200, 260], [150, 440], [160, 620]] },
    { id: 'mid', spawn: 'ne', w: 46, ctrl: [[1320, 120], [1000, 130], [900, 360], [600, 420], [300, 560], [160, 620]] },
    { id: 'low', spawn: 'se', w: 46, ctrl: [[1320, 600], [1000, 620], [700, 600], [400, 650], [160, 620]] },
  ],
  waters: [{ w: 40, ctrl: [[1300, 380], [1150, 360], [1060, 400]] }],
  plots: P([700, 300], [500, 290], [300, 380], [800, 500], [520, 520], [1100, 250], [1100, 480], [850, 60], [560, 60], [80, 300], [253, 688], [993, 688], [970, 360]),
  bridges: [], rune: [700, 420], heroStart: [300, 520],
  shifts: [
    { kind: 'lava', closes: ['mid'], every: 60, start: 20, dur: 20, at: [900, 360], r: 60, label: 'Lava cuts the middle road' },
    { kind: 'lava', closes: ['high'], every: 60, start: 45, dur: 15, at: [400, 160], r: 56, label: 'Lava cuts the high road' },
  ],
  waves: waves([
    ['Her heralds', '24 grub @ne /0.4, 12 grub @se /0.5'],
    ['Iron court', '8 elite @ne /1.5, 8 burrower @se /1'],
    ['Ash wings', '18 ashmoth @ne /0.45, 14 moth @se /0.5, 12 grub @ne +4 /0.5'],
    ['Splitter tide', '20 splitter @ne /0.6, 6 mender @se /2'],
    ['The guard', '4 warden @ne /4, 10 elite @se /1.4'],
    ['Shadows', '14 shade @ne /0.6, 8 burrower @se /0.9, 10 grub @ne +3 /0.5'],
    ['The Hollow Queen', '1 queen @ne, 4 warden @se +4 /5, 12 elite @ne +12 /1.5, 18 ashmoth @se +20 /0.5, 6 mender @ne +30 /3'],
  ]),
};

export const STAGES: StageDef[] = [s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12, s13, s14, s15, s16, s17, s18, s19, s20];

export const stageById = (id: number): StageDef => {
  const s = STAGES.find(x => x.id === id);
  if (!s) throw new Error(`No stage ${id}`);
  return s;
};

/** Rift ids used by a stage, each with the roads that leave it. */
export function spawnsOf(st: StageDef): Map<string, Road[]> {
  const m = new Map<string, Road[]>();
  for (const r of st.roads) m.set(r.spawn, [...(m.get(r.spawn) ?? []), r]);
  return m;
}
