/** Screens and flow: title, campaign map, field guide, skill trees, settings, and the battle. */
import { STAGES, REGIONS, stageById, type OathId, type StageVariant } from '../game/data/stages';
import { TREES, NODES } from '../game/data/trees';
import { ENEMIES, type EnemyKind } from '../game/data/enemies';
import { ITEMS, ITEM_ORDER } from '../game/data/shop';
import { SKILLS, SNARE, SWEEP, SUNRISE, ATTUNE, HERO } from '../game/data/hero';
import { TOWERS, TOWER_ORDER } from '../game/data/towers';
import {
  browserStore, loadSave, writeSave, cleared, isUnlocked, embers, canBuyNode, buyNode,
  resetTrees, recordResult, modsFor, totalStars, totalAltStars, freshSave,
  type Save, type Store,
} from '../game/save';
import { Audio } from '../audio/sfx';
import { h, clear, icon, trapFocus } from './dom';
import { foeIcon, heroIcon, SKILL_ICON, towerIcon, LOCK_ICON, SOUND_ICON, MUTE_ICON, GEAR_ICON } from './icons';
import { BattleScreen } from './battle';
import { Battle, starLives } from '../game/sim';
import { Scene, W as MAP_W, H as MAP_H } from '../render/scene';

const OATHS: { id: OathId; name: string; desc: string }[] = [
  { id: 'twinRifts', name: 'Twin Rifts', desc: 'Every road is live from wave 1, and every foe is 15% tougher.' },
  { id: 'shiftingEarth', name: 'Shifting Earth', desc: 'Two plots sink mid-battle and their towers refund only half. Tides, lava and steam hold roads shut for 40% less time.' },
  { id: 'longNight', name: 'Long Night', desc: 'Night never lifts. Hidden foes only show in light.' },
];
const OATH_REWARD = 'Clear a stage with any Oath active for +1 Ember, once per stage.';

const RELICS: { stage: number; name: string; bonus: string }[] = [
  { stage: 5, name: 'Mire Crown', bonus: '+10% tower damage' },
  { stage: 10, name: 'Tide Pearl', bonus: '+15% tower range near water' },
  { stage: 15, name: 'Brass Heart', bonus: '+1 Wren starting skill point' },
  { stage: 20, name: 'Ash Sigil', bonus: '+10% tower damage' },
];

export class App {
  private readonly store: Store = browserStore();
  private save: Save;
  readonly audio = new Audio();
  private battle: BattleScreen | null = null;
  private treeTab = 0;
  private variantByStage = new Map<number, StageVariant>();
  private selectedOaths = new Set<OathId>();
  private guideTab: 'foes' | 'towers' | 'items' | 'hero' = 'foes';
  /** The modal on top of the current screen (the field guide), if any. Back and Esc close it first. */
  private overlay: { close: () => void; release: () => void } | null = null;
  /** Undo what the current screen hooked up outside its own elements (window listeners). Run when it is replaced. */
  private cleanup: (() => void) | null = null;

  constructor(private readonly root: HTMLElement) {
    this.save = loadSave(this.store);
    this.audio.enabled = this.save.settings.sound;
    document.documentElement.classList.toggle('reduce-motion', this.save.settings.reduceMotion);
    root.addEventListener('pointerdown', () => this.audio.unlock(), { once: true });
  }

  private persist() { writeSave(this.store, this.save); }

  toggleSound(): boolean {
    this.save.settings.sound = !this.save.settings.sound;
    this.audio.unlock();
    this.applySettings();
    if (this.save.settings.sound) this.audio.play('click');
    return this.save.settings.sound;
  }

  private soundButton(cls = '') {
    const btn = h('button', { class: `btn icon sound ${cls}` });
    const show = () => {
      const on = this.save.settings.sound;
      clear(btn); btn.append(icon(on ? SOUND_ICON : MUTE_ICON));
      btn.setAttribute('aria-label', on ? 'Mute sound' : 'Turn sound on');
      btn.setAttribute('title', on ? 'Mute sound' : 'Turn sound on');
      btn.setAttribute('aria-pressed', String(!on));
      btn.classList.toggle('off', !on);
    };
    btn.addEventListener('click', () => { this.toggleSound(); show(); });
    show();
    return btn;
  }

