import { chromium } from 'playwright';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://127.0.0.1:5183/';
const out = (...p) => path.join(process.cwd(), 'screenshots', ...p);
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`[console] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('terrain-o:onboarding-v1', 'seen'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(500);

await page.setInputFiles('[data-testid="file-input"]', [
  path.join(process.cwd(), '.ref/fixtures/alpine.png'),
  path.join(process.cwd(), '.ref/fixtures/alpine.jgw'),
]);

await page.waitForFunction(
  () => !document.querySelector('.import-banner') &&
    !document.body.innerText.includes('Nessun progetto'),
  { timeout: 30000 },
).catch(() => {});
await page.waitForTimeout(1200);
console.log('after import, body head:', (await page.locator('body').innerText()).slice(0, 240).replace(/\n+/g, ' | '));
await page.screenshot({ path: out('01-imported.png'), fullPage: false });

// Classification panel
await page.getByRole('tab', { name: 'Classificazione' }).click();
await page.waitForTimeout(900);
console.log('classification panel visible:', await page.getByRole('button', { name: 'Applica classificazione' }).isVisible());
await page.screenshot({ path: out('02-classification.png') });

await page.getByRole('button', { name: 'Applica classificazione' }).click();
await page.waitForFunction(
  () => !document.body.innerText.includes('Classificazione in corso') &&
    document.querySelectorAll('.stats-block').length > 0,
  { timeout: 120000 },
).catch((e) => console.log('classify wait:', e.message));
await page.waitForTimeout(800);
console.log('classification stats blocks:', await page.locator('.stats-block').count());
await page.screenshot({ path: out('03-classified.png') });

// Vectorize
await page.getByRole('tab', { name: 'Vettoriz.' }).click();
await page.waitForTimeout(600);
console.log('vectorize labels:', (await page.locator('.shell-panel, [role=tabpanel]').last().innerText()).slice(0, 300).replace(/\n+/g, ' | '));
await page.screenshot({ path: out('04-vectorize-panel.png') });

const apply = page.getByRole('button', { name: /Applica|Vettorizza|Genera/ }).first();
if (await apply.isVisible().catch(() => false)) {
  console.log('vectorize button:', await apply.innerText());
  await apply.click();
  await page.waitForTimeout(6000);
  await page.screenshot({ path: out('05-vectorized.png') });
}

console.log('ERRORS:', errors.length ? `\n${errors.join('\n')}` : 'none');
await browser.close();
