/** Screens and flow: title, campaign map, skill trees, settings, and the battle. */
import { STAGES, REGIONS, stageById } from '../game/data/stages';
import { TREES, NODES } from '../game/data/trees';
import { ENEMIES } from '../game/data/enemies';
import { TOWERS } from '../game/data/towers';
import {
  browserStore, loadSave, writeSave, cleared, isUnlocked, embers, canBuyNode, buyNode, resetTrees, recordResult, modsFor, totalStars, freshSave,
  type Save, type Store,
} from '../game/save';
import { Audio } from '../audio/sfx';
import { h, clear, icon } from './dom';
import { towerIcon, LOCK_ICON } from './icons';
import { BattleScreen } from './battle';
import { Battle, starLives } from '../game/sim';
import { Scene, W as MAP_W, H as MAP_H } from '../render/scene';

export class App {
  private readonly store: Store = browserStore();
  private save: Save;
  readonly audio = new Audio();
  private battle: BattleScreen | null = null;
  private treeTab = 0;

  constructor(private readonly root: HTMLElement) {
    this.save = loadSave(this.store);
    this.audio.enabled = this.save.settings.sound;
    document.documentElement.classList.toggle('reduce-motion', this.save.settings.reduceMotion);
    root.addEventListener('pointerdown', () => this.audio.unlock(), { once: true });
  }

  private persist() { writeSave(this.store, this.save); }

  /** Where the Android back button goes. Returns false on the title screen, so the app can close. */
  private screen: 'title' | 'campaign' | 'trees' | 'settings' | 'battle' = 'title';
  back(): boolean {
    switch (this.screen) {
      case 'battle': this.battle?.requestExit(); return true;
      case 'campaign': case 'settings': this.title(); return true;
      case 'trees': this.campaign(); return true;
      default: return false;
    }
  }

  private mount(el: HTMLElement) {
    if (this.battle) { this.battle.destroy(); this.battle = null; }
    clear(this.root);
    this.root.append(el);
  }

  /* ------------------------------------------------------------------ title */

  title() {
    this.screen = 'title';
    const c = cleared(this.save), next = Math.min(20, c + 1);
    const map = h('canvas', { class: 'title-map', 'aria-hidden': 'true' });
    const el = h('section', { class: 'screen title' }, map,
      h('div', { class: 'title-inner' },
        h('div', { class: 'title-panel' },
          h('h1', { class: 'logo', text: 'TowerRiot' }),
          h('p', { class: 'tag', text: 'Hold the Lantern Keep. Build towers, raise Wren from level 1 to 16 in every fight, and outthink a Hollow that learns.' }),
          h('div', { class: 'title-btns' },
            h('button', { class: 'btn primary big', onclick: () => this.campaign() }, c > 0 ? `Continue: stage ${next}` : 'Play'),
            h('button', { class: 'btn big', onclick: () => this.trees() }, 'Skill trees'),
            h('button', { class: 'btn big', onclick: () => this.settings() }, 'Settings')),
          h('p', { class: 'fine', text: `${totalStars(this.save)} of 60 stars won` }))));
    this.mount(el);
    // Paint the next stage behind the menu once the buttons are up. The paint is slow on phones, so it waits a frame.
    requestAnimationFrame(() => setTimeout(() => { if (map.isConnected) this.paintTitleMap(map, next); }, 30));
  }

  /** A still frame of a real fight on the next stage: a few towers, Wren and the first foes on the road. */
  private paintTitleMap(cv: HTMLCanvasElement, stageId: number) {
    // Rain, night and lava stages make a murky backdrop; show the first stage of that region instead.
    let st = stageById(stageId);
    if (st.weather || st.night || st.lava) st = STAGES.find(x => x.region === st.region)!;
    const b = new Battle(st, { mods: modsFor(this.save), seed: 7 });
    b.gold = 99999;
    b.plots.slice(0, 4).forEach((_, i) => b.build(i, st.towers[i % st.towers.length]));
    b.gold = 0;
    b.callWave();
    for (let i = 0; i < 260 && !b.over; i++) b.step(0.05);
    b.drain();
    const r = cv.getBoundingClientRect();
    const cw = Math.max(1, r.width), ch = Math.max(1, r.height);
    // Cover the screen: scale up until both sides are filled, and keep the right side, where the gate is, in view.
    const k = Math.max(cw / MAP_W, ch / MAP_H);
    const scene = new Scene(cv);
    scene.resize(cw, ch, { x: cw - MAP_W * k, y: (ch - MAP_H * k) / 2, w: MAP_W * k, h: MAP_H * k });
    scene.load(b);
    scene.draw(b, { selPlot: null, selTower: null, preview: null, aimW: null, reduceMotion: true, dmgNumbers: false, still: true }, 0, 0);
    cv.classList.add('ready');
  }

