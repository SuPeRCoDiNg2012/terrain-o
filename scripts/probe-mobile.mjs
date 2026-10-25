import { chromium } from 'playwright';
import path from 'node:path';

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
await context.addInitScript(() => localStorage.setItem('terrain-o:onboarding-v1', 'seen'));
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));

await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid="app-shell"]');
console.log('device attr:', await page.locator('[data-testid="app-shell"]').getAttribute('data-device'));
console.log('mobile toggle visible:', await page.locator('.menu-mobile-toggle').isVisible());
console.log('menu items visible closed:', await page.locator('.menu-bar-items').isVisible());
console.log('tool palette box:', await page.locator('.tool-palette').boundingBox());
console.log('map box:', await page.locator('.map-stage').boundingBox());
await page.screenshot({ path: 'screenshots/80-mobile-initial.png' });

// Open the menu sheet and one submenu.
await page.locator('.menu-mobile-toggle').click();
await page.waitForTimeout(250);
console.log('menu items visible open:', await page.locator('.menu-bar-items').isVisible());
await page.getByRole('menuitem', { name: 'File' }).click();
await page.waitForTimeout(200);
console.log('file popup visible:', await page.getByRole('menu', { name: 'File' }).isVisible());
await page.screenshot({ path: 'screenshots/81-mobile-menu.png' });
await page.locator('.menu-mobile-close').click();

// Import through the hidden file input.
await page.locator('[data-testid="file-input"]').setInputFiles([
  path.resolve('.ref/fixtures/alpine.png'),
  path.resolve('.ref/fixtures/alpine.jgw'),
]);
await page.waitForTimeout(2500);
await page.screenshot({ path: 'screenshots/82-mobile-imported.png' });

// Open left and right drawers.
await page.locator('.mobile-panel-button.mobile-left').click();
await page.waitForTimeout(300);
console.log('left drawer open:', await page.locator('.dock-left').evaluate((el) => el.classList.contains('mobile-open')));
console.log('scrim visible:', await page.locator('.mobile-scrim').isVisible());
await page.screenshot({ path: 'screenshots/83-mobile-project-drawer.png' });
await page.locator('.mobile-scrim').click({ position: { x: 370, y: 500 } });
await page.waitForTimeout(250);
await page.locator('.mobile-panel-button.mobile-right').click();
await page.waitForTimeout(300);
console.log('right drawer open:', await page.locator('.dock-right').evaluate((el) => el.classList.contains('mobile-open')));
await page.screenshot({ path: 'screenshots/84-mobile-layers-drawer.png' });
await page.locator('.dock-right .dock-mobile-close').click();

// Pinch-like zoom via wheel still works on desktop emulation; tool tap works.
const tools = await page.locator('.palette-tool').count();
console.log('palette tools:', tools);
await page.locator('[data-testid="tool-draw-area"]').click();
console.log('active tool:', await page.locator('.options-tool-name strong').innerText());
await page.screenshot({ path: 'screenshots/85-mobile-tool-active.png' });

console.log('ERRORS', JSON.stringify(errors, null, 2));
await browser.close();
