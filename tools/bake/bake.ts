/**
 * Paints the web game's art with the same painters (src/art/lfx.js, src/render/scene.ts)
 * and hands each picture to the bake script, which writes them into the iOS app.
 * Run it with `npm run native:art`. The iOS game then shows exactly the art the web game paints.
 */
import { LFX } from '../../src/art/lfx.js';
import { Scene, paintTower, paintFoe } from '../../src/render/scene';
import { Battle } from '../../src/game/sim';
import { STAGES } from '../../src/game/data/stages';
import { TOWER_ORDER, type TowerKind } from '../../src/game/data/towers';
import type { EnemyKind } from '../../src/game/data/enemies';
import { modsFor, freshSave } from '../../src/game/save';
import { SKILL_ICON, LOCK_ICON, ELEMENT_ICON, SOUND_ICON, MUTE_ICON, PAUSE_ICON, PLAY_ICON, LEAVE_ICON, WING_ICON, towerIcon, foeIcon, heroIcon } from '../../src/ui/icons';

declare global {
  interface Window {
    save(name: string, data: string): Promise<void>;
    bake(): Promise<string>;
  }
}

const L = LFX, X = LFX.EXTRA, TAU = Math.PI * 2;
type G = CanvasRenderingContext2D;
type Pass = 'base' | 'emit';

/** A picture painted around an origin, then trimmed to what it covers. */
interface Pic { name: string; c: HTMLCanvasElement; w: number; h: number; ox: number; oy: number; s: number }

/** Paint `fn` with the origin at (ox, oy) of a w x h world box, at `s` pixels per world unit, and trim it. */
function pic(name: string, w: number, h: number, ox: number, oy: number, s: number, fn: (g: G) => void): Pic | null {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * s); c.height = Math.ceil(h * s);
  const g = c.getContext('2d')!;
  g.setTransform(s, 0, 0, s, ox * s, oy * s);
  fn(g);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    if (d[(y * c.width + x) * 4 + 3] > 3) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(c.width - 1, x1 + 1); y1 = Math.min(c.height - 1, y1 + 1);
  const t = document.createElement('canvas');
  t.width = x1 - x0 + 1; t.height = y1 - y0 + 1;
  t.getContext('2d')!.drawImage(c, -x0, -y0);
  // The origin, measured from the trimmed picture's top left, in world units.
  return { name, c: t, w: t.width, h: t.height, ox: (ox * s - x0) / s, oy: (oy * s - y0) / s, s };
}

/* ------------------------------------------------------------------ what to paint */

function towerScale(lv: number) { return 0.6 + 0.06 * (Math.min(lv, 4) - 1); }

function towerPics(out: (Pic | null)[]) {
  for (const k of TOWER_ORDER) {
    for (let lv = 1; lv <= 4; lv++) {
      const S = towerScale(lv);
      // Two looks per tower and level: the web game seeds each tower by its plot.
      for (let v = 0; v < 2; v++) {
        const seed = 200 + v * 7;
        out.push(pic(`t-${k}-${lv}-${v}`, 280, 300, 140, 262, 2, g => {
          // The cannon's barrel turns to aim, so the iOS game draws it on top as its own picture.
          paintTower(g, k, 0, 0, S, 'base', seed, lv, null, k !== 'cannon');
        }));
      }
      const e = (name: string, fn: (g: G) => void) => out.push(pic(name, 280, 320, 140, 282, 1.5, fn));
      switch (k) {
        case 'watch': e(`te-watch-${lv}`, g => L.watchTower(g, 0, 0, S, 'emit', 200)); break;
        case 'bell': e(`te-bell-${lv}`, g => L.frostBell(g, 0, 0, S, 'emit', 200)); break;
        case 'pylon': e(`te-pylon-${lv}`, g => L.stormPylon(g, 0, 0, S, 'emit', 200, null)); break;
        case 'cannon': e(`te-cannon-${lv}`, g => X.forgeCannon(g, 0, 0, S, 'emit', 200)); break;
        case 'beacon': for (let f = 0; f < 6; f++) e(`te-beacon-${lv}-${f}`, g => X.beaconFire(g, 0, 0, S, f / 6 / 1.8)); break;
        case 'roots': e(`te-roots-${lv}-0`, g => X.rootPods(g, 0, 0, S, 0.8, 0)); e(`te-roots-${lv}-1`, g => X.rootPods(g, 0, 0, S, 0.8, 1)); break;
      }
    }
  }
  // The cannon barrel at sixteen aims, painted at scale 1 around its pivot (50 units above the tower's foot).
  for (let a = 0; a < 16; a++) out.push(pic(`barrel-${a}`, 120, 80, 60, 40, 2, g => X.cannonBarrel(g, 0, 50, 1, a / 16 * TAU, 0, 0)));
}

