// Paints the game's art in a headless browser with the web painters and writes it into the iOS app.
// Usage: npm run native:art
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Playwright is a dev tool on the machine, not a project dependency.
const { chromium } = createRequire(import.meta.url)('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'ios/TowerRiot/TowerRiot/Art');
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) rmSync(join(out, f));

const server = await createServer({ root, logLevel: 'error', server: { port: 5199, strictPort: false } });
await server.listen();
const url = server.resolvedUrls.local[0] + 'tools/bake/index.html';
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => console.error(e));
let n = 0;
await page.exposeFunction('save', (name, data) => {
  const comma = data.indexOf(',');
  const head = data.slice(0, comma), body = data.slice(comma + 1);
  const buf = head.endsWith(';base64') ? Buffer.from(body, 'base64') : Buffer.from(decodeURIComponent(body));
  writeFileSync(join(out, name), buf);
  n++;
});
await page.goto(url);
await page.waitForFunction(() => typeof window.bake === 'function');
const summary = await page.evaluate(() => window.bake());
console.log(`${summary}; ${n} files in ${out}`);
await browser.close();
await server.close();
