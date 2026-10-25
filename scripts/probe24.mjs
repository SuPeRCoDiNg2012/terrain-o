import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
const browser = await chromium.launch();
for (const [label, viewport, mobile] of [['desktop', { width: 1600, height: 1000 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  await context.addInitScript(() => localStorage.setItem('terrain-o:onboarding-v1', 'seen'));
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });
  const empty = await new AxeBuilder({ page }).withTags(['wcag2aa', 'wcag21aa']).analyze();
  console.log(`--- ${label} empty: ${empty.violations.length} violations`);
  for (const v of empty.violations) console.log(v.impact, v.id, v.nodes.length, v.help);
  await page.locator('[data-testid="file-input"]').setInputFiles([path.resolve('e2e/fixtures/alpine.png'), path.resolve('e2e/fixtures/alpine.jgw')]);
  await page.waitForTimeout(3000);
  await page.getByRole('tab', { name: 'Classificazione' }).click().catch(() => {});
  await page.waitForTimeout(500);
  const loaded = await new AxeBuilder({ page }).withTags(['wcag2aa', 'wcag21aa']).analyze();
  console.log(`--- ${label} loaded: ${loaded.violations.length} violations`);
  for (const v of loaded.violations) console.log(v.impact, v.id, v.nodes.length, v.help, '|', v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' ; '));
  await context.close();
}
await browser.close();