type FoeDraw = (g: G, pass: Pass, legs: number | undefined) => void;
const SEED = 44;
/** Each kind as the web scene paints it (see paintFoe), facing right, at its art scale. */
const FOES: Partial<Record<EnemyKind | 'colossusf' | 'queen', { fn: FoeDraw; walk: boolean; s: number }>> = {
  grub: { fn: (g, p, l) => paintFoe(g, 'grub', 0, 0, p, SEED, 1, l), walk: true, s: 2 },
  skitter: { fn: (g, p, l) => paintFoe(g, 'skitter', 0, 0, p, SEED, 1, l), walk: true, s: 2 },
  mender: { fn: (g, p, l) => paintFoe(g, 'mender', 0, 0, p, SEED, 1, l), walk: true, s: 2 },
  shade: { fn: (g, p, l) => paintFoe(g, 'shade', 0, 0, p, SEED, 1, l), walk: true, s: 2 },
  splitter: { fn: (g, p, l) => paintFoe(g, 'splitter', 0, 0, p, SEED, 1, l), walk: true, s: 2 },
  burrower: { fn: (g, p, l) => paintFoe(g, 'burrower', 0, 0, p, SEED, 1, l), walk: true, s: 2 },
  shell: { fn: (g, p, l) => paintFoe(g, 'shell', 0, 0, p, SEED, 1, l), walk: true, s: 2 },
  sapper: { fn: (g, p, l) => paintFoe(g, 'sapper', 0, 0, p, SEED, 1, l), walk: true, s: 2 },
  elite: { fn: (g, p, l) => paintFoe(g, 'elite', 0, 0, p, SEED, 1, l), walk: true, s: 2 },
  warden: { fn: (g, p, l) => paintFoe(g, 'warden', 0, 0, p, 66, 1, l), walk: true, s: 2 },
  moth: { fn: (g, p) => paintFoe(g, 'moth', 0, 0, p, SEED, 1), walk: false, s: 2 },
  ashmoth: { fn: (g, p) => paintFoe(g, 'ashmoth', 0, 0, p, SEED, 1), walk: false, s: 2 },
  mireking: { fn: (g, p, l) => paintFoe(g, 'mireking', 0, 0, p, 41, 1, l), walk: true, s: 1.5 },
  tidewyrm: { fn: (g, p, l) => paintFoe(g, 'tidewyrm', 0, 0, p, 47, 1, l), walk: true, s: 1.5 },
  colossus: { fn: (g, p, l) => paintFoe(g, 'colossus', 0, 0, p, 61, 1, l, { chilled: false }), walk: true, s: 1.5 },
  colossusf: { fn: (g, p, l) => paintFoe(g, 'colossus', 0, 0, p, 61, 1, l, { chilled: true }), walk: true, s: 1.5 },
  // The Queen's body walks; her wings are their own picture so they can beat.
  queen: { fn: (g, p, l) => paintFoe(g, 'queen', 0, 0, p, 63, 1, l, { wings: false }), walk: true, s: 1.5 },
};
const STEPS = 8;

function foePics(out: (Pic | null)[]) {
  for (const [kind, d] of Object.entries(FOES)) {
    const frames: [string, number | undefined][] = [['s', undefined]];
    if (d!.walk) for (let k = 0; k < STEPS; k++) frames.push([String(k), k / STEPS * TAU]);
    for (const [tag, ph] of frames) {
      out.push(pic(`f-${kind}-${tag}`, 360, 240, 180, 170, d!.s, g => d!.fn(g, 'base', ph)));
      out.push(pic(`fe-${kind}-${tag}`, 360, 240, 180, 170, Math.min(1.5, d!.s), g => d!.fn(g, 'emit', ph)));
    }
  }
  out.push(pic('f-queenw', 360, 260, 180, 170, 1.5, g => L.moth(g, 0, 0, 0.95, 'base', 51, 40)));
  out.push(pic('fe-queenw', 360, 260, 180, 170, 1.5, g => L.moth(g, 0, 0, 0.95, 'emit', 51, 40)));
}

