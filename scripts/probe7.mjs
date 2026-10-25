import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const url = process.env.APP_URL ?? 'http://127.0.0.1:5199/';
const outDir = path.resolve('screenshots');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
await context.addInitScript(() => {
  localStorage.setItem('terrain-o:onboarding-v1', 'seen');
});
const page = await context.newPage();
const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid="app-shell"]');
console.log('initial title:', await page.title());
console.log('initial body has draft:', (await page.locator('body').innerText()).includes('BOZZA PRELIMINARE'));
console.log('question marks:', await page.locator('text=?').count());
await page.screenshot({ path: path.join(outDir, '70-initial.png') });

await page.locator('[data-testid="file-input"]').setInputFiles([
  path.resolve('.ref/fixtures/alpine.png'),
  path.resolve('.ref/fixtures/alpine.jgw'),
]);

await page.waitForFunction(() => document.body.innerText.includes('alpine.png'), null, { timeout: 30000 });
await page.waitForTimeout(1500);
console.log('after import body snippet:', (await page.locator('body').innerText()).slice(0, 500).replace(/\n+/g, ' | '));
await page.screenshot({ path: path.join(outDir, '71-imported.png') });

// Open classification panel and apply defaults.
await page.getByRole('tab', { name: 'Classificazione' }).click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: 'Applica classificazione' }).click();
await page.locator('.stats-block').waitFor({ state: 'visible', timeout: 90000 });
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(outDir, '72-classified.png') });
console.log('classification applied');

// Vectorize with defaults.
await page.getByRole('tab', { name: 'Vettoriz.' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(outDir, '73-vector-panel.png') });
await page.getByRole('button', { name: 'Applica come livelli auto' }).click();
await page.locator('[data-testid="dialog-confirm"]').click();
await page.waitForTimeout(6000);
console.log('vectorized; body has polygon counts:', (await page.locator('body').innerText()).includes('poligoni'));
await page.screenshot({ path: path.join(outDir, '74-vectorized.png') });

// Select the first feature in the Elements list.
await page.getByRole('tab', { name: 'Elementi' }).click();
await page.waitForTimeout(400);
const featureButtons = page.locator('.feature-row, .feature-list button').filter({ hasText: /./ });
console.log('feature rows:', await featureButtons.count());
if (await featureButtons.count()) {
  await featureButtons.first().click();
  await page.waitForTimeout(400);
  console.log('provenance line:', await page.locator('.inspector-provenance').innerText().catch(() => 'n/a'));
  await page.screenshot({ path: path.join(outDir, '75-selected.png') });
}

// Export OMAP and check orientation.
await page.getByRole('button', { name: 'Esporta', exact: true }).first().click();
await page.waitForSelector('[data-testid="export-omap"]');
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.locator('[data-testid="export-omap"]').click(),
]);
const omapPath = path.join(outDir, 'export-omap-latest.omap');
await download.saveAs(omapPath);
const omap = fs.readFileSync(omapPath, 'utf8');
console.log('omap bytes:', omap.length);
console.log('omap ref/georef:', omap.match(/<georeferencing[\s\S]*?<\/georeferencing>/)?.[0]?.slice(0, 300));
console.log('omap first coords:', omap.match(/<coords count="([^"]+)">([^<]+)<\/coords>/)?.slice(1));
console.log('omap has negative y:', /<coords[^>]*>[^<]*;-?\d+ -\d+/.test(omap));
await page.keyboard.press('Escape');

// Validate topology and status bar.
await page.getByRole('tab', { name: 'Vettoriz.' }).click();
await page.getByRole('button', { name: 'Valida topologia' }).click();
await page.waitForTimeout(1500);
console.log('topology toast:', await page.locator('.toast-message').last().innerText().catch(() => 'n/a'));
await page.screenshot({ path: path.join(outDir, '76-topology.png') });

console.log('ERRORS', JSON.stringify(errors, null, 2));
await browser.close();
