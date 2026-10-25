import { chromium } from 'playwright';
import path from 'node:path';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
await context.addInitScript(() => localStorage.setItem('terrain-o:onboarding-v1', 'seen'));
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });
await page.locator('[data-testid="file-input"]').setInputFiles([path.resolve('e2e/fixtures/alpine.png'), path.resolve('e2e/fixtures/alpine.jgw')]);
await page.waitForFunction(() => document.body.innerText.includes('800 × 600'), null, { timeout: 30000 });
const box = await page.locator('.map-surface').boundingBox();
const at = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
await page.keyboard.press('a');
for (const [x, y] of [[0.3, 0.3], [0.55, 0.3], [0.55, 0.55], [0.3, 0.55]]) await page.mouse.click(at(x, y).x, at(x, y).y);
await page.keyboard.press('Enter');
await page.keyboard.press('n');
for (const [x, y] of [[0.62, 0.35], [0.7, 0.45], [0.78, 0.55]]) await page.mouse.click(at(x, y).x, at(x, y).y);
await page.keyboard.press('Enter');
await page.waitForTimeout(500);

const ids = ['export-png-1','export-png-2','export-svg','export-pdf-a4','export-pdf-a3','export-omap','export-geojson','export-gpx','export-kml','export-project'];
await page.locator('.menu-icon-button[aria-label="Esporta"]').click();
for (const id of ids) {
  const el = page.getByTestId(id);
  const exists = await el.count();
  if (!exists) { console.log('MISSING', id); continue; }
  const label = (await el.innerText()).split('\n')[0];
  try {
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), el.click()]);
    console.log('OK', id, label, '->', d.suggestedFilename());
  } catch (e) {
    console.log('FAIL', id, label, String(e).slice(0, 160));
  }
  await page.waitForTimeout(400);
}
await page.screenshot({ path: 'screenshots/93-export.png' });
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