  /* ------------------------------------------------------------------ campaign */

  campaign(focus?: number) {
    this.screen = 'campaign';
    const s = this.save, next = Math.min(20, cleared(s) + 1);
    const card = h('aside', { class: 'stage-card' });
    const show = (id: number) => {
      const st = stageById(id), open = isUnlocked(s, id), best = s.stars[id] ?? 0;
      const newFoe = Object.values(ENEMIES).find(e => e.name.toLowerCase() === st.newFoe.toLowerCase());
      clear(card);
      card.append(
        h('h2', { text: st.name }),
        h('p', { class: 'where', text: `Stage ${st.id}, ${REGIONS[st.region].name}` }),
        h('div', { class: 'stars small' }, ...[1, 2, 3].map(i => h('span', { class: i <= best ? 'on' : '', text: '★' }))),
        h('p', { text: st.twist }),
        h('dl', {},
          h('dt', { text: 'New foe' }), h('dd', { text: newFoe ? `${newFoe.name}: ${newFoe.blurb}` : st.newFoe }),
          h('dt', { text: 'Unlocks' }), h('dd', { text: st.unlocks }),
          h('dt', { text: 'Towers' }), h('dd', {}, ...st.towers.map(k => h('img', { class: 'mini', src: towerIcon(k, 40), alt: TOWERS[k].name, title: TOWERS[k].name }))),
          h('dt', { text: 'Waves' }), h('dd', { text: `${st.waves.length}, starting gold ${st.startGold}` }),
          h('dt', { text: 'Stars' }), h('dd', { text: starRule(st.lives + modsFor(s).lives) })),
        open ? h('button', { class: 'btn primary big', onclick: () => this.play(id) }, best ? 'Play again' : 'Start') : h('p', { class: 'fine', text: 'Clear the stage before it to open this one.' }));
      this.root.querySelectorAll('.node').forEach(n => n.classList.toggle('sel', n.getAttribute('data-id') === String(id)));
    };
    const regions = h('div', { class: 'regions' }, ...REGIONS.map((r, ri) => {
      const own = STAGES.filter(st => st.region === ri);
      const sealed = !isUnlocked(s, own[0].id);
      // Each region is a strip of its own ground with a road through it; the stages are stops on the road.
      const stops = own.map((_, i) => ({ x: 9 + i * (82 / (own.length - 1)), y: [66, 34, 62, 30, 52][i % 5] }));
      const d = stops.map((p, i) => {
        if (i === 0) return `M -20 ${p.y + 6} C 0 ${p.y + 6} ${p.x - 4} ${p.y} ${p.x} ${p.y}`;
        const q = stops[i - 1], mx = (q.x + p.x) / 2;
        return `C ${mx} ${q.y} ${mx} ${p.y} ${p.x} ${p.y}`;
      }).join(' ') + ` C 104 ${stops[stops.length - 1].y} 104 ${stops[stops.length - 1].y} 120 ${stops[stops.length - 1].y}`;
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('aria-hidden', 'true');
      for (const [cls, w] of [['edge', 15], ['road', 11]] as const) {
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', d); path.setAttribute('class', cls); path.setAttribute('stroke-width', String(w));
        svg.append(path);
      }
      const route = h('div', { class: 'route' }, svg, ...own.map((st, i) => {
        const open = isUnlocked(s, st.id), best = s.stars[st.id] ?? 0;
        return h('button', {
          class: `node ${open ? '' : 'locked'} ${best ? 'done' : ''} ${!best && open ? 'next' : ''} ${st.id % 5 === 0 ? 'boss' : ''}`, 'data-id': String(st.id),
          style: `left:${stops[i].x}%;top:${stops[i].y}%`,
          'aria-label': `Stage ${st.id}, ${st.name}${open ? '' : ', locked'}`, onclick: () => show(st.id),
        }, open ? h('span', { class: 'num', text: String(st.id) }) : h('span', { class: 'num' }, icon(LOCK_ICON)),
          h('span', { class: 'nm', text: st.name }),
          best ? h('span', { class: 'st', text: '★'.repeat(best) }) : null);
      }));
      return h('div', { class: `region r${ri} ${sealed ? 'sealed' : ''}`, style: `--rc:${r.color}` },
        h('div', { class: 'region-head' }, h('h3', { text: r.name }),
          h('p', { class: 'fine', text: sealed ? `Stages ${own[0].id} to ${own[own.length - 1].id}. Opens after stage ${own[0].id - 1}.` : r.rule })),
        route);
    }));
    const e = embers(s);
    this.mount(h('section', { class: 'screen campaign' },
      h('header', { class: 'bar-top' },
        h('button', { class: 'btn', onclick: () => this.title() }, 'Back'),
        h('h2', { text: 'The campaign' }),
        h('button', { class: 'btn', onclick: () => this.trees() }, `Skill trees: ${e.free} Embers`)),
      h('div', { class: 'campaign-body' }, regions, card)));
    show(focus ?? next);
    // Open on the stage you came for: on a phone the cleared regions above would push it off screen.
    const sel = this.root.querySelector<HTMLElement>('.node.sel');
    if (sel) requestAnimationFrame(() => sel.closest('.region')?.scrollIntoView({ block: 'center' }));
  }

