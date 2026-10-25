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
async function audit(label) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2aa', 'wcag21aa']).analyze();
  console.log(label, '->', r.violations.length ? r.violations.map(v => v.id + '(' + v.nodes.length + ')').join(', ') : 'ok');
  for (const v of r.violations) for (const n of v.nodes.slice(0, 2)) console.log('  ', n.target.join(' '), '::', n.any[0]?.message);
}
await page.keyboard.press('F1');
await page.waitForTimeout(400);
await audit('help');
await page.keyboard.press('Escape');
await page.locator('.menu-icon-button[aria-label="Esporta"]').click();
await page.waitForTimeout(400);
await audit('export');
await page.keyboard.press('Escape');
// verify dialog
const box = await page.locator('.map-surface').boundingBox();
await page.keyboard.press('a');
for (const [x, y] of [[0.3, 0.3], [0.5, 0.3], [0.5, 0.5], [0.3, 0.5]]) await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
await page.keyboard.press('Enter');
await page.keyboard.press('v');
await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
await page.getByRole('tab', { name: 'Proprietà' }).click();
await page.getByTestId('verify-button').click();
await page.waitForTimeout(400);
await audit('verify dialog');
await page.getByTestId('dialog-cancel').click();
// onboarding fresh
const ctx2 = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const p2 = await ctx2.newPage();
await p2.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });
await p2.waitForTimeout(600);
const r2 = await new AxeBuilder({ page: p2 }).withTags(['wcag2aa', 'wcag21aa']).analyze();
console.log('onboarding ->', r2.violations.length ? r2.violations.map(v => v.id + '(' + v.nodes.length + ')').join(', ') : 'ok');
for (const v of r2.violations) for (const n of v.nodes.slice(0, 2)) console.log('  ', n.target.join(' '), '::', n.any[0]?.message);
await browser.close();