  private screen: 'title' | 'campaign' | 'trees' | 'settings' | 'battle' = 'title';
  back(): boolean {
    if (this.overlay) { this.overlay.close(); return true; }
    switch (this.screen) {
      case 'battle': this.battle?.requestExit(); return true;
      case 'campaign': case 'settings': this.title(); return true;
      case 'trees': this.ackTreesRefund(); this.campaign(); return true;
      default: return false;
    }
  }

  private mount(el: HTMLElement) {
    if (this.battle) { this.battle.destroy(); this.battle = null; }
    if (this.cleanup) { this.cleanup(); this.cleanup = null; }
    if (this.overlay) { this.overlay.release(); this.overlay = null; }
    clear(this.root);
    this.root.append(el);
  }

  /* ------------------------------------------------------------------ title */

  title() {
    this.screen = 'title';
    const c = cleared(this.save), next = Math.min(20, c + 1);
    const map = h('canvas', { class: 'title-map', 'aria-hidden': 'true' });
    const altS = totalAltStars(this.save);
    // On a narrow phone Settings leaves the button rows and becomes the gear beside the sound button.
    const gear = h('button', { class: 'btn icon title-gear', 'aria-label': 'Settings', title: 'Settings', onclick: () => this.settings() }, icon(GEAR_ICON));
    const el = h('section', { class: 'screen title' }, map, this.soundButton('title-sound'), gear,
      h('div', { class: 'title-inner' },
        h('div', { class: 'title-panel' },
          h('h1', { class: 'logo', text: 'TowerRiot' }),
          h('p', { class: 'tag', text: 'Hold the Lantern Keep. Build towers, raise Wren from level 1 to 16 in every fight, and outthink a Hollow that learns.' }),
          h('div', { class: 'title-btns' },
            h('button', { class: 'btn primary big', onclick: () => this.campaign() }, c > 0 ? `Continue: stage ${next}` : 'Play'),
            h('button', { class: 'btn big', onclick: () => this.trees() }, 'Skill trees'),
            h('button', { class: 'btn big', onclick: () => this.openGuide() }, 'Field guide'),
            h('button', { class: 'btn big title-settings', onclick: () => this.settings() }, 'Settings')),
          h('p', { class: 'fine', text: `${totalStars(this.save)} of 60 stars won${altS > 0 ? ` · ${altS} Variant B stars` : ''}` }))));
    this.mount(el);
    requestAnimationFrame(() => setTimeout(() => { if (map.isConnected) this.paintTitleMap(map, next); }, 30));
  }

