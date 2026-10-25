import { chromium } from 'playwright';
import path from 'node:path';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
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

// Legend, grid, rulers via menu
async function menu(menuName, itemName) {
  await page.locator('.menu-bar').getByRole('menuitem', { name: menuName, exact: true }).click();
  await page.waitForTimeout(150);
  const item = page.getByRole('menuitemcheckbox', { name: new RegExp(itemName) }).or(page.getByRole('menuitem', { name: new RegExp(itemName) })).first();
  if (!(await item.count())) { console.log('MENU ITEM MISSING', menuName, itemName); await page.keyboard.press('Escape'); return false; }
  const disabled = await item.getAttribute('aria-disabled');
  await item.click();
  await page.waitForTimeout(300);
  return !disabled;
}
console.log('legend toggle ->', await menu('Visualizza', 'Legenda'), 'visible', await page.locator('.map-legend').count());
console.log('legend off ->', await menu('Visualizza', 'Legenda'), 'visible', await page.locator('.map-legend').count());
console.log('grid toggle ->', await menu('Visualizza', 'Griglia'));
console.log('rulers toggle ->', await menu('Visualizza', 'Righell'));
console.log('crosshair ->', await menu('Visualizza', 'Mirino'));

// Panel collapse + drag tab
const layersTab = page.getByRole('tab', { name: 'Livelli', exact: true }).first();
await layersTab.dblclick();
await page.waitForTimeout(300);
console.log('collapsed classes:', await page.locator('.dock-right').getAttribute('class'));
await page.locator('.dock-right .dock-collapsed-label').click();
await page.waitForTimeout(300);

// panel drag from right to left
const propsTab = page.getByRole('tab', { name: 'Proprietà', exact: true }).first();
const leftDock = page.locator('.dock-left');
const target = await leftDock.boundingBox();
await propsTab.dragTo(leftDock, { targetPosition: { x: 40, y: 40 } });
await page.waitForTimeout(500);
console.log('left dock tabs after drag:', (await page.locator('.dock-left .dock-tabs').innerText()).replace(/\n/g, ','));
console.log('right dock tabs after drag:', (await page.locator('.dock-right .dock-tabs').innerText()).replace(/\n/g, ','));

// zoom wheel over map
const beforeZoom = await page.locator('.status-bar-pro').innerText();
await page.mouse.move(at(0.5, 0.5).x, at(0.5, 0.5).y);
await page.mouse.wheel(0, -300);
await page.waitForTimeout(300);
const afterZoom = await page.locator('.status-bar-pro').innerText();
console.log('wheel zoom changed:', beforeZoom.match(/ZOOM\n([^\n]+)/)?.[1], '->', afterZoom.match(/ZOOM\n([^\n]+)/)?.[1]);

// pan with space + drag
await page.keyboard.down('Space');
await page.mouse.move(at(0.5, 0.5).x, at(0.5, 0.5).y);
await page.mouse.down();
await page.mouse.move(at(0.6, 0.6).x, at(0.6, 0.6).y, { steps: 6 });
await page.mouse.up();
await page.keyboard.up('Space');
console.log('pan ok, cursor:', (await page.locator('.status-bar-pro').innerText()).split('\n')[0]);

// eyedropper
await page.keyboard.press('i');
await page.mouse.click(at(0.4, 0.4).x, at(0.4, 0.4).y);
await page.waitForTimeout(500);
console.log('eyedropper info:', (await page.locator('.toast-host').innerText().catch(() => 'no toast')).replace(/\n+/g, ' | ').slice(0, 200));

// lasso + marquee freehand
await page.keyboard.press('l');
await page.mouse.move(at(0.25, 0.25).x, at(0.25, 0.25).y);
await page.mouse.down();
for (let i = 0; i <= 12; i++) {
  const a = (i / 12) * Math.PI * 2;
  await page.mouse.move(at(0.4 + Math.cos(a) * 0.12, 0.42 + Math.sin(a) * 0.12).x, at(0.4 + Math.cos(a) * 0.12, 0.42 + Math.sin(a) * 0.12).y);
}
await page.mouse.up();
await page.waitForTimeout(400);
console.log('lasso status:', (await page.locator('.status-bar-pro').innerText()).replace(/\n/g, ' | '));

// save + reload persistence
await page.keyboard.press('Control+s');
await page.waitForTimeout(1200);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
console.log('after reload image:', (await page.locator('body').innerText()).includes('800 × 600'));
console.log('after reload layout right tabs:', (await page.locator('.dock-right .dock-tabs').innerText()).replace(/\n/g, ','));

await page.screenshot({ path: 'screenshots/94-shell.png' });
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
