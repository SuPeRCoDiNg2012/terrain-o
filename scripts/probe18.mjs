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
const box = await page.locator('.map-surface').boundingBox();
const at = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
// draw area
await page.keyboard.press('a');
for (const [x, y] of [[0.3, 0.3], [0.55, 0.3], [0.55, 0.55], [0.3, 0.55]]) await page.mouse.click(at(x, y).x, at(x, y).y);
await page.keyboard.press('Enter');
await page.getByRole('tab', { name: 'Proprietà' }).click();
// select and read geometry
await page.keyboard.press('v');
await page.mouse.click(at(0.4, 0.4).x, at(0.4, 0.4).y);
await page.waitForTimeout(300);
const geom = () => page.locator('.dock-right').innerText().then(t => t.match(/Geometria\n([^\n]+)/)?.[1]);
console.log('geometry before:', await geom());
// drag top-left vertex
await page.mouse.move(at(0.3, 0.3).x, at(0.3, 0.3).y);
await page.mouse.down();
await page.mouse.move(at(0.35, 0.28).x, at(0.35, 0.28).y, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(600);
console.log('geometry after vertex drag:', await geom());
await page.screenshot({ path: 'screenshots/100-vertex.png' });
// double click on edge midpoint to add vertex (expect 5)
await page.mouse.dblclick(at(0.45, 0.3).x, at(0.45, 0.3).y);
await page.waitForTimeout(500);
console.log('geometry after edge dblclick:', await geom());
// drag whole polygon by inside drag
const before = await geom();
await page.mouse.move(at(0.42, 0.42).x, at(0.42, 0.42).y);
await page.mouse.down();
await page.mouse.move(at(0.47, 0.47).x, at(0.47, 0.47).y, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(500);
console.log('geometry after move:', await geom(), '(before', before, ')');
// delete vertex? select vertex and press Delete is ambiguous; skip
console.log('undo/redo:', (await page.locator('.status-bar-pro').innerText()).replace(/\n/g,' | '));
await page.keyboard.press('Control+z');
await page.waitForTimeout(400);
console.log('geometry after undo:', await geom());
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