  private paintTitleMap(cv: HTMLCanvasElement, stageId: number) {
    let st = stageById(stageId);
    if (st.weather || st.night || st.lava) st = STAGES.find(x => x.region === st.region)!;
    const b = new Battle(st, { mods: modsFor(this.save), seed: 7 });
    b.setPreviewGold(99999);
    b.plots.slice(0, 4).forEach((p, i) => {
      if (p.unlocked && !p.rubble) b.build(i, st.towers[i % st.towers.length]);
    });
    b.setPreviewGold(0);
    b.callWave();
    for (let i = 0; i < 260 && !b.over; i++) b.step(0.05);
    b.drain();
    const r = cv.getBoundingClientRect();
    const cw = Math.max(1, r.width), ch = Math.max(1, r.height);
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
    // `refocus` names the control to focus again after the card is rebuilt, so a keyboard user keeps their place.
    const show = (id: number, refocus?: string) => {
      const raw = stageById(id), open = isUnlocked(s, id), stdBest = s.stars[id] ?? 0, altBest = s.altStars[id] ?? 0;
      const variant = stdBest > 0 ? (this.variantByStage.get(id) ?? 'standard') : 'standard';
      const best = variant === 'alt' ? altBest : stdBest;
      const newFoe = Object.values(ENEMIES).find(e => e.name.toLowerCase() === raw.newFoe.toLowerCase());
      clear(card);

      const modeToggle = raw.alt ? h('div', { class: 'seg variant-seg', role: 'group', 'aria-label': 'Stage mode' },
        h('button', {
          class: variant === 'standard' ? 'on' : '', 'aria-pressed': String(variant === 'standard'),
          onclick: () => { this.variantByStage.set(id, 'standard'); show(id, '.variant-seg button.on'); },
        }, 'Standard'),
        h('button', {
          class: variant === 'alt' ? 'on' : '', 'aria-pressed': String(variant === 'alt'),
          disabled: stdBest === 0,
          title: stdBest === 0 ? 'Clear Standard once to unlock Variant B' : raw.alt.twist,
          onclick: () => { if (stdBest > 0) { this.variantByStage.set(id, 'alt'); show(id, '.variant-seg button.on'); } },
        }, 'Variant B')) : null;

      const oathsRow = stdBest > 0 ? h('div', { class: 'oaths' },
        h('div', { class: 'oath-row', role: 'group', 'aria-label': 'Challenge Oaths' }, ...OATHS.map(o => {
          const active = this.selectedOaths.has(o.id);
          const done = !!s.oathsCleared[`${id}:${o.id}`];
          return h('button', {
            class: `btn oath-btn ${active ? 'on' : ''} ${done ? 'done' : ''}`, title: o.desc, 'data-oath': o.id, 'aria-pressed': String(active),
            onclick: () => { if (active) this.selectedOaths.delete(o.id); else this.selectedOaths.add(o.id); show(id, `[data-oath="${o.id}"]`); },
          }, `${o.name}${done ? ' ✓' : ''}`);
        })),
        // What each active Oath does, in words: a tooltip alone never shows on a touchscreen.
        ...OATHS.filter(o => this.selectedOaths.has(o.id)).map(o => h('p', { class: 'fine oath-desc' }, h('b', { text: `${o.name}: ` }), o.desc)),
        h('p', { class: 'fine oath-desc', text: OATH_REWARD })) : null;

      card.append(
        h('h2', { text: variant === 'alt' && raw.alt ? raw.alt.name : raw.name }),
        h('p', { class: 'where', text: `Stage ${raw.id}, ${REGIONS[raw.region].name}${variant === 'alt' ? ' · Variant B' : ''}` }),
        ...(modeToggle ? [modeToggle] : []),
        h('div', { class: 'stars small' }, ...[1, 2, 3].map(i => h('span', { class: i <= best ? 'on' : '', text: '★' }))),
        h('p', { text: variant === 'alt' && raw.alt ? raw.alt.twist : raw.twist }),
        h('dl', {},
          h('dt', { text: 'New foe' }), h('dd', { class: 'foe-dd' },
            newFoe ? h('img', { class: 'mini', src: foeIcon(newFoe.kind, 36), alt: newFoe.name }) : null,
            h('span', { text: newFoe ? `${newFoe.name}: ${newFoe.blurb} Answer: ${newFoe.answer}` : raw.newFoe })),
          h('dt', { text: 'Unlocks' }), h('dd', { text: raw.unlocks }),
          h('dt', { text: 'Towers' }), h('dd', {}, ...raw.towers.map(k => h('img', { class: 'mini', src: towerIcon(k, 40), alt: TOWERS[k].name, title: TOWERS[k].name }))),
          h('dt', { text: 'Waves' }), h('dd', { text: `${raw.waves.length}, starting gold ${raw.startGold}` }),
          h('dt', { text: 'Stars' }), h('dd', { text: starRule(raw.lives + modsFor(s).lives) })),
        ...(oathsRow ? [oathsRow] : []),
        open
          ? h('button', {
              class: 'btn primary big',
              onclick: () => this.play(id, variant, stdBest > 0 ? [...this.selectedOaths] : []),
            }, best ? `Play ${variant === 'alt' ? 'Variant B' : 'again'}` : 'Start')
          : h('p', { class: 'fine', text: 'Clear the stage before it to open this one.' }));
      this.root.querySelectorAll('.node').forEach(n => n.classList.toggle('sel', n.getAttribute('data-id') === String(id)));
      if (refocus) card.querySelector<HTMLElement>(refocus)?.focus();
    };

    const regions = h('div', { class: 'regions' }, ...REGIONS.map((r, ri) => {
      const own = STAGES.filter(st => st.region === ri);
      const sealed = !isUnlocked(s, own[0].id);
      const regionY = [
        [68, 36, 62, 30, 50],
        [34, 66, 38, 68, 44],
        [64, 62, 30, 32, 54],
        [70, 48, 28, 58, 34],
      ][ri] ?? [66, 34, 62, 30, 52];
      const stops = own.map((_, i) => ({ x: 9 + i * (82 / (own.length - 1)), y: regionY[i % regionY.length] }));
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
        const open = isUnlocked(s, st.id), best = s.stars[st.id] ?? 0, altBest = s.altStars[st.id] ?? 0;
        return h('button', {
          class: `node ${open ? '' : 'locked'} ${best ? 'done' : ''} ${!best && open ? 'next' : ''} ${st.id % 5 === 0 ? 'boss' : ''}`,
          'data-id': String(st.id),
          style: `left:${stops[i].x}%;top:${stops[i].y}%`,
          'aria-label': `Stage ${st.id}, ${st.name}${open ? '' : ', locked'}`, onclick: () => show(st.id),
        }, open ? h('span', { class: 'num', text: String(st.id) }) : h('span', { class: 'num' }, icon(LOCK_ICON)),
          h('span', { class: 'nm', text: st.name }),
          best || altBest ? h('span', { class: 'st', text: `${'★'.repeat(best)}${altBest ? ` +${altBest}B` : ''}` }) : null);
      }));
      return h('div', { class: `region r${ri} ${sealed ? 'sealed' : ''}`, style: `--rc:${r.color}` },
        h('div', { class: 'region-head' }, h('h3', { text: r.name }),
          h('p', { class: 'fine', text: sealed ? `Stages ${own[0].id} to ${own[own.length - 1].id}. Opens after stage ${own[0].id - 1}.` : r.rule })),
        route);
    }));

    const relicShelf = h('div', { class: 'relic-shelf' },
      h('span', { class: 'rs-lbl', text: 'Boss Relics:' }),
      ...RELICS.map(rl => {
        const has = (s.stars[rl.stage] ?? 0) > 0;
        return h('span', { class: `relic-chip ${has ? 'on' : ''}`, title: has ? `${rl.name}: ${rl.bonus}` : `Clear Stage ${rl.stage} to claim` },
          `${rl.name}${has ? ` (${rl.bonus})` : ' (Locked)'}`);
      }));

    const e = embers(s);
    this.mount(h('section', { class: 'screen campaign' },
      h('header', { class: 'bar-top' },
        h('button', { class: 'btn', onclick: () => this.title() }, 'Back'),
        h('h2', { text: 'The campaign' }),
        h('div', { class: 'bar-end' },
          h('div', { class: 'camp-links' },
            h('button', { class: 'btn', onclick: () => this.openGuide(() => this.campaign(focus)) }, 'Field guide'),
            h('button', { class: 'btn', onclick: () => this.trees() }, `Skill trees: ${Math.max(0, e.free)} Embers`)),
          this.soundButton())),
      relicShelf,
      h('div', { class: 'campaign-body' }, regions, card)));
    show(focus ?? next);
    const sel = this.root.querySelector<HTMLElement>('.node.sel');
    if (sel) requestAnimationFrame(() => sel.closest('.region')?.scrollIntoView({ block: 'center' }));
  }

  /* ------------------------------------------------------------------ field guide / bestiary */

  private openGuide(onClose?: () => void) {
    if (this.overlay) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overlay = h('div', { class: 'veil guide-veil', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Field guide' });
    const body = h('div', { class: 'guide-body' });
    const close = () => {
      this.overlay?.release();
      this.overlay = null;
      overlay.remove();
      if (onClose) onClose(); else if (opener?.isConnected) opener.focus();
    };
    // The tab counts come from the data, so they cannot drift from what the lists show.
    const tabName = { foes: `${Object.keys(ENEMIES).length} Foes`, towers: `${TOWER_ORDER.length} Towers`, items: `${ITEM_ORDER.length} Shop Items`, hero: 'Wren & Skills' };
    const render = (focusTab = false) => {
      clear(body);
      const tabs = h('div', { class: 'seg tabs', role: 'group', 'aria-label': 'Guide section' },
        ...(['foes', 'towers', 'items', 'hero'] as const).map(tab =>
          h('button', {
            class: this.guideTab === tab ? 'on' : '', 'aria-pressed': String(this.guideTab === tab),
            onclick: () => { this.guideTab = tab; render(true); },
          }, tabName[tab])));
      body.append(
        h('div', { class: 'guide-head' }, h('h2', { text: 'Keep Field Guide' }), h('button', { class: 'btn icon guide-close', onclick: close, 'aria-label': 'Close' }, '✕')),
        tabs);
      const list = h('div', { class: 'guide-grid' });
      if (this.guideTab === 'foes') {
        for (const f of Object.values(ENEMIES)) {
          const tags = [f.flying ? 'Flying' : 'Ground', f.traits?.boss ? 'Boss' : null, f.traits?.armor ? `Armor ${f.traits.armor}` : null, f.traits?.stealth ? 'Stealth' : null, f.traits?.heal ? 'Healer' : null].filter(Boolean).join(' · ');
          list.append(h('div', { class: 'guide-card' },
            h('img', { src: foeIcon(f.kind as EnemyKind, 60), alt: f.name }),
            h('div', {}, h('b', { text: f.name }), h('small', { text: `${tags} · ${f.hp} HP · ${f.gold}g · ${f.leak} life` }), h('p', { text: f.blurb }),
              h('p', { class: 'answer' }, h('b', { text: 'Answer: ' }), f.answer))));
        }
      } else if (this.guideTab === 'towers') {
        for (const k of TOWER_ORDER) {
          const d = TOWERS[k];
          list.append(h('div', { class: 'guide-card' },
            h('img', { src: towerIcon(k, 64), alt: d.name }),
            h('div', {}, h('b', { text: d.name }),
              h('small', { text: `Costs: ${d.cost.join('/')}g · Lv 4 Splits: ${d.splits.map(s => `${s.name} -> ${s.masteryName}`).join(' | ')}` }),
              h('p', { text: d.blurb }))));
        }
      } else if (this.guideTab === 'items') {
        for (const id of ITEM_ORDER) {
          const it = ITEMS[id];
          list.append(h('div', { class: 'guide-card flat' },
            h('div', {}, h('b', { text: `${it.name} (${it.cost}g base, +20% courier away from Gate)` }), h('p', { text: it.desc }))));
        }
      } else {
        list.append(h('div', { class: 'guide-card' },
          h('img', { src: heroIcon(56), alt: 'Wren' }),
          h('div', {},
            h('b', { text: `Wren: Pin & ${HERO.leash} px Leash (${HERO.blocks} road blocks, ${HERO.gateRadius} px Gate Sanctuary)` }),
            h('p', { text: `Starts Lv 1..16. Auto-attacks block up to 2 foes inside a 90 px leash without losing road hold.` }))));
        for (const k of ['q', 'w', 'e', 'r'] as const) {
          const s = SKILLS[k];
          const extra = k === 'w' ? ` Reach ${SNARE.range} px, ${SNARE.burnSec}s burn.` : k === 'q' ? ` Radius ${SWEEP.radius} px.` : k === 'e' ? ` Aura ${ATTUNE.radius} px.` : ` Full-map haste ${SUNRISE.dur.join('/')}s.`;
          list.append(h('div', { class: 'guide-card flat' },
            h('div', { class: 'guide-skill-head' }, icon(SKILL_ICON[k], 'svg-ico'), h('b', { text: `${s.key.toUpperCase()}: ${s.name}` })),
            h('div', {}, h('small', { text: `Unlocks Lv ${s.needLevel.join('/')} · CD ${s.cd.join('/')}s` }), h('p', { text: `${s.desc}${extra}` }))));
        }
      }
      body.append(list);
      // Switching tabs rebuilds the body: put focus back on the tab that was pressed.
      if (focusTab) tabs.querySelector<HTMLElement>('button.on')?.focus();
    };
    render();
    overlay.append(h('div', { class: 'guide-modal' }, body));
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    this.root.append(overlay);
    // Tab stays inside the guide, Esc and the back button close it.
    this.overlay = { close, release: trapFocus(overlay, close) };
    body.querySelector<HTMLElement>('.guide-close')?.focus();
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
    const svgNS = 'http://www.w3.org/2000/svg';
    const wires = document.createElementNS(svgNS, 'svg');
    wires.setAttribute('class', 'tree-wires');
    wires.setAttribute('aria-hidden', 'true');

    const cardById = new Map<string, HTMLElement>();
    const nodeCards = t.nodes.map((n, i) => {
      const owned = s.nodes.includes(n.id), can = canBuyNode(s, n.id);
      const req = n.req ? NODES.get(n.req) : undefined;
      const exclNode = n.excl ? NODES.get(n.excl) : undefined;
      const exclLocked = !!(n.excl && s.nodes.includes(n.excl));
      const notes: string[] = [];
      if (req && !owned && !s.nodes.includes(req.id)) notes.push(`Needs ${req.name}`);
      if (n.after && c < n.after && !owned) notes.push(`Opens after stage ${n.after}`);
      if (exclNode && !owned && !exclLocked) notes.push(`Capstone: locks ${exclNode.name}`);
      const card = h('div', {
        class: `tnode tier${Math.floor(i / 2)} ${n.excl ? 'capstone' : ''} ${owned ? 'owned' : ''} ${can ? 'can' : ''} ${exclLocked ? 'excl-locked' : ''}`,
      },
      h('b', { text: n.name }), h('p', { text: n.desc }),
      notes.length ? h('small', { text: notes.join(' · ') }) : null,
      owned ? h('span', { class: 'badge', text: 'Learned' })
        : exclLocked ? h('span', { class: 'badge muted', text: `Locked by ${exclNode?.name ?? 'Capstone'}` })
        : h('button', { class: `btn act ${can ? '' : 'poor'}`, disabled: !can, onclick: () => { if (buyNode(s, n.id)) { this.persist(); this.audio.play('level'); this.trees(); } } }, `${n.cost} Embers`));
      cardById.set(n.id, card);
      return card;
    });

    const nodes = h('div', { class: 'tree' }, wires, ...nodeCards);
    // An old save whose trees were refunded because the costs changed: say so once, until dismissed or the screen is left.
    const refundNote = s.treesRefunded ? h('p', { class: 'refund-note', role: 'status' },
      h('span', { text: 'The trees were rebalanced. Your Embers were refunded, so spend them again.' }),
      h('button', { class: 'btn icon', 'aria-label': 'Dismiss', onclick: () => { this.ackTreesRefund(); refundNote?.remove(); } }, '✕')) : null;
    this.mount(h('section', { class: 'screen trees' },
      h('header', { class: 'bar-top' },
        h('button', { class: 'btn', onclick: () => { this.ackTreesRefund(); this.campaign(); } }, 'Back'),
        h('h2', { text: `${Math.max(0, e.free)} Embers to spend` }),
        h('button', { class: 'btn', onclick: () => { resetTrees(s); this.persist(); this.trees(); } }, 'Refund all')),
      refundNote,
      h('p', { class: 'fine center', text: 'Earn Embers from stars, Variant B replays, and Challenge Oaths. Refunds are free.' }),
      tabs, h('p', { class: 'center', text: t.after > c ? `Opens after stage ${t.after}.` : t.blurb }), nodes));

    const drawWires = () => {
      if (!nodes.isConnected) return;
      const box = nodes.getBoundingClientRect();
      wires.setAttribute('viewBox', `0 0 ${Math.max(1, box.width)} ${Math.max(1, box.height)}`);
      while (wires.firstChild) wires.removeChild(wires.firstChild);
      for (const n of t.nodes) {
        if (!n.req) continue;
        const aEl = cardById.get(n.req), bEl = cardById.get(n.id);
        if (!aEl || !bEl) continue;
        const ar = aEl.getBoundingClientRect(), br = bEl.getBoundingClientRect();
        const x1 = ar.left - box.left + ar.width / 2, y1 = ar.bottom - box.top;
        const x2 = br.left - box.left + br.width / 2, y2 = br.top - box.top;
        const midY = (y1 + y2) / 2;
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${midY} ${x2} ${midY} ${x2} ${y2}`);
        const active = s.nodes.includes(n.req) && s.nodes.includes(n.id);
        const ready = s.nodes.includes(n.req) && canBuyNode(s, n.id);
        path.setAttribute('class', `wire ${active ? 'owned' : ready ? 'can' : ''}`);
        wires.append(path);
      }
    };
    requestAnimationFrame(drawWires);
    // One listener for as long as this screen is up; mount() removes it when the screen is replaced.
    window.addEventListener('resize', drawWires);
    this.cleanup = () => window.removeEventListener('resize', drawWires);
  }

  /** The player has seen (or left behind) the "trees were rebalanced" note: do not show it again. */
  private ackTreesRefund() {
    if (!this.save.treesRefunded) return;
    this.save.treesRefunded = false;
    this.persist();
  }

  /* ------------------------------------------------------------------ settings */

  settings() {
    this.screen = 'settings';
    const st = this.save.settings;
    type Flag = 'sound' | 'reduceMotion' | 'autoSkills' | 'dmgNumbers' | 'tapGroundMove' | 'tapAimW' | 'autoNext' | 'leftHandHud';
    const toggle = (label: string, key: Flag, note: string) => h('label', { class: 'toggle' },
      h('input', { type: 'checkbox', checked: st[key] ?? true, onchange: (e: Event) => { st[key] = (e.target as HTMLInputElement).checked; this.applySettings(); } }),
      h('span', {}, h('b', { text: label }), h('small', { text: note })));
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
        toggle('Sound', 'sound', 'Tower fire, hits and Wren. Mute any time with M in battle.'),
        toggle('Calm motion', 'reduceMotion', 'Disables screen shake, screen flash, fog drift, and rain.'),
        toggle('Auto skill points', 'autoSkills', 'Automatically spend Wren skill points on level up (default in Region 1).'),
        toggle('Damage numbers', 'dmgNumbers', 'Show hit numbers over foes.'),
        toggle('Tap ground moves Wren (touch)', 'tapGroundMove', 'On touchscreens, allow single ground taps to pin Wren (drag Wren always works).'),
        toggle('Tap-to-aim W (accessibility)', 'tapAimW', 'Aim Lantern Snare with two taps: tap W, then tap the spot. It lands exactly where you tap.'),
        toggle('Auto-call next wave', 'autoNext', 'Call the next wave as soon as the field is clear of foes.'),
        toggle('Left-handed HUD', 'leftHandHud', 'Mirror the battle HUD controls to the left side for left-thumb reach.'),
        h('h3', { text: 'How to play' }),
        h('ul', { class: 'howto' },
          h('li', { text: 'Tap a stone plot to build (3x2 tower deck), clear rubble, or tap a switch lever to redirect roads/brakes.' }),
          h('li', { text: 'Drag Wren to pin her anywhere along the road (she fights inside a 90 px leash while holding 2 foes).' }),
          h('li', { text: 'Wren gains XP and gold (+50% on last hits). Shop free at Gate or between waves, or via +20% field courier.' }),
          h('li', { text: 'Keys: Q W E R skills, 1-6 build, Space next wave, F speed, P pause, M sound, B shop. Right-click moves Wren.' })),
        erase)));
  }

  private applySettings() {
    this.audio.enabled = this.save.settings.sound;
    document.documentElement.classList.toggle('reduce-motion', this.save.settings.reduceMotion);
    this.persist();
  }

  /* ------------------------------------------------------------------ battle */

  play(id: number, variant: StageVariant = 'standard', oaths: OathId[] = []) {
    this.screen = 'battle';
    const st = stageById(id);
    const loading = h('section', { class: 'screen loading' },
      h('h2', { text: variant === 'alt' && st.alt ? st.alt.name : st.name }),
      h('p', { class: 'fine', text: `Stage ${id}${variant === 'alt' ? ' · Variant B' : ''}. Painting the map...` }));
    this.mount(loading);
    requestAnimationFrame(() => setTimeout(() => {
      const screen = new BattleScreen({
        audio: this.audio,
        toggleSound: () => this.toggleSound(),
        onToggleAutoNext: v => { this.save.settings.autoNext = v; this.persist(); },
        mods: modsFor(this.save),
        reduceMotion: this.save.settings.reduceMotion,
        autoSkills: this.save.settings.autoSkills ?? st.region === 0,
        dmgNumbers: this.save.settings.dmgNumbers,
        tapGroundMove: this.save.settings.tapGroundMove,
        tapAimW: this.save.settings.tapAimW,
        autoNext: this.save.settings.autoNext,
        leftHandHud: this.save.settings.leftHandHud,
        variant,
        oaths,
        onExit: () => this.campaign(id),
        onResult: (sid, stars, opts) => {
          const g = recordResult(this.save, sid, stars, opts);
          this.save.seenIntro = true;
          this.persist();
          return g;
        },
        onNext: sid => this.play(sid),
        onRetry: (sid, opts) => this.play(sid, opts?.variant ?? variant, opts?.oaths ?? oaths),
      }, id);
      this.mount(screen.el);
      this.battle = screen;
      screen.start();
    }, 30));
  }
}

function starRule(start: number) {
  const n = starLives(start), lose = start - n.three;
  return `3 if you lose ${lose} ${lose === 1 ? 'life' : 'lives'} or fewer, 2 if you keep ${n.two} of ${start}.`;
}