function miscPics(out: (Pic | null)[]) {
  out.push(pic('wren', 80, 120, 40, 90, 2, g => L.wren(g, 0, 0, 1.4, 'base')));
  out.push(pic('wren-e', 120, 140, 60, 100, 2, g => L.wren(g, 0, 0, 1.4, 'emit')));
  out.push(pic('gate', 280, 220, 140, 190, 2, g => L.gate(g, 0, 0, 'base')));
  out.push(pic('gate-e', 280, 260, 140, 220, 1.5, g => L.gate(g, 0, 0, 'emit')));
  out.push(pic('post', 40, 60, 20, 50, 2, g => {
    L.shadow(g, 6, 1, 10, 3, 0.6);
    g.fillStyle = '#1a1410'; g.fillRect(-1.5, -30, 3, 30);
    g.fillStyle = '#16171a'; g.fillRect(-4, -38, 8, 9);
    g.beginPath(); g.moveTo(-5, -38); g.lineTo(0, -42); g.lineTo(5, -38); g.fill();
  }));
  // The small rust mark on a plot you can afford to build on.
  out.push(pic('plus', 40, 40, 20, 20, 3, g => {
    const x = 0, y = 0;
    g.fillStyle = 'rgba(40,24,16,.25)'; g.beginPath(); g.ellipse(x + 1, y + 2, 10, 5, 0, 0, TAU); g.fill();
    g.fillStyle = '#a63d26'; g.beginPath(); g.arc(x, y - 4, 9, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,240,225,.9)'; g.lineWidth = 1.2; g.stroke();
    g.strokeStyle = '#fff6ea'; g.lineWidth = 2.4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - 4, y - 4); g.lineTo(x + 4, y - 4); g.moveTo(x, y - 8); g.lineTo(x, y); g.stroke();
  }));
  // A wreck across a road, whole and broken.
  out.push(pic('wreck', 160, 120, 80, 80, 2, g => {
    L.shadow(g, 6, 10, 46, 12, 0.6);
    g.save(); g.rotate(-0.25);
    g.fillStyle = '#3a2a1c'; g.beginPath(); g.moveTo(-50, 6); g.quadraticCurveTo(0, 30, 50, 4); g.lineTo(44, -18); g.lineTo(-46, -14); g.closePath(); g.fill();
    g.strokeStyle = '#1c140d'; g.lineWidth = 2; for (let k = -40; k < 44; k += 12) { g.beginPath(); g.moveTo(k, -15); g.lineTo(k + 2, 10); g.stroke(); }
    g.fillStyle = '#5a4430'; g.fillRect(-6, -60, 5, 46); g.fillStyle = 'rgba(220,210,190,.6)'; g.beginPath(); g.moveTo(-1, -58); g.lineTo(26, -40); g.lineTo(-1, -26); g.fill();
    g.restore();
  }));
  out.push(pic('wreck-down', 120, 40, 60, 20, 2, g => {
    g.fillStyle = 'rgba(40,30,20,.6)'; for (let k = 0; k < 7; k++) g.fillRect(-40 + k * 12, -4 + (k % 2) * 6, 9, 3);
  }));
}

/* ------------------------------------------------------------------ packing */

/** Shelf-pack pictures into square pages. Returns the pages and where each picture went. */
function pack(pics: Pic[], size: number) {
  const sorted = [...pics].sort((a, b) => b.h - a.h || b.w - a.w);
  const pages: HTMLCanvasElement[] = [];
  const frames: Record<string, number[]> = {};
  let page: CanvasRenderingContext2D | null = null, x = 0, y = 0, rowH = 0;
  const pad = 2;
  for (const p of sorted) {
    if (!page || x + p.w + pad > size) { x = 0; y += rowH + pad; rowH = 0; }
    if (!page || y + p.h + pad > size) {
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      pages.push(c);
      page = c.getContext('2d')!;
      x = 0; y = 0; rowH = 0;
    }
    page.drawImage(p.c, x, y);
    // [page, x, y, w, h (pixels), origin x, origin y (world units from the top left), pixels per unit]
    frames[p.name] = [pages.length - 1, x, y, p.w, p.h, round3(p.ox), round3(p.oy), p.s];
    x += p.w + pad;
    rowH = Math.max(rowH, p.h);
  }
  // Crop the last page to what it uses, so it does not ship empty space.
  const last = pages[pages.length - 1];
  const used = y + rowH + pad;
  if (used < size) {
    const c = document.createElement('canvas');
    c.width = size; c.height = Math.max(64, Math.pow(2, Math.ceil(Math.log2(used))));
    c.getContext('2d')!.drawImage(last, 0, 0);
    pages[pages.length - 1] = c;
  }
  return { pages, frames };
}
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/* ------------------------------------------------------------------ the maps */

