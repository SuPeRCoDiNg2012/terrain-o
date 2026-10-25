import { chromium } from 'playwright';
import path from 'node:path';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addInitScript(() => localStorage.setItem('terrain-o:onboarding-v1', 'seen'));
const page = await context.newPage();
page.on('console', (m) => console.log('CONSOLE', m.type(), m.text()));
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });
await page.locator('[data-testid="file-input"]').setInputFiles([
  path.resolve('.ref/fixtures/alpine.png'),
  path.resolve('.ref/fixtures/alpine.jgw'),
]);
await page.waitForTimeout(3000);
console.log('image loaded?', await page.evaluate(() => document.body.innerText.includes('800 × 600')));
await page.getByRole('tab', { name: 'Classificazione' }).click();
await page.waitForTimeout(800);
console.log('panel:', (await page.locator('.dock-right').innerText()).slice(0, 1200));
await page.getByRole('button', { name: 'Applica classificazione' }).click();
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(2000);
  const text = await page.locator('.dock-right').innerText();
  console.log('--- t', (i + 1) * 2, 's ---');
  console.log(text.slice(0, 1200));
  if (text.includes('Ultimo risultato applicato')) break;
}
await page.screenshot({ path: 'screenshots/72-classified-debug.png' });
await browser.close();
