/** The battle screen: canvas, HUD, build menus, hero controls and the result card. */
import { Battle, ell, type BattleEvent, type TargetMode, type Tower } from '../game/sim';
import { Scene, type View } from '../render/scene';
import { stageById } from '../game/data/stages';
import { TOWERS, TOWER_ORDER, type Rounds, type TowerKind } from '../game/data/towers';
import { ENEMIES } from '../game/data/enemies';
import { SKILLS, SNARE, type SkillKey } from '../game/data/hero';
import { ITEMS, ITEM_ORDER, ITEM_SLOTS, RUNES } from '../game/data/shop';
import type { Mods } from '../game/mods';
import type { Audio } from '../audio/sfx';
import { h, clear, setText } from './dom';
import { towerIcon } from './icons';

export interface BattleHost {
  audio: Audio;
  mods: Mods;
  reduceMotion: boolean;
  autoSkills: boolean;
  onExit(): void;
  onResult(stageId: number, stars: number): number;
  onNext(stageId: number): void;
  onRetry(stageId: number): void;
}

const ELEMENT_NAME: Record<string, string> = { pierce: 'bolts', fire: 'fire', frost: 'frost', storm: 'lightning', nature: 'roots' };
const MODE_NAME: Record<TargetMode, string> = { first: 'First', strong: 'Strongest', close: 'Closest' };
const ROUND_NAME: Record<Rounds, string> = { ember: 'Ember', frost: 'Frost', storm: 'Storm' };

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
  private hud: Record<string, HTMLElement> = {};
  private skillBtns = new Map<SkillKey, HTMLButtonElement>();
  private shopOpen = false;
  private shopEl: HTMLElement;
  private ended = false;
  private menuKey = '';
  private readonly onResize = () => this.fit();
  private readonly onKey = (e: KeyboardEvent) => this.key(e);

  constructor(private readonly host: BattleHost, stageId: number) {
    const st = stageById(stageId);
    this.battle = new Battle(st, { mods: host.mods, seed: Date.now() & 0xffff });
    this.view = { selPlot: null, selTower: null, preview: null, aimW: null, reduceMotion: host.reduceMotion };
    this.canvas = h('canvas', { class: 'stage-canvas', 'aria-label': `Battle map: ${st.name}` });
    this.scene = new Scene(this.canvas);
    this.menu = h('div', { class: 'popup hidden', role: 'dialog' });
    this.banner = h('div', { class: 'banner off', 'aria-live': 'polite' }, h('div', { class: 'banner-title' }), h('div', { class: 'banner-sub' }));
    this.shopEl = h('div', { class: 'shop hidden', role: 'dialog', 'aria-label': 'Shop' });
    this.el = h('section', { class: 'screen battle' }, this.canvas, this.buildHud(), this.banner, this.menu, this.shopEl);
  }

  /** Paint the map (slow), then start the loop. */
  start() {
    this.fit();
    this.scene.load(this.battle);
    this.bindInput();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKey);
    const st = this.battle.stage;
    this.showBanner(st.name, st.twist, 5);
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
    this.scene.consume(b, events);
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
        case 'leak': a.play('leak'); break;
        case 'build': case 'upgrade': a.play('build'); break;
        case 'level': a.play('level'); if (this.host.autoSkills) b.autoLearn(); break;
        case 'wave': a.play('wave'); this.showBanner(`Wave ${e.n} of ${b.totalWaves}`, e.hint, 2.6); break;
        case 'adapt': this.showBanner('The Hollow adapts', `It hardens against ${ELEMENT_NAME[e.el] ?? e.el}: ${Math.round(e.resist * 100)}% less damage. Mix your towers.`, 3.4); break;
        case 'shift': this.showBanner(e.on ? e.label : 'The way is open again', e.on ? 'Foes on that road wait at the edge. Others go round.' : '', 2.6); break;
        case 'barrier': this.showBanner('The wreck gives way', 'The beach road is open. Foes will use it now.', 3); break;
        case 'boss': a.play('boss'); this.showBanner(ENEMIES[e.kind].name, ENEMIES[e.kind].blurb, 4); break;
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

  private showBanner(title: string, sub: string, secs: number) {
    setText(this.banner.firstElementChild, title);
    setText(this.banner.lastElementChild, sub);
    this.banner.classList.remove('off');
    this.bannerT = secs;
  }

  /* ------------------------------------------------------------------ HUD */

  private buildHud(): HTMLElement {
    const b = this.battle, st = b.stage;
    const stat = (cls: string, label: string) => {
      const v = h('b', { class: 'v' });
      this.hud[cls] = v;
      return h('div', { class: `stat ${cls}`, title: label }, h('i', { class: `ico ${cls}`, 'aria-hidden': 'true' }), v);
    };
    const resist = h('div', { class: 'resist', 'aria-label': 'What the Hollow resists' });
    this.hud.resist = resist;
    const call = h('button', { class: 'btn call', onclick: () => { this.host.audio.unlock(); if (this.battle.callWave()) this.host.audio.play('click'); } },
      h('span', { class: 'call-t' }), h('span', { class: 'call-s' }));
    this.hud.call = call;
    const speed = h('button', { class: 'btn icon speed', title: 'Game speed (F)', onclick: () => this.cycleSpeed() }, '1x');
    this.hud.speed = speed;
    const pause = h('button', { class: 'btn icon', title: 'Pause (P)', onclick: () => this.togglePause() }, 'II');
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
      }, h('span', { class: 'key', text: k.toUpperCase() }), h('span', { class: 'name', text: s.name }), h('span', { class: 'cd' }), h('span', { class: 'ranks' }), h('span', { class: 'learn', text: '+' }));
      this.skillBtns.set(k, btn);
      skills.append(btn);
    }
    const items = h('div', { class: 'items' });
    this.hud.items = items;
    const shopBtn = h('button', { class: 'btn shopbtn', onclick: () => this.toggleShop() }, 'Shop');
    this.hud.shopBtn = shopBtn;
    const heroCard = h('div', { class: 'hero-card' },
      h('div', { class: 'hero-top' }, lvl, h('div', { class: 'hero-name', text: 'Wren' }), pts),
      hpBar, xpBar, h('div', { class: 'hero-bottom' }, items, shopBtn));

    // The same parts sit in side columns on wide screens and in a bottom band on narrower ones (see fit()).
    this.hud.stats = h('div', { class: 'hud-stats' }, stat('lives', 'Lives'), stat('gold', 'Gold'), stat('wave', 'Wave'), resist);
    this.hud.ctrl = h('div', { class: 'hud-ctrl' }, speed, pause, h('button', { class: 'btn icon', title: 'Leave the battle', 'aria-label': 'Leave the battle', onclick: () => this.confirmExit() }, '✕'));
    this.hud.hero = heroCard;
    this.hud.skills = skills;
    this.hud.callWrap = h('div', { class: 'hud-call' }, call);
    this.hud.colL = h('div', { class: 'col col-l' });
    this.hud.colR = h('div', { class: 'col col-r' });
    this.hud.band = h('div', { class: 'band' });
    this.hud.over = h('div', { class: 'over' });
    return h('div', { class: 'hud' }, this.hud.colL, this.hud.colR, this.hud.band, this.hud.over,
      h('div', { class: 'stage-name', text: `${st.id}. ${st.name}` }));
  }

  private updateHud(dt: number) {
    const b = this.battle, hero = b.hero;
    setText(this.hud.lives, String(b.lives));
    setText(this.hud.gold, String(b.gold));
    setText(this.hud.wave, `${Math.max(1, b.wave)}/${b.totalWaves}`);
    // Resistances.
    const res = Object.entries(b.resist).filter(([, v]) => v > 0);
    const key = res.map(([k, v]) => k + v.toFixed(1)).join();
    if (this.hud.resist.dataset.k !== key) {
      this.hud.resist.dataset.k = key;
      clear(this.hud.resist);
      for (const [k, v] of res) this.hud.resist.append(h('span', { class: `chip el-${k}`, title: `The Hollow takes ${Math.round(v * 100)}% less ${ELEMENT_NAME[k]} damage`, text: `${ELEMENT_NAME[k]} -${Math.round(v * 100)}%` }));
    }
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
      btn.classList.toggle('none', r === 0);
      btn.classList.toggle('can-learn', b.canLearn(k));
      btn.classList.toggle('ready', b.skillReady(k));
      btn.classList.toggle('aiming', k === 'w' && this.aimingW);
      const cd = r > 0 && k !== 'e' ? hero.cd[k] / s.cd[r - 1] : 0;
      (btn.querySelector('.cd') as HTMLElement).style.height = `${Math.max(0, Math.min(1, cd)) * 100}%`;
      setText(btn.querySelector('.ranks')!, '◆'.repeat(r) + '◇'.repeat(s.maxRank - r));
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
    setText(this.hud.shopBtn, near ? 'Shop' : 'Shop (at gate)');
    if (this.shopOpen) this.renderShop();
    // Banner.
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.banner.classList.add('off'); }
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
      if (this.aimingW) this.showBanner('Lantern Snare', 'Tap where to throw it.', 1.6);
    } else if (b.canLearn(k)) b.learn(k);
  }

  private cycleSpeed() {
    const b = this.battle;
    b.speed = b.speed === 1 ? 2 : b.speed === 2 ? 3 : 1;
    setText(this.hud.speed, `${b.speed}x`);
  }

  private togglePause() {
    this.battle.paused = !this.battle.paused;
    setText(this.hud.pause, this.battle.paused ? '▶' : 'II');
    this.el.classList.toggle('paused', this.battle.paused);
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
    setText(this.menu.querySelector('.note-preview'), `${d.name}: ${d.blurb}${d.hitsFlying ? '' : ' Cannot hit fliers.'}`);
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
        }, h('img', { src: towerIcon(k), alt: '' }), h('span', { class: 'bn', text: def.name }), h('span', { class: 'bc', text: `${cost}` }), h('span', { class: 'hot', text: String(idx + 1) }));
        row.append(btn);
      });
      m.append(row);
      m.append(h('div', { class: 'popup-note note-preview', text: 'Tap a tower to build it.' }));
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
    const acts = h('div', { class: 'act-row' });
    const up = b.upgradeCost(t);
    if (up !== null) acts.append(h('button', { class: `btn act ${b.gold >= up ? '' : 'poor'}`, 'data-cost': up, onclick: () => b.upgrade(t.id) }, `Upgrade ${up}`));
    if (t.lv === 3 && b.mods.splits && t.kind !== 'beacon' || (t.lv === 3 && t.kind === 'beacon' && b.mods.splits)) {
      for (const sp of def.splits) {
        const c = b.splitCost(t.kind, sp.id);
        acts.append(h('button', { class: `btn act split ${b.gold >= c ? '' : 'poor'}`, 'data-cost': c, title: sp.desc, onclick: () => b.splitTower(t.id, sp.id) }, h('b', { text: sp.name }), h('small', { text: `${sp.desc} ${c}` })));
      }
    } else if (t.lv === 3 && !b.mods.splits) acts.append(h('div', { class: 'popup-note', text: 'Level 4 splits open after Storm Shelf.' }));
    acts.append(h('button', { class: 'btn act sell', onclick: () => { b.sell(t.id); this.closeMenu(); } }, `Sell ${b.sellValue(t)}`));
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
    el.append(h('p', { class: 'popup-note', text: near ? `Wren is at the gate. ${b.hero.items.length}/${ITEM_SLOTS} slots used.` : 'Walk Wren to the gate to buy or sell. Gold spent here is gold not spent on towers.' }));
    const list = h('div', { class: 'shop-list' });
    for (const id of ITEM_ORDER) {
      const it = ITEMS[id];
      if (b.mods.shopAfter < it.after) continue;
      const owned = b.hero.items.includes(id);
      list.append(h('div', { class: `item ${owned ? 'owned' : ''}` },
        h('div', {}, h('b', { text: it.name }), h('small', { text: it.desc })),
        owned
          ? h('button', { class: `btn act ${near ? '' : 'poor'}`, onclick: () => b.sellItem(id) }, `Sell ${Math.floor(it.cost / 2)}`)
          : h('button', { class: `btn act ${b.canBuy(id) ? '' : 'poor'}`, onclick: () => b.buy(id) }, `${it.cost}`)));
    }
    el.append(list);
  }

  /* ------------------------------------------------------------------ end */

  /** Leave, asking first if a fight is under way. */
  requestExit() { this.confirmExit(); }

  private confirmExit() {
    if (this.ended || this.battle.status === 'prep' || window.confirm('Leave this battle? Progress in it is lost.')) this.host.onExit();
  }

  private end(won: boolean, stars: number) {
    if (this.ended) return;
    this.ended = true;
    const st = this.battle.stage;
    const gained = won ? this.host.onResult(st.id, stars) : 0;
    const card = h('div', { class: `result ${won ? 'won' : 'lost'}`, role: 'dialog', 'aria-label': won ? 'Victory' : 'Defeat' },
      h('h2', { text: won ? 'The Keep holds' : 'The gate falls' }),
      h('div', { class: 'stars', 'aria-label': `${stars} of 3 stars` }, ...[1, 2, 3].map(i => h('span', { class: i <= stars ? 'on' : '', text: '★' }))),
      h('p', { text: won ? `${st.name} cleared with ${this.battle.lives} lives left. Wren reached level ${this.battle.hero.level}.` : `Wave ${this.battle.wave} of ${this.battle.totalWaves}. Try other towers, or send Wren to the weak side.` }),
      won && gained > 0 ? h('p', { class: 'embers', text: `+${gained} Embers for the skill trees` }) : null,
      h('div', { class: 'act-row' },
        h('button', { class: 'btn', onclick: () => this.host.onRetry(st.id) }, 'Play again'),
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