  /* ------------------------------------------------------------------ trees */

  trees() {
    this.screen = 'trees';
    const s = this.save, e = embers(s), c = cleared(s);
    const tabs = h('div', { class: 'seg tabs', role: 'tablist' }, ...TREES.map((t, i) => h('button', {
      class: i === this.treeTab ? 'on' : '', role: 'tab', 'aria-selected': String(i === this.treeTab),
      onclick: () => { this.treeTab = i; this.trees(); },
      title: t.after > c ? `Opens after stage ${t.after}` : t.name,
    }, t.after > c ? icon(LOCK_ICON, 'svg-ico tab-lock') : null, t.name)));
    const t = TREES[this.treeTab];
    const nodes = h('div', { class: 'tree' }, ...t.nodes.map((n, i) => {
      const owned = s.nodes.includes(n.id), can = canBuyNode(s, n.id);
      const req = n.req ? NODES.get(n.req) : undefined;
      return h('div', { class: `tnode tier${Math.floor(i / 2)} ${owned ? 'owned' : ''} ${can ? 'can' : ''}` },
        h('b', { text: n.name }), h('p', { text: n.desc }),
        req && !owned ? h('small', { text: `Needs ${req.name}` }) : null,
        owned ? h('span', { class: 'badge', text: 'Learned' }) : h('button', { class: `btn act ${can ? '' : 'poor'}`, disabled: !can, onclick: () => { if (buyNode(s, n.id)) { this.persist(); this.audio.play('level'); this.trees(); } } }, `${n.cost} Embers`));
    }));
    this.mount(h('section', { class: 'screen trees' },
      h('header', { class: 'bar-top' },
        h('button', { class: 'btn', onclick: () => this.campaign() }, 'Back'),
        h('h2', { text: `${e.free} Embers to spend` }),
        h('button', { class: 'btn', onclick: () => { resetTrees(s); this.persist(); this.trees(); } }, 'Refund all')),
      h('p', { class: 'fine center', text: 'Earn Embers from stars: one per star, two more for each stage cleared. Refunds are free, so try other builds.' }),
      tabs, h('p', { class: 'center', text: t.after > c ? `Opens after stage ${t.after}.` : t.blurb }), nodes));
  }

  /* ------------------------------------------------------------------ settings */

