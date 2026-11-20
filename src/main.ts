import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/900.css';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/800.css';
import './styles.css';
import { App } from './ui/app';
import { h, clear } from './ui/dom';
import { registerOffline } from './offline';

const root = document.getElementById('app')!;
const app = new App(root);
app.title();
registerOffline(apply => app.showUpdateToast(apply));

// Auto-pause active battles and suspend audio when the browser tab moves to the background.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) app.onBackground();
  else app.onForeground();
});
// Global recovery boundary so a canvas/runtime exception never leaves a dead parchment screen.
let crashed = false;
function showCrashCard(detail: string) {
  if (crashed) return;
  crashed = true;
  app.onBackground();
  const copyBtn = h('button', { class: 'btn', onclick: () => {
    const data = app.exportSaveJson();
    if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(data).then(() => { copyBtn.textContent = 'Save copied'; }).catch(() => {});
  } }, 'Copy save JSON');
  clear(root);
  root.append(h('section', { class: 'screen crash-screen', role: 'alertdialog', 'aria-label': 'Recovery' },
    h('div', { class: 'crash-card' },
      h('h2', { text: 'The Lantern flickered' }),
      h('p', { class: 'fine', text: 'Something unexpected interrupted the game. Your progress is safe in local storage.' }),
      h('pre', { class: 'crash-detail', text: detail.slice(0, 220) }),
      h('div', { class: 'act-row' },
        h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Reload'),
        h('button', { class: 'btn', onclick: () => { crashed = false; app.title(); } }, 'Return to Title'),
        copyBtn))));
}
window.addEventListener('error', e => {
  // Errors with no error object come from other origins (browser add-ons) or layout notices, not from the game.
  if (!e.error) return;
  showCrashCard(e.error?.stack || e.message || 'Unknown error');
});
window.addEventListener('unhandledrejection', e => {
  const r = e.reason;
  showCrashCard(r instanceof Error ? (r.stack || r.message) : String(r ?? 'Unhandled promise rejection'));
});