async function grounds() {
  const meta: Record<number, unknown> = {};
  for (const st of STAGES) {
    const b = new Battle(st, { mods: modsFor(freshSave()), seed: 7 });
    const cv = document.createElement('canvas');
    const scene = new Scene(cv) as unknown as { load(b: Battle): void; bg: HTMLCanvasElement; g: G; posts: [number, number][]; waterPts: { pts: [number, number][]; w: number }[]; drawRifts(T: number): void };
    scene.load(b);
    // The ground the web game bakes once per stage, with the rifts set into it.
    const ground = document.createElement('canvas');
    ground.width = 1280; ground.height = 720;
    const g = ground.getContext('2d')!;
    g.drawImage(scene.bg, 0, 0);
    scene.g = g;
    scene.drawRifts(0);
    await window.save(`ground-${String(st.id).padStart(2, '0')}.jpg`, ground.toDataURL('image/jpeg', 0.9));
    meta[st.id] = {
      posts: scene.posts.map(([x, y]) => [round3(x), round3(y)]),
      waters: scene.waterPts.map(w => ({ w: w.w, pts: w.pts.map(([x, y]) => [round3(x), round3(y)]) })),
    };
  }
  await window.save('maps.json', 'data:application/json,' + encodeURIComponent(JSON.stringify(meta)));
}

/* ------------------------------------------------------------------ menu pictures */

async function icons() {
  const url = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  for (const k of TOWER_ORDER as TowerKind[]) await window.save(`icon-tower-${k}.png`, towerIcon(k, 128));
  for (const k of Object.keys(FOES)) if (k !== 'colossusf') await window.save(`icon-foe-${k}.png`, foeIcon(k as EnemyKind, 96));
  await window.save('icon-hero.png', heroIcon(64));
  // Line icons, black on clear: the app tints them.
  const line: Record<string, string> = {
    'skill-q': SKILL_ICON.q, 'skill-w': SKILL_ICON.w, 'skill-e': SKILL_ICON.e, 'skill-r': SKILL_ICON.r,
    lock: LOCK_ICON, sound: SOUND_ICON, mute: MUTE_ICON, pause: PAUSE_ICON, play: PLAY_ICON, leave: LEAVE_ICON, wing: WING_ICON,
    ...Object.fromEntries(Object.entries(ELEMENT_ICON).map(([k, v]) => [`el-${k}`, v])),
  };
  for (const [name, svg] of Object.entries(line)) {
    const src = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" ').replace(/currentColor/g, '#000');
    const img = await url('data:image/svg+xml,' + encodeURIComponent(src));
    const c = document.createElement('canvas');
    c.width = 72; c.height = 72;
    c.getContext('2d')!.drawImage(img, 0, 0, 72, 72);
    await window.save(`ui-${name}.png`, c.toDataURL());
  }
}

window.bake = async () => {
  await document.fonts.ready;
  const pics: (Pic | null)[] = [];
  towerPics(pics); foePics(pics); miscPics(pics);
  const all = pics.filter((p): p is Pic => !!p);
  const { pages, frames } = pack(all, 4096);
  for (let i = 0; i < pages.length; i++) await window.save(`sprites-${i}.png`, pages[i].toDataURL());
  await window.save('sprites.json', 'data:application/json,' + encodeURIComponent(JSON.stringify({ pages: pages.map((p, i) => [`sprites-${i}.png`, p.width, p.height]), frames })));
  await grounds();
  await icons();
  return `${all.length} pictures on ${pages.length} pages (${pages.map(p => `${p.width}x${p.height}`).join(', ')})`;
};
