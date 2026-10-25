import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
await context.addInitScript(() => localStorage.setItem('terrain-o:onboarding-v1', 'seen'));
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGE: ' + e.message));
await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });
await page.locator('[data-testid="file-input"]').setInputFiles([path.resolve('e2e/fixtures/alpine.png'), path.resolve('e2e/fixtures/alpine.jgw')]);
await page.waitForFunction(() => document.body.innerText.includes('800 × 600'), null, { timeout: 30000 });
await page.getByRole('menuitem', { name: 'Classificazione' }).click();
await page.getByRole('menuitem', { name: 'Esegui con i parametri correnti' }).click();
await page.waitForTimeout(12000);
await page.getByRole('tab', { name: /Vettoriz/i }).click();
await page.locator('.dock-right').getByRole('button', { name: /Applica come livelli auto/i }).click();
await page.getByTestId('dialog-confirm').click();
await page.waitForTimeout(8000);
await page.keyboard.press('Control+e');
await page.waitForTimeout(600);
for (const [id, ext] of [['export-geojson','geojson'],['export-omap','omap'],['export-svg','svg'],['export-project','json']]) {
  const dl = page.waitForEvent('download', { timeout: 15000 });
  await page.getByTestId(id).click();
  const download = await dl;
  const target = '/tmp/terrain-' + ext;
  await download.saveAs(target);
  const size = fs.statSync(target).size;
  console.log(ext, 'download', size, 'bytes');
  if (ext === 'geojson') {
    const gj = JSON.parse(fs.readFileSync(target, 'utf8'));
    const polys = gj.features.filter(f => /Polygon/.test(f.geometry.type));
    const first = polys[0];
    const ring = first.geometry.type === 'Polygon' ? first.geometry.coordinates[0] : first.geometry.coordinates[0][0];
    console.log('geojson', gj.features.length, 'polys', polys.length, 'props', JSON.stringify(first.properties).slice(0,200), 'ringPts', ring.length, 'closed', JSON.stringify(ring[0]) === JSON.stringify(ring.at(-1)));
  }
  if (ext === 'omap') {
    const text = fs.readFileSync(target, 'utf8');
    console.log('omap head', text.slice(0,80).replace(/\n/g,' '), 'objects', (text.match(/<object /g)||[]).length, 'verified tags', (text.match(/verificato<\/t>/g)||[]).length);
  }
  await page.waitForTimeout(700);
}
console.log('errors:', errors.length ? [...new Set(errors)].slice(0,5) : 'none');
await browser.close();
