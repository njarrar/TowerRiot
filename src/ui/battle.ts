/** The battle screen: canvas, HUD, build menus, hero controls and the result card. */
import { Battle, ell, starLives, type BattleEvent, type TargetMode, type Tower } from '../game/sim';
import { Scene, W as MAP_W, type View } from '../render/scene';
import { stageById } from '../game/data/stages';
import { TOWERS, TOWER_ORDER, type Rounds, type TowerKind } from '../game/data/towers';
import { ENEMIES } from '../game/data/enemies';
import { SKILLS, SNARE, type SkillKey } from '../game/data/hero';
import { ITEMS, ITEM_ORDER, ITEM_SLOTS, RUNES } from '../game/data/shop';
import type { Mods } from '../game/mods';
import type { Audio } from '../audio/sfx';
import { h, clear, setText, icon } from './dom';
import { towerIcon, foeIcon, heroIcon, SKILL_ICON, LOCK_ICON, ELEMENT_ICON, PAUSE_ICON, PLAY_ICON, LEAVE_ICON, WING_ICON } from './icons';

export interface BattleHost {
  audio: Audio;
  mods: Mods;
  reduceMotion: boolean;
  autoSkills: boolean;
  dmgNumbers: boolean;
  onExit(): void;
  onResult(stageId: number, stars: number): number;
  onNext(stageId: number): void;
  onRetry(stageId: number): void;
}

const ELEMENT_NAME: Record<string, string> = { pierce: 'bolts', fire: 'fire', frost: 'frost', storm: 'lightning', nature: 'roots' };
const ELEMENT_TITLE: Record<string, string> = { pierce: 'Bolts', fire: 'Fire', frost: 'Frost', storm: 'Lightning', nature: 'Roots' };
/** The most the Hollow can harden against one element. */
const RESIST_CAP = 0.6;
const MODE_NAME: Record<TargetMode, string> = { first: 'First', strong: 'Strongest', close: 'Closest' };
const ROUND_NAME: Record<Rounds, string> = { ember: 'Ember', frost: 'Frost', storm: 'Storm' };
/** What each tower is for, in a few words: shown on the build buttons, since a finger cannot hover. */
const TOWER_ROLE: Record<TowerKind, string> = {
  watch: 'One target, hits fliers', cannon: 'Blasts groups, ground only', bell: 'Slows all around it',
  pylon: 'Jumps foe to foe, hits fliers', roots: 'Holds a foe, ground only', beacon: 'Boosts towers, shows Shades',
};
const coin = (n: number | string) => h('span', { class: 'price' }, h('i', { class: 'ico gold', 'aria-hidden': 'true' }), String(n));

export class BattleScreen {
  readonly el: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly scene: Scene;
  private battle: Battle;
  private view: View;
  private raf = 0;
  private last = 0;
  private T = 0;
  private aimingW = false;
  private menu: HTMLElement;
  private banner: HTMLElement;
  private bannerT = 0;
  private bannerQ: { title: string; sub: string; secs: number }[] = [];
  private lvlT = 0;
  private hud: Record<string, HTMLElement> = {};
  private skillBtns = new Map<SkillKey, HTMLButtonElement>();
  private shopOpen = false;
  private shopEl: HTMLElement;
  private ended = false;
  private menuKey = '';
  /** Stage 1 marks one plot until the first tower goes up, so a new player builds before anything else. */
  private hintPlot: number | null = null;
  private hintEl: HTMLElement;
  /** Lives lost to each kind of foe, for the defeat card. */
  private leakBy = new Map<string, number>();
  private readonly onResize = () => this.fit();
  private readonly onKey = (e: KeyboardEvent) => this.key(e);

  constructor(private readonly host: BattleHost, stageId: number) {
    const st = stageById(stageId);
    this.battle = new Battle(st, { mods: host.mods, seed: Date.now() & 0xffff });
    this.view = { selPlot: null, selTower: null, preview: null, aimW: null, reduceMotion: host.reduceMotion, dmgNumbers: host.dmgNumbers };
    this.canvas = h('canvas', { class: 'stage-canvas', 'aria-label': `Battle map: ${st.name}` });
    this.scene = new Scene(this.canvas);
    this.menu = h('div', { class: 'popup hidden', role: 'dialog' });
    this.banner = h('div', { class: 'banner off', 'aria-live': 'polite' }, h('div', { class: 'banner-title' }), h('div', { class: 'banner-sub' }));
    this.shopEl = h('div', { class: 'shop hidden', role: 'dialog', 'aria-label': 'Shop' });
    this.hintEl = h('div', { class: 'plot-hint hidden', 'aria-hidden': 'true', text: 'Build here' });
    this.el = h('section', { class: 'screen battle' }, this.canvas, this.buildHud(), this.hintEl, this.banner, this.menu, this.shopEl);
  }

