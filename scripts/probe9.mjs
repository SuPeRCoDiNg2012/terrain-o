import { chromium } from 'playwright';
import path from 'node:path';

const url = process.env.APP_URL ?? 'http://127.0.0.1:5199/';
const errors = [];
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addInitScript(() => localStorage.setItem('terrain-o:onboarding-v1', 'seen'));
const page = await context.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid="app-shell"]');

await page.locator('[data-testid="file-input"]').setInputFiles([
  path.resolve('e2e/fixtures/alpine.png'),
  path.resolve('e2e/fixtures/alpine.jgw'),
]);
await page.waitForFunction(() => document.body.innerText.includes('800 × 600'), null, { timeout: 30000 });
console.log('IMPORT OK');

const status = () => page.locator('.status-bar-pro').innerText();
const mapBox = await page.locator('.map-surface').boundingBox();
const at = (fx, fy) => ({ x: mapBox.x + mapBox.width * fx, y: mapBox.y + mapBox.height * fy });

// Tool shortcuts
for (const [key, id] of [['v', 'select'], ['m', 'marquee'], ['l', 'lasso'], ['a', 'draw-area'], ['n', 'draw-line'], ['p', 'draw-point'], ['h', 'pan'], ['z', 'zoom'], ['i', 'eyedropper']]) {
  await page.keyboard.press(key);
  const pressed = await page.locator(`[data-testid="tool-${id}"]`).getAttribute('aria-pressed');
  if (pressed !== 'true') console.log(`SHORTCUT FAIL ${key} -> ${id} (pressed=${pressed})`);
}
console.log('SHORTCUTS DONE');

// Draw area
await page.keyboard.press('a');
for (const [x, y] of [[0.3, 0.3], [0.55, 0.3], [0.55, 0.55], [0.3, 0.55]]) await page.mouse.click(at(x, y).x, at(x, y).y);
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
console.log('AFTER AREA:', (await status()).replace(/\n/g, ' | '));

// Draw line
await page.keyboard.press('n');
for (const [x, y] of [[0.62, 0.35], [0.7, 0.45], [0.78, 0.55]]) await page.mouse.click(at(x, y).x, at(x, y).y);
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
console.log('AFTER LINE:', (await status()).replace(/\n/g, ' | '));

// Draw point
await page.keyboard.press('p');
await page.mouse.click(at(0.45, 0.7).x, at(0.45, 0.7).y);
await page.waitForTimeout(300);
console.log('AFTER POINT:', (await status()).replace(/\n/g, ' | '));

// Select area
await page.keyboard.press('v');
await page.mouse.click(at(0.4, 0.4).x, at(0.4, 0.4).y);
await page.waitForTimeout(300);
console.log('AFTER SELECT:', (await status()).replace(/\n/g, ' | '));

// Properties + verify
await page.getByRole('tab', { name: 'Proprietà' }).click();
await page.waitForTimeout(300);
console.log('PROPERTIES SNIP:', (await page.locator('.dock-right').innerText()).slice(0, 400).replace(/\n+/g, ' | '));
const verify = page.getByTestId('verify-button');
if (await verify.count()) {
  await verify.click();
  await page.waitForTimeout(400);
  console.log('AFTER VERIFY:', (await status()).replace(/\n/g, ' | '));
} else console.log('VERIFY BUTTON MISSING');

// Undo/redo
await page.keyboard.press('Control+z');
await page.waitForTimeout(300);
console.log('AFTER UNDO:', (await status()).replace(/\n/g, ' | '));
await page.keyboard.press('Control+Shift+z');
await page.waitForTimeout(300);
console.log('AFTER REDO:', (await status()).replace(/\n/g, ' | '));

// Marquee
await page.keyboard.press('m');
await page.mouse.move(at(0.25, 0.25).x, at(0.25, 0.25).y);
await page.mouse.down();
await page.mouse.move(at(0.85, 0.8).x, at(0.85, 0.8).y, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(300);
console.log('AFTER MARQUEE:', (await status()).replace(/\n/g, ' | '));

// Panels
for (const name of ['Progetto', 'Livelli', 'Elementi', 'Proprietà', 'Classificazione', 'Vettoriz.', 'Storia', 'Info', 'Navigatore', 'OSM', 'DEM', 'Percorso']) {
  const tab = page.getByRole('tab', { name, exact: true }).first();
  if (!(await tab.count())) { console.log('TAB MISSING', name); continue; }
  await tab.click();
  await page.waitForTimeout(180);
  const text = await page.locator('.dock-right, .dock-left').filter({ has: page.getByRole('tab', { name, exact: true }) }).first().innerText().catch(() => '');
  if (!text.trim()) console.log('PANEL EMPTY', name);
}
console.log('PANELS DONE');

// Legend toggle via menu
await page.locator('.menu-bar').getByRole('menuitem', { name: 'Visualizza' }).click();
await page.waitForTimeout(200);
const legendItem = page.getByRole('menuitemcheckbox', { name: /Legenda/ }).or(page.getByRole('menuitem', { name: /Legenda/ })).first();
if (await legendItem.count()) { await legendItem.click(); await page.waitForTimeout(300); console.log('LEGEND VISIBLE:', await page.locator('.map-legend').count()); }
else console.log('LEGEND MENU ITEM MISSING');
await page.keyboard.press('Escape');

// Zoom shortcuts
await page.keyboard.press('Control+Equal');
await page.keyboard.press('Control+0');
console.log('ZOOM OK');

// Export modal
await page.locator('.menu-icon-button[aria-label="Esporta"]').click();
await page.waitForTimeout(300);
console.log('EXPORT MODAL:', await page.locator('[role="dialog"]').first().innerText().then(t => t.slice(0, 120).replace(/\n+/g, ' | ')).catch(() => 'NONE'));
await page.keyboard.press('Escape');

await page.screenshot({ path: 'screenshots/90-probe.png' });
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
