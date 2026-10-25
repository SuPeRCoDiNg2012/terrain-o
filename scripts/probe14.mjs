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
await page.locator('[data-testid="file-input"]').setInputFiles([path.resolve('e2e/fixtures/alpine.png'), path.resolve('e2e/fixtures/alpine.jgw')]);
await page.waitForFunction(() => document.body.innerText.includes('800 × 600'), null, { timeout: 30000 });
await page.waitForTimeout(2500);
console.log('image card before:', (await page.locator('.image-card').innerText()).replace(/\n+/g,' | ').slice(0,200));
await page.keyboard.press('Control+s');
await page.waitForTimeout(2000);
console.log('save status:', (await page.locator('.status-bar-pro').innerText()).replace(/\n/g,' | '));
await page.reload({ waitUntil: 'networkidle' });
for (const wait of [1000, 2000, 4000]) {
  await page.waitForTimeout(wait);
  console.log(`after reload +${wait}:`, (await page.locator('body').innerText()).includes('800 × 600'), '| imageCard', await page.locator('.image-card').count(), '|', (await page.locator('.image-card').innerText().catch(()=>'')).replace(/\n+/g,' | ').slice(0,120));
}
// check indexeddb projects
console.log('projects in db:', await page.evaluate(async () => {
  const dbs = await indexedDB.databases();
  return dbs.map(d => d.name).join(',');
}));

// eyedropper sample and Info panel
await page.getByRole('tab', { name: 'Info' }).click();
const box = await page.locator('.map-surface').boundingBox();
await page.keyboard.press('i');
await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
await page.waitForTimeout(400);
console.log('info panel after sample:', (await page.locator('.dock-right').innerText()).replace(/\n+/g,' | ').slice(0,500));
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
