import { chromium } from 'playwright';
import path from 'node:path';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addInitScript(() => localStorage.setItem('terrain-o:onboarding-v1', 'seen'));
const page = await context.newPage();
const warnings = [];
page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') warnings.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => warnings.push(`pageerror: ${e.message}`));
await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });
await page.locator('[data-testid="file-input"]').setInputFiles([path.resolve('e2e/fixtures/alpine.png'), path.resolve('e2e/fixtures/alpine.jgw')]);
await page.waitForFunction(() => document.body.innerText.includes('800 × 600'), null, { timeout: 30000 });
const box = await page.locator('.map-surface').boundingBox();
const at = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
// exercise a lot of UI quickly
await page.keyboard.press('a');
for (const [x, y] of [[0.3, 0.3], [0.5, 0.3], [0.5, 0.5], [0.3, 0.5]]) await page.mouse.click(at(x, y).x, at(x, y).y);
await page.keyboard.press('Enter');
await page.keyboard.press('v');
await page.mouse.click(at(0.4, 0.4).x, at(0.4, 0.4).y);
await page.keyboard.press('Control+z');
await page.keyboard.press('Control+Shift+z');
for (const name of ['Progetto', 'Livelli', 'Elementi', 'Proprietà', 'Storia', 'Info', 'Navigatore', 'OSM', 'DEM', 'Percorso']) {
  const tab = page.getByRole('tab', { name, exact: true }).first();
  if (await tab.count()) { await tab.click(); await page.waitForTimeout(120); }
}
await page.getByRole('tab', { name: 'Classificazione' }).click();
await page.getByRole('button', { name: 'Applica classificazione' }).click();
await page.locator('.stats-block').waitFor({ state: 'visible', timeout: 90000 });
await page.getByRole('tab', { name: 'Vettoriz.' }).click();
await page.getByRole('button', { name: 'Applica come livelli auto' }).click();
await page.getByTestId('dialog-confirm').click();
await page.waitForTimeout(5000);
await page.getByRole('tab', { name: 'Elementi' }).click();
await page.waitForTimeout(500);
console.log('rows:', await page.locator('.feature-row').count());
console.log('WARNINGS:', warnings.length ? [...new Set(warnings)].join('\n') : 'none');
await browser.close();
