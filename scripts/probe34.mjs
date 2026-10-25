import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addInitScript(() => localStorage.setItem('terrain-o:onboarding-v1', 'seen'));
const page = await context.newPage();
await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });
await page.locator('[data-testid="file-input"]').setInputFiles([path.resolve('e2e/fixtures/alpine.png'), path.resolve('e2e/fixtures/alpine.jgw')]);
await page.waitForFunction(() => document.body.innerText.includes('800 × 600'), null, { timeout: 30000 });
await page.getByRole('tab', { name: 'Classificazione' }).click();
await page.getByRole('button', { name: 'Applica classificazione' }).click();
await page.locator('.stats-block').waitFor({ state: 'visible', timeout: 90000 });
await page.getByRole('tab', { name: 'Vettoriz.' }).click();
await page.getByRole('button', { name: 'Applica come livelli auto' }).click();
await page.getByTestId('dialog-confirm').click();
await page.waitForTimeout(5000);
await page.getByRole('tab', { name: 'Elementi' }).click();
await page.waitForTimeout(500);
const first = page.locator('.feature-row').first();
if (await first.count()) {
  await first.locator('.feature-select').click();
  await page.waitForTimeout(400);
}
async function audit(label) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2aa', 'wcag21aa']).analyze();
  console.log(label, '->', r.violations.length ? r.violations.map(v => v.id + '(' + v.nodes.length + ')').join(', ') : 'ok');
  for (const v of r.violations) for (const n of v.nodes.slice(0, 3)) console.log('  ', n.target.join(' '), '::', n.any[0]?.message);
}
for (const name of ['Elementi', 'Proprietà', 'Livelli', 'Classificazione', 'Info']) {
  await page.getByRole('tab', { name, exact: true }).first().click();
  await page.waitForTimeout(300);
  await audit(name);
}
await browser.close();