  settings() {
    this.screen = 'settings';
    const st = this.save.settings;
    type Flag = 'sound' | 'reduceMotion' | 'autoSkills' | 'dmgNumbers';
    // Auto skills starts unset: on for the first region, then off. Showing it ticked matches what a new player gets first.
    const toggle = (label: string, key: Flag, note: string) => h('label', { class: 'toggle' },
      h('input', { type: 'checkbox', checked: st[key] ?? true, onchange: (e: Event) => { st[key] = (e.target as HTMLInputElement).checked; this.applySettings(); } }),
      h('span', {}, h('b', { text: label }), h('small', { text: note })));
    // Two steps on the page itself: browser dialogs look foreign here and do nothing in some app views.
    const erase = h('div', { class: 'erase' });
    const askErase = () => {
      clear(erase);
      erase.append(h('button', { class: 'btn danger', onclick: () => {
        clear(erase);
        erase.append(
          h('p', { class: 'erase-q', text: 'Erase all stars and tree picks? This cannot be undone.' }),
          h('div', { class: 'act-row' },
            h('button', { class: 'btn danger solid', onclick: () => { this.save = freshSave(); this.persist(); this.title(); } }, 'Erase'),
            h('button', { class: 'btn', onclick: askErase }, 'Cancel')));
      } }, 'Erase progress'));
    };
    askErase();
    this.mount(h('section', { class: 'screen settings' },
      h('header', { class: 'bar-top' }, h('button', { class: 'btn', onclick: () => this.title() }, 'Back'), h('h2', { text: 'Settings' }), h('span')),
      h('div', { class: 'panel' },
        toggle('Sound', 'sound', 'Tower fire, hits and Wren.'),
        toggle('Calm motion', 'reduceMotion', 'No screen shake, fog drift or light shafts.'),
        toggle('Auto skill points', 'autoSkills', 'Spend Wren\'s points for you as she levels. On by default in Mosslight Vale.'),
        toggle('Damage numbers', 'dmgNumbers', 'Show the damage of big hits over foes.'),
        h('h3', { text: 'How to play' }),
        h('ul', { class: 'howto' },
          h('li', { text: 'Tap a stone plot to build. Tap a tower to upgrade, split, aim or sell it.' }),
          h('li', { text: 'Tap the ground to move Wren. She holds that spot and blocks up to two foes. Tap a foe to send her after it.' }),
          h('li', { text: 'Wren gains levels inside each stage. Spend points on Q, W, E and R. Landing the killing blow pays 50% more gold.' }),
          h('li', { text: 'Walk her to the gate to shop. Grab runes when they glow on the map.' }),
          h('li', { text: 'Keys: Q W E R skills, 1 to 6 build, Space next wave, F speed, P pause, B shop. Right click moves Wren.' })),
        erase)));
  }

  private applySettings() {
    this.audio.enabled = this.save.settings.sound;
    document.documentElement.classList.toggle('reduce-motion', this.save.settings.reduceMotion);
    this.persist();
  }

  /* ------------------------------------------------------------------ battle */

  play(id: number) {
    this.screen = 'battle';
    const loading = h('section', { class: 'screen loading' }, h('h2', { text: stageById(id).name }), h('p', { class: 'fine', text: `Stage ${id}. Painting the map...` }));
    this.mount(loading);
    // Give the browser a frame to show the loading card before the slow ground paint.
    requestAnimationFrame(() => setTimeout(() => {
      const screen = new BattleScreen({
        audio: this.audio,
        mods: modsFor(this.save),
        reduceMotion: this.save.settings.reduceMotion,
        autoSkills: this.save.settings.autoSkills ?? stageById(id).region === 0,
        dmgNumbers: this.save.settings.dmgNumbers,
        onExit: () => this.campaign(id),
        onResult: (sid, stars) => { const g = recordResult(this.save, sid, stars); this.save.seenIntro = true; this.persist(); return g; },
        onNext: sid => this.play(sid),
        onRetry: sid => this.play(sid),
      }, id);
      this.mount(screen.el);
      this.battle = screen;
      screen.start();
    }, 30));
  }
}

/** How stars are won, in words: lives kept out of the lives you start with. */
function starRule(start: number) {
  const n = starLives(start), lose = start - n.three;
  return `3 if you lose ${lose} ${lose === 1 ? 'life' : 'lives'} or fewer, 2 if you keep ${n.two} of ${start}.`;
}