  /** Paint the map (slow), then start the loop. */
  start() {
    this.fit();
    this.scene.load(this.battle);
    this.bindInput();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKey);
    const st = this.battle.stage;
    this.showBanner(st.name, st.twist, 4);
    if (st.id === 1) {
      // First stage: one skill works right away. Building comes first; how to move Wren follows the first tower.
      if (this.battle.canLearn('q')) this.battle.learn('q');
      const b = this.battle, hx = b.hero.x, hy = b.hero.y;
      let best = 0;
      b.plots.forEach((p, i) => { if (Math.hypot(p.x - hx, p.y - hy) < Math.hypot(b.plots[best].x - hx, b.plots[best].y - hy)) best = i; });
      this.hintPlot = best;
      this.view.hintPlot = best;
      this.showBanner('Build your first tower', 'Tap the marked plot. Towers do most of the work.', 5);
    }
    if (this.host.autoSkills) this.battle.autoLearn();
    this.last = performance.now();
    this.raf = requestAnimationFrame(t => this.frame(t));
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKey);
  }

  /**
   * Lay out the screen. Wide phones get side columns beside the map, so nothing covers it.
   * Narrower screens get a band under the map. The map always keeps its 16:9 shape.
   */
  private fit() {
    const r = this.el.getBoundingClientRect();
    const w = Math.max(320, r.width || window.innerWidth), hgt = Math.max(200, r.height || window.innerHeight);
    const { l: safeL, r: safeR, b: safeB } = safeInsets();
    const sideRoom = (w - safeL - safeR - hgt * 16 / 9) / 2;
    const side = sideRoom >= 64;
    this.el.classList.toggle('narrow', side && sideRoom < 130);
    let area;
    if (side) {
      area = { x: 0, y: 0, w, h: hgt };
    } else {
      const band = hgt < 480 ? 74 : 92;
      area = { x: 0, y: 0, w, h: hgt - band - safeB };
    }
    this.scene.resize(w, hgt, area);
    const wr = this.scene.worldRect();
    const st = this.el.style;
    st.setProperty('--wx', `${wr.x}px`); st.setProperty('--wy', `${wr.y}px`); st.setProperty('--ww', `${wr.w}px`); st.setProperty('--wh', `${wr.h}px`);
    this.el.dataset.layout = side ? 'side' : 'band';
    const H = this.hud;
    if (side) {
      H.colL.append(H.stats, H.hero);
      H.colR.append(H.ctrl, H.skills, H.callWrap);
    } else {
      H.band.append(H.hero, H.skills, H.callWrap);
      H.over.append(H.stats, H.ctrl);
    }
  }

  /* ------------------------------------------------------------------ loop */

  private frame(now: number) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.T += dt;
    const b = this.battle;
    b.step(dt);
    const events = b.drain();
    this.react(events);
    this.scene.consume(b, events, this.host.dmgNumbers);
    this.scene.draw(b, this.view, this.T, b.paused ? 0 : dt);
    this.updateHud(dt);
    this.raf = requestAnimationFrame(t => this.frame(t));
  }

  private react(events: BattleEvent[]) {
    const a = this.host.audio, b = this.battle;
    for (const e of events) {
      switch (e.t) {
        case 'shot': a.play(e.kind === 'bolt' ? 'bolt' : 'boom'); break;
        case 'pulse': a.play('bell'); break;
        case 'arc': a.play('zap'); break;
        case 'root': a.play('root'); break;
        case 'kill': a.play('coin'); break;
        case 'heroHit': a.play('hero'); break;
        case 'leak': a.play('leak'); this.leakBy.set(e.kind, (this.leakBy.get(e.kind) ?? 0) + e.lives); break;
        case 'build': case 'upgrade': a.play('build'); break;
        case 'level': a.play('level'); this.lvlT = 0.9; this.hud.hero.classList.add('lvlup'); if (this.host.autoSkills) b.autoLearn(); break;
        case 'wave': a.play('wave'); this.showBanner(`Wave ${e.n} of ${b.totalWaves}`, e.hint, 2); break;
        case 'adapt': this.showBanner('The Hollow adapts', `It hardens against ${ELEMENT_NAME[e.el] ?? e.el}: ${Math.round(e.resist * 100)}% less damage. Mix your towers.`, 3.4); break;
        case 'shift': this.showBanner(e.on ? e.label : 'The way is open again', e.on ? 'Foes on that road wait at the edge. Others go round.' : '', 2.6); break;
        case 'barrier': this.showBanner('The wreck gives way', 'The beach road is open. Foes will use it now.', 3); break;
        case 'boss': a.play('boss'); this.showBanner(ENEMIES[e.kind].name, ENEMIES[e.kind].blurb, 4, true); break;
        case 'phase': a.play('boss'); this.showBanner(`The Queen breaks: phase ${e.n + 1}`, 'The lava moves. Shades pour out.', 3); break;
        case 'night': this.showBanner(e.on ? 'Night falls' : 'Morning', e.on ? 'Towers outside a Beacon\'s light see less. Shades walk.' : 'Full sight again.', 2.4); break;
        case 'gear': if (b.wave > 1) this.showBanner(e.up === 'a' ? 'Gold gears rise' : 'Iron gears rise', 'Towers on the lowered plots sleep this wave.', 2.4); break;
        case 'sink': this.showBanner('The ground gives way', 'A plot sinks. Any tower on it was refunded in full.', 2.6); break;
        case 'skill': a.play(e.key === 'q' ? 'sweep' : e.key === 'w' ? 'snare' : 'sunrise'); if (e.key === 'r') this.showBanner('Sunrise', 'Every tower fires twice as fast. Nothing hides.', 2); break;
        case 'rune': a.play('rune'); if (!e.picked) this.showBanner(`${RUNES[e.kind].name} rune`, 'Send Wren to pick it up.', 2.2); break;
        case 'heroDown': this.showBanner('Wren falls', `She returns at the gate in ${Math.ceil(b.hero.respawnT)} s.`, 2.4); break;
        case 'revive': this.showBanner('Second dawn', 'Wren stands back up.', 2); break;
        case 'early': this.showBanner('Called early', `+${e.gold} gold`, 1.6); break;
        case 'interest': break;
        case 'won': a.play('win'); this.end(true, e.stars); break;
        case 'lost': a.play('lose'); this.end(false, 0); break;
        default: break;
      }
    }
  }

  /** The card above the call button: what the next wave sends, and whether the Hollow adapts. */
  private updateNextWave() {
    const b = this.battle, el = this.hud.next;
    const nw = b.over ? null : b.nextWave();
    const show = !!nw && (b.status === 'prep' || b.nextIn !== null);
    el.classList.toggle('hidden', !show);
    if (!show || !nw) return;
    const lean = b.adaptLean(), adapts = b.adaptsAt(nw.n);
    const sig = `${nw.n}|${adapts}|${lean}`;
    if (el.dataset.sig === sig) return;
    el.dataset.sig = sig;
    clear(el);
    el.append(h('div', { class: 'nw-head', text: `Next: wave ${nw.n} of ${b.totalWaves}` }));
    el.append(h('div', { class: 'nw-foes' }, ...nw.foes.map(f => {
      const d = ENEMIES[f.kind];
      return h('span', { class: `nw-foe ${d.flying ? 'fly' : ''}`, title: `${d.name}: ${d.blurb}` },
        h('img', { src: foeIcon(f.kind, 28), alt: '' }), h('b', { text: String(f.count) }), d.flying ? icon(WING_ICON, 'svg-ico nw-wing') : null, h('span', { class: 'nw-name', text: d.name }));
    })));
    if (adapts) el.append(h('div', { class: 'nw-note', text: lean ? `The Hollow adapts this wave, against your ${ELEMENT_NAME[lean]}.` : 'The Hollow adapts this wave.' }));
  }

  /**
   * Banners wait their turn instead of replacing each other. `now` cuts in line, for things the
   * player just did (aiming a skill) or must see at once (a boss).
   */
  private showBanner(title: string, sub: string, secs: number, now = false) {
    const item = { title, sub, secs };
    if (now) { this.bannerQ = []; this.putBanner(item); return; }
    if (this.bannerT > 0) {
      this.bannerQ.push(item);
      if (this.bannerQ.length > 3) this.bannerQ.shift();
      return;
    }
    this.putBanner(item);
  }

  private putBanner(b: { title: string; sub: string; secs: number }) {
    setText(this.banner.firstElementChild, b.title);
    setText(this.banner.lastElementChild, b.sub);
    this.banner.classList.toggle('no-sub', !b.sub);
    this.banner.classList.remove('off');
    this.bannerT = b.secs;
  }

  /* ------------------------------------------------------------------ HUD */

  private buildHud(): HTMLElement {
    const stat = (cls: string, label: string) => {
      const v = h('b', { class: 'v' });
      this.hud[cls] = v;
      return h('div', { class: `stat ${cls}`, title: label }, h('i', { class: `ico ${cls}`, 'aria-hidden': 'true' }), v);
    };
    // The stars you would win if the fight ended now: lives are the star count, so they sit together.
    const need = starLives(this.battle.startLives);
    const starsNow = h('span', { class: 'stars-now', 'aria-hidden': 'true' }, h('i', { text: '★' }), h('i', { text: '★' }), h('i', { text: '★' }));
    this.hud.starsNow = starsNow;
    const resist = h('div', { class: 'resist', 'aria-label': 'What the Hollow resists' });
    this.hud.resist = resist;
    const call = h('button', { class: 'btn call', onclick: () => { this.host.audio.unlock(); if (this.battle.callWave()) this.host.audio.play('click'); } },
      h('span', { class: 'call-t' }), h('span', { class: 'call-s' }));
    this.hud.call = call;
    const speed = h('button', { class: 'btn icon speed', title: 'Game speed (F)', onclick: () => this.cycleSpeed() }, '1x');
    this.hud.speed = speed;
    const pause = h('button', { class: 'btn icon pause', title: 'Pause (P)', 'aria-label': 'Pause', onclick: () => this.togglePause() }, icon(PAUSE_ICON));
    this.hud.pause = pause;

    // Hero card.
    const hpBar = h('div', { class: 'bar hp' }, h('i'));
    const xpBar = h('div', { class: 'bar xp' }, h('i'));
    this.hud.hp = hpBar; this.hud.xp = xpBar;
    const lvl = h('div', { class: 'lvl' });
    this.hud.lvl = lvl;
    const pts = h('div', { class: 'pts' });
    this.hud.pts = pts;
    const skills = h('div', { class: 'skills' });
    for (const k of ['q', 'w', 'e', 'r'] as SkillKey[]) {
      const s = SKILLS[k];
      const btn = h('button', {
        class: `skill s-${k}`, title: `${s.name}: ${s.desc}`, 'aria-label': `${s.name} (${k.toUpperCase()})`,
        onclick: (e: Event) => { e.stopPropagation(); this.skillPress(k); },
      }, h('span', { class: 'cd' }), h('span', { class: 'key', text: k.toUpperCase() }), icon(SKILL_ICON[k], 'svg-ico sk-ico'), icon(LOCK_ICON, 'svg-ico sk-lock'),
        h('span', { class: 'name', text: s.name.split(' ').pop()! }), h('span', { class: 'ranks' }), h('span', { class: 'req' }), h('span', { class: 'learn', text: '+' }));
      this.skillBtns.set(k, btn);
      skills.append(btn);
    }
    const items = h('div', { class: 'items' });
    this.hud.items = items;
    const shopBtn = h('button', { class: 'btn shopbtn', onclick: () => this.toggleShop() }, 'Shop');
    this.hud.shopBtn = shopBtn;
    const heroCard = h('div', { class: 'hero-card' },
      h('div', { class: 'hero-top' }, h('div', { class: 'face' }, h('img', { src: heroIcon(40), alt: '' }), lvl), h('div', { class: 'hero-name', text: 'Wren' }), pts),
      hpBar, xpBar, h('div', { class: 'hero-bottom' }, items, shopBtn));

    // The same parts sit in side columns on wide screens and in a bottom band on narrower ones (see fit()).
    const lives = stat('lives', `Lives. Keep ${need.three} for 3 stars, ${need.two} for 2.`);
    lives.append(starsNow);
    this.hud.stats = h('div', { class: 'hud-stats' }, lives, stat('gold', 'Gold'), stat('wave', 'Wave'), resist);
    // Leaving lives in the pause card, so a slip of the thumb next to pause cannot end a run.
    this.hud.ctrl = h('div', { class: 'hud-ctrl' }, speed, pause);
    this.hud.hero = heroCard;
    this.hud.skills = skills;
    const next = h('div', { class: 'next-wave', 'aria-live': 'off' });
    this.hud.next = next;
    this.hud.callWrap = h('div', { class: 'hud-call' }, next, call);
    this.hud.colL = h('div', { class: 'col col-l' });
    this.hud.colR = h('div', { class: 'col col-r' });
    this.hud.band = h('div', { class: 'band' });
    this.hud.over = h('div', { class: 'over' });
    return h('div', { class: 'hud' }, this.hud.colL, this.hud.colR, this.hud.band, this.hud.over);
  }

  private updateHud(dt: number) {
    const b = this.battle, hero = b.hero;
    setText(this.hud.lives, String(b.lives));
    const share = b.lives / b.startLives, held = share >= 0.9 ? 3 : share >= 0.5 ? 2 : 1;
    if (this.hud.starsNow.dataset.n !== String(held)) {
      this.hud.starsNow.dataset.n = String(held);
      [...this.hud.starsNow.children].forEach((s, i) => s.classList.toggle('on', i < held));
    }
    if (this.hintPlot !== null) {
      if (b.towers.length > 0) {
        this.hintPlot = null; this.view.hintPlot = null; this.hintEl.classList.add('hidden');
        this.showBanner('Tap the road to send Wren', 'She fights there and grows stronger with every kill.', 4);
      } else {
        const p = b.plots[this.hintPlot], [sx, sy] = this.scene.toScreen(p.x, p.y);
        const open = this.menuKey !== '';
        this.hintEl.classList.toggle('hidden', open);
        this.hintEl.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy - 24 * this.scene.worldRect().w / MAP_W)}px) translate(-50%, -100%)`;
      }
    }
    setText(this.hud.gold, String(b.gold));
    setText(this.hud.wave, `${Math.max(1, b.wave)}/${b.totalWaves}`);
    // Resistances: one meter per element the Hollow has hardened against, out of its cap.
    const res = Object.entries(b.resist).filter(([k, v]) => v > 0 && k !== 'hero');
    const key = res.map(([k, v]) => k + v.toFixed(1)).join();
    if (this.hud.resist.dataset.k !== key) {
      const was = this.hud.resist.dataset.k;
      this.hud.resist.dataset.k = key;
      clear(this.hud.resist);
      for (const [k, v] of res) {
        this.hud.resist.append(h('span', { class: `rchip el-${k}`, title: `The Hollow takes ${Math.round(v * 100)}% less ${ELEMENT_NAME[k]} damage (most it can reach: ${RESIST_CAP * 100}%)` },
          icon(ELEMENT_ICON[k] ?? ''), h('span', { class: 'rn', text: ELEMENT_TITLE[k] ?? k }),
          h('span', { class: 'meter' }, h('i', { style: `width:${Math.round(v / RESIST_CAP * 100)}%` })),
          h('b', { text: `${Math.round(v * 100)}%` })));
      }
      if (was !== undefined && !this.host.reduceMotion) { this.hud.resist.classList.remove('changed'); void this.hud.resist.offsetWidth; this.hud.resist.classList.add('changed'); }
    }
    this.updateNextWave();
    // Call wave.
    const call = this.hud.call;
    const canCall = b.status === 'prep' || (b.nextIn !== null && b.wave < b.totalWaves);
    call.classList.toggle('hidden', !canCall || b.over);
    if (b.status === 'prep') { setText(call.firstElementChild!, 'Start'); setText(call.lastElementChild!, 'Call the first wave'); }
    else if (b.nextIn !== null) { setText(call.firstElementChild!, `Wave ${b.wave + 1} in ${Math.ceil(b.nextIn)}s`); setText(call.lastElementChild!, `Call now: +${Math.ceil(b.nextIn * 2 * (1 + b.mods.early))} gold`); }
    // Hero.
    const max = b.heroMaxHp();
    (this.hud.hp.firstElementChild as HTMLElement).style.width = `${(hero.hp / max) * 100}%`;
    (this.hud.xp.firstElementChild as HTMLElement).style.width = `${hero.level >= 16 ? 100 : (hero.xp / b.xpNeeded()) * 100}%`;
    setText(this.hud.lvl, String(hero.level));
    setText(this.hud.pts, hero.points > 0 ? `${hero.points} skill point${hero.points > 1 ? 's' : ''}` : hero.dead ? `Back in ${Math.ceil(hero.respawnT)}` : '');
    this.el.classList.toggle('hero-dead', hero.dead);
    for (const [k, btn] of this.skillBtns) {
      const r = hero.ranks[k], s = SKILLS[k];
      const locked = (k === 'w' && !b.mods.skillW) || (k === 'r' && !b.mods.skillR);
      btn.classList.toggle('locked', locked);
      // Say when a skill opens instead of showing a dead button.
      const req = locked ? `Clear stage ${k === 'w' ? 1 : 7}` : r === 0 && hero.level < s.needLevel(1) ? `Level ${s.needLevel(1)}` : '';
      setText(btn.querySelector('.req')!, req);
      btn.classList.toggle('has-req', !!req);
      btn.classList.toggle('none', r === 0);
      btn.classList.toggle('can-learn', b.canLearn(k));
      btn.classList.toggle('ready', b.skillReady(k));
      btn.classList.toggle('aiming', k === 'w' && this.aimingW);
      const cd = r > 0 && k !== 'e' ? hero.cd[k] / s.cd[r - 1] : 0;
      (btn.querySelector('.cd') as HTMLElement).style.height = `${Math.max(0, Math.min(1, cd)) * 100}%`;
      const ranks = btn.querySelector<HTMLElement>('.ranks')!;
      if (ranks.dataset.r !== `${r}`) { ranks.dataset.r = `${r}`; clear(ranks); for (let i = 0; i < s.maxRank; i++) ranks.append(h('i', { class: i < r ? 'on' : '' })); }
    }
    // Items.
    const ik = hero.items.join();
    if (this.hud.items.dataset.k !== ik) {
      this.hud.items.dataset.k = ik;
      clear(this.hud.items);
      for (let i = 0; i < ITEM_SLOTS; i++) {
        const id = hero.items[i];
        this.hud.items.append(h('span', { class: `slot ${id ? 'full' : ''}`, title: id ? `${ITEMS[id].name}: ${ITEMS[id].desc}` : 'Empty slot', text: id ? ITEMS[id].name.split(' ').map(w => w[0]).join('') : '' }));
      }
    }
    const near = b.nearGate();
    this.hud.shopBtn.classList.toggle('near', near);
    this.hud.shopBtn.title = near ? 'Open the shop (B)' : 'Walk Wren to the gate to buy';
    if (this.shopOpen) this.renderShop();
    // Banner, then the next in line.
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) { const next = this.bannerQ.shift(); if (next) this.putBanner(next); else this.banner.classList.add('off'); }
    }
    if (this.lvlT > 0) { this.lvlT -= dt; if (this.lvlT <= 0) this.hud.hero.classList.remove('lvlup'); }
    // Keep an open menu current (gold changes what you can afford).
    if (!this.menu.classList.contains('hidden')) this.refreshMenu();
  }

  /* ------------------------------------------------------------------ input */

  private bindInput() {
    let down: { x: number; y: number; id: number } | null = null;
    this.canvas.addEventListener('pointerdown', e => { this.host.audio.unlock(); down = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
    this.canvas.addEventListener('pointermove', e => {
      if (!this.aimingW) return;
      const r = this.canvas.getBoundingClientRect();
      this.view.aimW = this.scene.toWorld(e.clientX - r.left, e.clientY - r.top);
    });
    this.canvas.addEventListener('pointerup', e => {
      if (!down || down.id !== e.pointerId) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 18) return;
      const r = this.canvas.getBoundingClientRect();
      this.tap(...this.scene.toWorld(e.clientX - r.left, e.clientY - r.top));
    });
    this.canvas.addEventListener('contextmenu', e => {
      e.preventDefault();
      const r = this.canvas.getBoundingClientRect();
      const [x, y] = this.scene.toWorld(e.clientX - r.left, e.clientY - r.top);
      this.battle.moveHero(x, y); this.scene.markMove(x, y); this.closeMenu();
    });
  }

  private tap(x: number, y: number) {
    const b = this.battle;
    if (this.aimingW) { b.castW(x, y); this.aimingW = false; this.view.aimW = null; return; }
    this.closeShop();
    const t = b.towers.find(t => Math.abs(t.x - x) < 34 && y > t.y - 110 && y < t.y + 22);
    if (t) { this.openTower(t); return; }
    const pi = b.plots.findIndex(p => !p.sunk && ell(p.x - x, p.y - y) < 44 && !b.towers.some(t => t.plot === b.plots.indexOf(p)));
    if (pi >= 0) { this.openPlot(pi); return; }
    if (this.menuKey) { this.closeMenu(); return; }
    const foe = b.foes.find(f => !f.dead && Math.hypot(f.x - x, f.y - f.def.bar * 0.4 - y) < 26 + f.def.size * 8);
    if (foe && !b.hero.dead) { b.attackFoe(foe.id); this.scene.markMove(foe.x, foe.y); return; }
    if (!b.hero.dead) { b.moveHero(x, y); this.scene.markMove(x, y); }
  }

  private key(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return;
    const k = e.key.toLowerCase();
    if (this.exitVeil) { if (k === 'escape') this.closeExit(); return; }
    if (k === 'q' || k === 'w' || k === 'e' || k === 'r') { this.skillPress(k); e.preventDefault(); }
    else if (k === ' ') { this.battle.callWave(); e.preventDefault(); }
    else if (k === 'f') this.cycleSpeed();
    else if (k === 'p') this.togglePause();
    else if (k === 'b') this.toggleShop();
    else if (k === 'escape') { this.aimingW = false; this.view.aimW = null; this.closeMenu(); this.closeShop(); }
    else if (/^[1-6]$/.test(k) && this.view.selPlot !== null) {
      const kind = this.battle.stage.towers[Number(k) - 1];
      if (kind && this.battle.build(this.view.selPlot, kind)) this.closeMenu();
    }
  }

  /** A skill button: learn it if there is a point to spend and it is not ready, else cast. */
  private skillPress(k: SkillKey) {
    const b = this.battle;
    this.host.audio.unlock();
    if (b.canLearn(k) && (b.hero.ranks[k] === 0 || !b.skillReady(k))) { b.learn(k); this.host.audio.play('click'); return; }
    if (k === 'q') b.castQ();
    else if (k === 'r') b.castR();
    else if (k === 'w' && b.skillReady('w')) {
      this.aimingW = !this.aimingW;
      this.view.aimW = this.aimingW ? [b.hero.x + SNARE.range * 0.5 * b.hero.face, b.hero.y] : null;
      if (this.aimingW) this.showBanner('Lantern Snare', 'Tap where to throw it.', 1.6, true);
    } else if (b.canLearn(k)) b.learn(k);
  }

  private cycleSpeed() {
    const b = this.battle;
    b.speed = b.speed === 1 ? 2 : b.speed === 2 ? 3 : 1;
    setText(this.hud.speed, `${b.speed}x`);
  }

  private pauseCard: HTMLElement | null = null;

  /** Pause shows a small card over the map: resume, or leave the battle. The map stays in view. */
  private togglePause() {
    const b = this.battle;
    b.paused = !b.paused;
    clear(this.hud.pause); this.hud.pause.append(icon(b.paused ? PLAY_ICON : PAUSE_ICON));
    this.hud.pause.setAttribute('aria-label', b.paused ? 'Resume' : 'Pause');
    this.el.classList.toggle('paused', b.paused);
    this.pauseCard?.remove(); this.pauseCard = null;
    if (b.paused && !this.exitVeil && !this.ended) {
      this.pauseCard = h('div', { class: 'pause-card', role: 'dialog', 'aria-label': 'Paused' },
        h('div', { class: 'banner-title', text: 'Paused' }),
        h('div', { class: 'act-row' },
          h('button', { class: 'btn primary', onclick: () => this.togglePause() }, 'Resume'),
          h('button', { class: 'btn leave', onclick: () => this.confirmExit() }, icon(LEAVE_ICON), 'Leave battle')));
      this.el.append(this.pauseCard);
    }
  }

  /* ------------------------------------------------------------------ build and tower menus */

  private placeMenu(x: number, y: number) {
    const [sx, sy] = this.scene.toScreen(x, y);
    const r = this.el.getBoundingClientRect();
    const m = this.menu;
    m.classList.remove('hidden');
    const w = m.offsetWidth, hgt = m.offsetHeight;
    let left = sx - w / 2, top = sy - hgt - 70;
    if (top < 8) top = sy + 30;
    left = Math.max(8, Math.min(r.width - w - 8, left));
    top = Math.max(8, Math.min(r.height - hgt - 8, top));
    m.style.left = `${left}px`; m.style.top = `${top}px`;
  }

  private openPlot(i: number) {
    this.view.selPlot = i; this.view.selTower = null; this.view.preview = null;
    this.menuKey = `p${i}`;
    this.refreshMenu(true);
  }

  private openTower(t: Tower) {
    this.view.selTower = t.id; this.view.selPlot = null; this.view.preview = null;
    this.menuKey = `t${t.id}`;
    this.refreshMenu(true);
  }

  /** Show a tower's range ring and what it does, before you pay for it. */
  private previewTower(k: TowerKind) {
    this.view.preview = k;
    const d = TOWERS[k];
    const note = this.menu.querySelector('.note-preview');
    note?.classList.remove('hidden');
    setText(note, `${d.name}: ${d.blurb}${d.hitsFlying ? '' : ' Cannot hit fliers.'}`);
  }

  private closeMenu() {
    this.menu.classList.add('hidden');
    this.view.selPlot = null; this.view.selTower = null; this.view.preview = null;
    this.menuKey = '';
  }

  private refreshMenu(place = false) {
    const b = this.battle, m = this.menu;
    // Rebuild only when the menu's shape changes; gold only toggles the 'poor' look in place,
    // so a button is never swapped out under a finger mid-tap.
    const sel = this.view.selTower !== null ? b.tower(this.view.selTower) : undefined;
    const sig = `${this.menuKey}|${sel ? sel.lv + (sel.split ?? '') + sel.mode + sel.round + sel.down : ''}|${b.mods.splits}`;
    if (!place && m.dataset.sig === sig) {
      m.querySelectorAll<HTMLElement>('[data-cost]').forEach(el => el.classList.toggle('poor', b.gold < Number(el.dataset.cost)));
      return;
    }
    m.dataset.sig = sig;
    clear(m);
    if (this.view.selPlot !== null) {
      const pi = this.view.selPlot, p = b.plots[pi];
      m.append(h('div', { class: 'popup-title', text: p.high ? 'Build on high ground (+20% range)' : p.gear ? `Build on a ${p.gear === 'a' ? 'gold' : 'iron'} gear plot` : 'Build a tower' }));
      const row = h('div', { class: 'build-row' });
      b.stage.towers.forEach((k: TowerKind, idx: number) => {
        const def = TOWERS[k], cost = b.costOf(k), ok = b.canBuild(pi, k);
        const btn = h('button', {
          class: `build ${ok ? '' : 'poor'}`, title: `${def.name}: ${def.blurb}`, 'data-cost': cost,
          onpointerenter: () => this.previewTower(k),
          onclick: () => { if (b.build(pi, k)) this.closeMenu(); else this.previewTower(k); },
        }, h('img', { src: towerIcon(k), alt: '' }), h('span', { class: 'bn', text: def.name }), h('span', { class: 'br', text: TOWER_ROLE[k] }), h('span', { class: 'bc', text: `${cost}` }), h('span', { class: 'hot', text: String(idx + 1) }));
        row.append(btn);
      });
      m.append(row);
      m.append(h('div', { class: 'popup-note note-preview hidden' }));
      if (place) this.placeMenu(p.x, p.y);
      return;
    }
    const t = this.view.selTower !== null ? b.tower(this.view.selTower) : undefined;
    if (!t) { this.closeMenu(); return; }
    const def = TOWERS[t.kind], s = b.stats(t);
    const title = t.split ? def.splits.find(x => x.id === t.split)!.name : `${def.name}, level ${t.lv}`;
    m.append(h('div', { class: 'popup-title', text: title }));
    const facts = t.kind === 'beacon' ? `Range ${Math.round(s.range)}. Lights hidden foes and boosts towers in its light.`
      : t.kind === 'bell' ? `Slows all foes in range. Range ${Math.round(s.range)}.`
      : `Damage ${Math.round(s.dmg)}, ${(1 / s.rate).toFixed(1)} hits a second, range ${Math.round(s.range)}.`;
    m.append(h('div', { class: 'popup-note', text: t.down ? 'This gear plot is lowered: the tower sleeps this wave.' : facts }));
    const el = def.element, rs = b.resist[el] ?? 0;
    if (rs > 0) m.append(h('div', { class: 'popup-warn' }, icon(ELEMENT_ICON[el] ?? ''), h('span', { text: `The Hollow takes ${Math.round(rs * 100)}% less ${ELEMENT_NAME[el]} damage right now. Mix in other towers.` })));
    const acts = h('div', { class: 'act-row' });
    const up = b.upgradeCost(t);
    if (up !== null) {
      // Say what the gold buys: the next level's numbers beside today's.
      const n = b.stats({ ...t, lv: t.lv + 1 });
      const gain = t.kind === 'beacon' || t.kind === 'bell' ? `Range ${Math.round(s.range)} to ${Math.round(n.range)}` : `Damage ${Math.round(s.dmg)} to ${Math.round(n.dmg)}, range ${Math.round(s.range)} to ${Math.round(n.range)}`;
      acts.append(h('button', { class: `btn act primary upgrade ${b.gold >= up ? '' : 'poor'}`, 'data-cost': up, onclick: () => b.upgrade(t.id) },
        h('span', { class: 'up-t' }, `Level ${t.lv + 1}`, coin(up)), h('small', { text: gain })));
    }
    if (t.lv === 3 && b.mods.splits && t.kind !== 'beacon' || (t.lv === 3 && t.kind === 'beacon' && b.mods.splits)) {
      for (const sp of def.splits) {
        const c = b.splitCost(t.kind, sp.id);
        acts.append(h('button', { class: `btn act split ${b.gold >= c ? '' : 'poor'}`, 'data-cost': c, title: sp.desc, onclick: () => b.splitTower(t.id, sp.id) }, h('b', { text: sp.name }), h('small', { text: `${sp.desc} ${c}` })));
      }
    } else if (t.lv === 3 && !b.mods.splits) acts.append(h('div', { class: 'popup-note', text: 'Level 4 splits open after Storm Shelf.' }));
    m.append(acts);
    if (t.kind !== 'beacon' && t.kind !== 'bell') {
      const modes = h('div', { class: 'seg', role: 'group', 'aria-label': 'Target' });
      for (const md of ['first', 'strong', 'close'] as TargetMode[]) modes.append(h('button', { class: t.mode === md ? 'on' : '', onclick: () => b.setMode(t.id, md) }, MODE_NAME[md]));
      m.append(h('div', { class: 'popup-sub', text: 'Target' }), modes);
      if (b.mods.rounds.length) {
        const rounds = h('div', { class: 'seg', role: 'group', 'aria-label': 'Rounds' });
        rounds.append(h('button', { class: t.round === null ? 'on' : '', onclick: () => b.setRound(t.id, null) }, 'Plain'));
        for (const r of b.mods.rounds) rounds.append(h('button', { class: t.round === r ? 'on' : '', onclick: () => b.setRound(t.id, r) }, ROUND_NAME[r]));
        m.append(h('div', { class: 'popup-sub', text: 'Rounds' }), rounds);
      }
    }
    // Selling is rare and costs gold: a quiet line at the foot of the card, away from Upgrade.
    m.append(h('button', { class: 'sell-link', onclick: () => { b.sell(t.id); this.closeMenu(); } }, 'Sell for ', coin(b.sellValue(t))));
    if (place) this.placeMenu(t.x, t.y - 90);
  }

  /* ------------------------------------------------------------------ shop */

  private toggleShop() { if (this.shopOpen) this.closeShop(); else { this.shopOpen = true; this.shopEl.classList.remove('hidden'); this.shopEl.dataset.sig = ''; this.renderShop(); } }
  private closeShop() { this.shopOpen = false; this.shopEl.classList.add('hidden'); }

  private renderShop() {
    const b = this.battle, el = this.shopEl, near = b.nearGate();
    const sig = `${b.gold}|${b.hero.items.join()}|${near}`;
    if (el.dataset.sig === sig) return;
    el.dataset.sig = sig;
    clear(el);
    el.append(h('div', { class: 'shop-head' }, h('b', { text: 'The gate shop' }), h('button', { class: 'btn icon', onclick: () => this.closeShop(), 'aria-label': 'Close' }, '✕')));
    if (near) el.append(h('p', { class: 'popup-note', text: `Wren is at the gate. ${b.hero.items.length} of ${ITEM_SLOTS} slots used. Gold spent here is gold not spent on towers.` }));
    else el.append(h('div', { class: 'shop-far' },
      h('p', { class: 'popup-note', text: 'Wren buys at the gate.' }),
      h('button', { class: 'btn primary act', onclick: () => { const g = b.gate[0]; b.moveHero(g[0] - 60, g[1]); this.scene.markMove(g[0] - 60, g[1]); } }, b.hero.dead ? 'Wren is down' : 'Send Wren to the gate')));
    const list = h('div', { class: 'shop-list' });
    for (const id of ITEM_ORDER) {
      const it = ITEMS[id];
      if (b.mods.shopAfter < it.after) continue;
      const owned = b.hero.items.includes(id);
      list.append(h('div', { class: `item ${owned ? 'owned' : ''}` },
        h('div', {}, h('b', { text: it.name }), h('small', { text: it.desc })),
        owned
          ? h('button', { class: `btn act ${near ? '' : 'poor'}`, onclick: () => b.sellItem(id) }, 'Sell ', coin(Math.floor(it.cost / 2)))
          : h('button', { class: `btn act buy ${b.canBuy(id) ? '' : 'poor'} ${b.gold < it.cost ? 'short' : ''}`, disabled: !near, onclick: () => b.buy(id) }, coin(it.cost))));
    }
    el.append(list);
  }

  /* ------------------------------------------------------------------ end */

  /** Leave, asking first if a fight is under way. */
  requestExit() { this.confirmExit(); }

  private exitVeil: HTMLElement | null = null;

  /** An in-game card rather than a browser dialog, so it matches the game and works inside the native shells. */
  private confirmExit() {
    if (this.ended || this.battle.status === 'prep') { this.host.onExit(); return; }
    if (this.exitVeil) { this.closeExit(); return; }
    const wasPaused = this.battle.paused;
    if (!wasPaused) this.togglePause();
    this.pauseCard?.remove(); this.pauseCard = null;
    const stay = h('button', { class: 'btn primary', onclick: () => this.closeExit() }, 'Keep fighting');
    const card = h('div', { class: 'result', role: 'dialog', 'aria-label': 'Leave this battle?' },
      h('h2', { text: 'Leave this battle?' }),
      h('p', { text: 'You lose your progress in this stage. Stars you already hold stay.' }),
      h('div', { class: 'act-row' }, stay, h('button', { class: 'btn', onclick: () => this.host.onExit() }, 'Leave')));
    this.exitVeil = h('div', { class: 'veil', onclick: (e: Event) => { if (e.target === this.exitVeil) this.closeExit(); } }, card);
    this.exitVeil.dataset.resume = wasPaused ? '' : '1';
    this.el.append(this.exitVeil);
    stay.focus();
  }

  private closeExit() {
    if (!this.exitVeil) return;
    const resume = this.exitVeil.dataset.resume === '1';
    this.exitVeil.remove();
    this.exitVeil = null;
    if (resume && this.battle.paused) this.togglePause();
    else if (this.battle.paused) { this.togglePause(); this.togglePause(); }
  }

  private end(won: boolean, stars: number) {
    if (this.ended) return;
    this.ended = true;
    const st = this.battle.stage;
    const gained = won ? this.host.onResult(st.id, stars) : 0;
    const b = this.battle, need = starLives(b.startLives);
    // Say what the next star takes, and on a loss, which foe got through most.
    const lost = b.startLives - b.lives;
    const toThree = won && stars < 3 ? `Lose ${b.startLives - need.three} lives or fewer for 3 stars. You lost ${lost}.` : '';
    const worst = [...this.leakBy.entries()].sort((x, y) => y[1] - x[1])[0];
    const why = !won && worst ? ENEMIES[worst[0] as keyof typeof ENEMIES] : null;
    const card = h('div', { class: `result ${won ? 'won' : 'lost'}`, role: 'dialog', 'aria-label': won ? 'Victory' : 'Defeat' },
      h('h2', { text: won ? 'The Keep holds' : 'The gate falls' }),
      won ? h('div', { class: 'stars reveal', 'aria-label': `${stars} of 3 stars` }, ...[1, 2, 3].map(i => h('span', { class: i <= stars ? 'on' : '', style: `--i:${i}`, text: '★' }))) : null,
      h('p', { text: won ? `${st.name} cleared with ${b.lives} lives left. Wren reached level ${b.hero.level}.` : `You held until wave ${b.wave} of ${b.totalWaves}.` }),
      toThree ? h('p', { class: 'next-star', text: toThree }) : null,
      why && worst ? h('div', { class: 'cause' },
        h('img', { src: foeIcon(worst[0] as keyof typeof ENEMIES, 56), alt: '' }),
        h('div', {}, h('b', { text: `${why.name}${worst[1] > 1 && !why.traits?.boss ? 's' : ''} took ${worst[1]} of your ${b.startLives} lives` }), h('span', { text: why.blurb }))) : null,
      won && gained > 0 ? h('p', { class: 'embers', text: `+${gained} Embers for the skill trees` }) : null,
      h('div', { class: 'act-row' },
        h('button', { class: `btn ${won ? '' : 'primary'}`, onclick: () => this.host.onRetry(st.id) }, won ? 'Play again' : 'Try again'),
        won && st.id < 20 ? h('button', { class: 'btn primary', onclick: () => this.host.onNext(st.id + 1) }, 'Next stage') : null,
        h('button', { class: 'btn', onclick: () => this.host.onExit() }, 'Map')));
    this.el.append(h('div', { class: 'veil' }, card));
  }
}

/** Notch and home-bar insets in px, read through a probe since env() is not readable directly. */
function safeInsets() {
  const p = document.createElement('div');
  p.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.append(p);
  const cs = getComputedStyle(p);
  const out = { l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0 };
  p.remove();
  return out;
}

export { TOWER_ORDER };
