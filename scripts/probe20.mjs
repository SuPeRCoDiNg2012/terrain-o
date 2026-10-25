import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const browser = await chromium.launch();
const maker = await browser.newPage({ viewport: { width: 600, height: 400 } });
await maker.setContent('<canvas id="c" width="5000" height="600"></canvas>');
const dataUrl = await maker.evaluate(() => {
  const c = document.getElementById('c');
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 5000, 600);
  g.addColorStop(0, '#3f6b3a');
  g.addColorStop(0.5, '#a08a3c');
  g.addColorStop(1, '#2b6cb0');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 5000, 600);
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 50; i++) ctx.fillRect(i * 100, 100, 40, 400);
  return c.toDataURL('image/png');
});
const png = Buffer.from(dataUrl.split(',')[1], 'base64');
fs.writeFileSync('screenshots/large.png', png);
fs.copyFileSync(path.resolve('e2e/fixtures/alpine.jgw'), 'screenshots/large.jgw');
console.log('generated', Math.round(png.length / 1024), 'KB');

const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addInitScript(() => localStorage.setItem('terrain-o:onboarding-v1', 'seen'));
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });
await page.locator('[data-testid="file-input"]').setInputFiles([path.resolve('screenshots/large.png'), path.resolve('screenshots/large.jgw')]);
await page.waitForTimeout(1200);
const dialogText = await page.locator('[role="dialog"]').innerText().catch(() => 'NO DIALOG');
console.log('dialog:', dialogText.replace(/\n+/g, ' | ').slice(0, 240));
if (await page.getByTestId('dialog-confirm').count()) {
  await page.getByTestId('dialog-confirm').click();
}
await page.waitForTimeout(5000);
console.log('image card:', (await page.locator('.image-card').innerText().catch(() => 'none')).replace(/\n+/g, ' | '));
console.log('status:', (await page.locator('.status-bar-pro').innerText()).replace(/\n/g, ' | ').slice(0, 200));
console.log('map present:', await page.locator('.map-surface').isVisible());
await page.screenshot({ path: 'screenshots/102-large.png' });
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
