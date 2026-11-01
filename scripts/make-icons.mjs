// Paints the app icon (Wren and the Keep) for the web, iOS and Android. Needs Playwright's Chromium.
// Usage: npm run icons
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<html><body style="margin:0"></body></html>');
await page.addScriptTag({ content: readFileSync(new URL('./icon-art.js', import.meta.url), 'utf8') });

const paint = async (size, k = 1, round = false) => Buffer.from((await page.evaluate(([s, k, r]) => window.paintIcon(s, k, r), [size, k, round])).split(',')[1], 'base64');
const out = (path, buf) => { const u = new URL(`../${path}`, import.meta.url); mkdirSync(new URL('.', u), { recursive: true }); writeFileSync(u, buf); console.log(path); };

for (const size of [192, 512, 1024]) out(`public/icons/icon-${size}.png`, await paint(size));
out('ios/TowerRiot/TowerRiot/Assets.xcassets/AppIcon.appiconset/icon-1024.png', await paint(1024));
// Android: square and round launcher icons, and the adaptive foreground with the figures inside the safe zone.
const dens = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [d, s] of Object.entries(dens)) {
  const res = `android/app/src/main/res/mipmap-${d}`;
  out(`${res}/ic_launcher.png`, await paint(s));
  out(`${res}/ic_launcher_round.png`, await paint(s, 1, true));
  out(`${res}/ic_launcher_foreground.png`, await paint(Math.round(s * 108 / 48), 0.72));
}
await browser.close();
