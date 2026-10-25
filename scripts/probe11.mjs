import { chromium } from 'playwright';
import path from 'node:path';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
await context.addInitScript(() => localStorage.setItem('terrain-o:onboarding-v1', 'seen'));
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });
await page.locator('[data-testid="file-input"]').setInputFiles([
  path.resolve('e2e/fixtures/alpine.png'),
  path.resolve('e2e/fixtures/alpine.jgw'),
]);
await page.waitForFunction(() => document.body.innerText.includes('800 × 600'), null, { timeout: 30000 });
const box = await page.locator('.map-surface').boundingBox();
const at = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
const status = async () => (await page.locator('.status-bar-pro').innerText()).replace(/\n/g, ' | ');
const rows = () => page.locator('.feature-row').count();

// draw area
await page.keyboard.press('a');
for (const [x, y] of [[0.3, 0.3], [0.55, 0.3], [0.55, 0.55], [0.3, 0.55]]) await page.mouse.click(at(x, y).x, at(x, y).y);
await page.keyboard.press('Enter');
await page.getByRole('tab', { name: 'Elementi' }).click();
await page.waitForTimeout(300);
console.log('features after area:', await rows());

// select it
await page.keyboard.press('v');
await page.mouse.click(at(0.4, 0.4).x, at(0.4, 0.4).y);
await page.getByRole('tab', { name: 'Proprietà' }).click();
console.log('provenance line:', (await page.locator('.dock-right').innerText()).match(/Origine:[^\n]+/)?.[0]);

// verify
await page.getByTestId('verify-button').click();
await page.waitForTimeout(300);
console.log('verify dialog:', await page.getByTestId('verify-declaration').count());
await page.locator('#verify-note').fill('controllato sul campo');
await page.getByTestId('verify-declaration').check();
await page.getByTestId('dialog-confirm').click();
await page.waitForTimeout(600);
console.log('after verify:', (await status()));
console.log('provenance after verify:', (await page.locator('.dock-right').innerText()).match(/Origine:[^\n]+/)?.[0]);
await page.screenshot({ path: 'screenshots/92-verified.png' });

// nudge to revoke
await page.mouse.move(at(0.4, 0.4).x, at(0.4, 0.4).y);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(500);
console.log('after nudge:', (await status()));
console.log('provenance after nudge:', (await page.locator('.dock-right').innerText()).match(/Origine:[^\n]+/)?.[0]);

// undo/redo
await page.keyboard.press('Control+z');
await page.waitForTimeout(400);
console.log('undo provenance:', (await page.locator('.dock-right').innerText()).match(/Origine:[^\n]+/)?.[0]);

// history panel
await page.getByRole('tab', { name: 'Storia' }).click();
await page.waitForTimeout(200);
console.log('history:', (await page.locator('.dock-right').innerText()).replace(/\n+/g, ' | ').slice(0, 300));

// export all formats
for (const name of ['PNG', 'PDF', 'SVG', 'GeoJSON', 'OMAP', 'GPX', 'KML']) {
  await page.locator('.menu-icon-button[aria-label="Esporta"]').click();
  await page.waitForTimeout(250);
  const btn = page.getByRole('button', { name: new RegExp(`^${name}$`, 'i') }).first();
  if (!(await btn.count())) { console.log('EXPORT BUTTON MISSING', name); await page.keyboard.press('Escape'); continue; }
  try {
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), btn.click()]);
    console.log('EXPORT', name, '->', download.suggestedFilename());
    await page.keyboard.press('Escape');
  } catch (e) {
    console.log('EXPORT FAIL', name, String(e).slice(0, 200));
    await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(200);
}
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
