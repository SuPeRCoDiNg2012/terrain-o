import { chromium } from 'playwright';
import path from 'node:path';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addInitScript(() => localStorage.setItem('terrain-o:onboarding-v1', 'seen'));
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });
await page.locator('[data-testid="file-input"]').setInputFiles([
  path.resolve('e2e/fixtures/alpine.png'),
  path.resolve('e2e/fixtures/alpine.jgw'),
]);
await page.waitForFunction(() => document.body.innerText.includes('800 × 600'), null, { timeout: 30000 });
const tool = () => page.locator('.status-bar-pro').innerText().then(t => (t.match(/STRUMENTO\n([^\n]+)/)?.[1] ?? t.slice(0, 80)));
await page.getByRole('tab', { name: 'Elementi' }).click();
const count = () => page.locator('.feature-row').count();
console.log('start tool', await tool(), 'features', await count());
await page.mouse.move(600, 400);
await page.keyboard.press('p');
await page.waitForTimeout(200);
console.log('after p tool', await tool());
const box = await page.locator('.map-surface').boundingBox();
await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.6);
await page.waitForTimeout(400);
console.log('after click tool', await tool(), 'features', await count());
await page.screenshot({ path: 'screenshots/91-point.png' });
console.log('errors', errors);
await browser.close();
