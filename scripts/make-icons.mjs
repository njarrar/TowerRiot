// Paints the app icons with the game's own art library (needs Playwright's Chromium).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const lib = readFileSync(new URL('../src/art/lfx.js', import.meta.url), 'utf8').replace('export const LFX', 'window.LFX');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<html><body style="margin:0"></body></html>');
await page.addScriptTag({ content: lib });
mkdirSync(new URL('../public/icons/', import.meta.url), { recursive: true });
for (const size of [192, 512, 1024]) {
  const data = await page.evaluate(size => {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'); const k = size / 512;
    g.scale(k, k);
    const bg = g.createRadialGradient(380, 60, 20, 256, 256, 420);
    bg.addColorStop(0, '#f2c27a'); bg.addColorStop(0.45, '#5f6a3c'); bg.addColorStop(1, '#1d2417');
    g.fillStyle = bg; g.fillRect(0, 0, 512, 512);
    const L = window.LFX;
    L.shadow(g, 270, 440, 150, 30, 0.6);
    L.watchTower(g, 256, 440, 1.55, 'base', 11);
    L.watchTower(g, 256, 440, 1.55, 'emit', 11);
    g.globalCompositeOperation = 'lighter'; L.glow(g, 262, 210, 120, '#ffb050', 0.35);
    return c.toDataURL('image/png').split(',')[1];
  }, size);
  writeFileSync(new URL(`../public/icons/icon-${size}.png`, import.meta.url), Buffer.from(data, 'base64'));
  console.log(`icon-${size}.png`);
}
await browser.close();
