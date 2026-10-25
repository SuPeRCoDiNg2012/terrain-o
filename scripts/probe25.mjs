import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addInitScript(() => localStorage.setItem('terrain-o:onboarding-v1', 'seen'));
const page = await context.newPage();
await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });
async function report(label) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2aa', 'wcag21aa']).analyze();
  console.log(`--- ${label}`);
  for (const v of r.violations) {
    for (const n of v.nodes) console.log(n.target.join(' '), '::', n.any.map(a => a.message).join(' | ').slice(0, 220));
  }
}
await report('empty');
await page.locator('[data-testid="file-input"]').setInputFiles([path.resolve('e2e/fixtures/alpine.png'), path.resolve('e2e/fixtures/alpine.jgw')]);
await page.waitForTimeout(3000);
await page.getByRole('tab', { name: 'Classificazione' }).click();
await page.waitForTimeout(500);
await report('loaded');
await browser.close();
