import { chromium } from 'playwright';
import path from 'node:path';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addInitScript(() => localStorage.setItem('terrain-o:onboarding-v1', 'seen'));
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });
await page.locator('[data-testid="file-input"]').setInputFiles([path.resolve('e2e/fixtures/alpine.png'), path.resolve('e2e/fixtures/alpine.jgw')]);
await page.waitForFunction(() => document.body.innerText.includes('800 × 600'), null, { timeout: 30000 });
const box = await page.locator('.map-surface').boundingBox();
const at = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
const status = async () => (await page.locator('.status-bar-pro').innerText()).replace(/\n/g, ' | ');
const rows = () => page.locator('.feature-row').count();
async function drawArea(points) {
  await page.keyboard.press('a');
  for (const [x, y] of points) await page.mouse.click(at(x, y).x, at(x, y).y);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
}
await drawArea([[0.25, 0.25], [0.4, 0.25], [0.4, 0.4], [0.25, 0.4]]);
await drawArea([[0.5, 0.25], [0.65, 0.25], [0.65, 0.4], [0.5, 0.4]]);
await page.getByRole('tab', { name: 'Elementi' }).click();
console.log('rows after two areas:', await rows());
await page.keyboard.press('Control+a');
await page.waitForTimeout(300);
console.log('after Ctrl+A:', await status());
await page.keyboard.press('Control+Shift+d');
await page.waitForTimeout(500);
console.log('after duplicate:', await status(), 'rows', await rows());
await page.keyboard.press('Control+d');
await page.waitForTimeout(200);
console.log('after deselect:', await status());

// bracket keys with selection tool
await page.keyboard.press('v');
const tolerance = () => page.locator('.options-tolerance').innerText().catch(() => 'n/a');
console.log('tolerance before:', (await tolerance()).replace(/\n/g, ' '));
await page.keyboard.press(']');
await page.keyboard.press(']');
await page.waitForTimeout(200);
console.log('tolerance after ]]', (await tolerance()).replace(/\n/g, ' '));
await page.keyboard.press('[');
await page.waitForTimeout(200);
console.log('tolerance after [', (await tolerance()).replace(/\n/g, ' '));

// line tool bracket offset
await page.keyboard.press('n');
await page.waitForTimeout(200);
const offset = () => page.locator('.options-field').filter({ hasText: 'Offset linea' }).innerText().catch(() => 'n/a');
console.log('offset before:', (await offset()).replace(/\n/g, ' '));
await page.keyboard.press(']');
await page.waitForTimeout(200);
console.log('offset after ]:', (await offset()).replace(/\n/g, ' '));

// lasso polygon
await page.keyboard.press('l');
await page.waitForTimeout(200);
const polyToggle = page.locator('.options-toggle').filter({ hasText: 'Poligonale' });
if (await polyToggle.count()) { await polyToggle.click(); }
for (const [x, y] of [[0.22, 0.22], [0.42, 0.22], [0.42, 0.42], [0.22, 0.42]]) await page.mouse.click(at(x, y).x, at(x, y).y);
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
console.log('after polygon lasso:', await status());

// grid render
await page.getByRole('tab', { name: 'Progetto' }).click();
await page.waitForTimeout(200);
const gridToggle = page.locator('.options-toggle').filter({ hasText: 'Griglia' });
const gridPressed = await gridToggle.getAttribute('aria-pressed');
if (gridPressed !== 'true') await gridToggle.click();
await page.waitForTimeout(500);
console.log('grid pressed:', await gridToggle.getAttribute('aria-pressed'));
await page.screenshot({ path: 'screenshots/103-grid.png' });

// ruler units
await page.locator('select[aria-label="Unità dei righelli"]').selectOption('m');
await page.waitForTimeout(300);
console.log('ruler m labels:', (await page.locator('.ruler-tick-x b').first().innerText().catch(() => 'n/a')));
await page.locator('select[aria-label="Unità dei righelli"]').selectOption('deg');
await page.waitForTimeout(300);
console.log('ruler deg labels:', (await page.locator('.ruler-tick-x b').first().innerText().catch(() => 'n/a')));

// delete via menu shows confirmation
await page.keyboard.press('v');
await page.mouse.click(at(0.3, 0.3).x, at(0.3, 0.3).y);
await page.waitForTimeout(300);
await page.locator('.menu-bar').getByRole('menuitem', { name: 'Modifica' }).click();
await page.getByRole('menuitem', { name: 'Elimina selezione' }).click();
await page.waitForTimeout(400);
console.log('delete dialog:', await page.locator('[role="dialog"]').innerText().then(t => t.replace(/\n+/g, ' | ').slice(0, 120)).catch(() => 'NONE'));
await page.getByTestId('dialog-cancel').click();

// reset layout
await page.locator('.menu-bar').getByRole('menuitem', { name: 'Visualizza' }).click();
await page.getByRole('menuitem', { name: 'Reimposta layout pannelli' }).click();
await page.waitForTimeout(600);
console.log('layout after reset right tabs:', (await page.locator('.dock-right .dock-tabs').innerText()).replace(/\n/g, ','));
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
