import { chromium } from 'playwright';
import fs from 'node:fs';
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

// draw area + line and a course point
await page.keyboard.press('a');
for (const [x, y] of [[0.3, 0.3], [0.55, 0.3], [0.55, 0.55], [0.3, 0.55]]) await page.mouse.click(at(x, y).x, at(x, y).y);
await page.keyboard.press('Enter');
await page.keyboard.press('n');
for (const [x, y] of [[0.62, 0.35], [0.7, 0.45], [0.78, 0.55]]) await page.mouse.click(at(x, y).x, at(x, y).y);
await page.keyboard.press('Enter');
await page.keyboard.press('p');
await page.mouse.click(at(0.45, 0.7).x, at(0.45, 0.7).y);
await page.waitForTimeout(800);

// export project
await page.locator('.menu-icon-button[aria-label="Esporta"]').click();
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-project').click()]);
const filePath = path.resolve('screenshots/export-project.terrain-o.json');
await dl.saveAs(filePath);
console.log('project file size', fs.statSync(filePath).size);
await page.keyboard.press('Escape');

// reload fresh context (no local db) and import the project json
const ctx2 = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx2.addInitScript(() => localStorage.setItem('terrain-o:onboarding-v1', 'seen'));
const page2 = await ctx2.newPage();
page2.on('console', (m) => { if (m.type() === 'error') errors.push(`ctx2 console: ${m.text()}`); });
page2.on('pageerror', (e) => errors.push(`ctx2 pageerror: ${e.message}`));
await page2.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });
await page2.locator('[data-testid="file-input"]').setInputFiles([filePath]);
await page2.waitForTimeout(4000);
await page2.getByRole('tab', { name: 'Elementi' }).click();
await page2.waitForTimeout(500);
console.log('imported features:', await page2.locator('.feature-row').count());
console.log('image restored:', (await page2.locator('body').innerText()).includes('800 × 600'));
await page2.screenshot({ path: 'screenshots/98-imported-project.png' });

// GPX export now that a control exists
await page2.locator('.menu-icon-button[aria-label="Esporta"]').click();
const [gpx] = await Promise.all([page2.waitForEvent('download'), page2.getByTestId('export-gpx').click()]);
const gpxPath = path.resolve('screenshots/export-course.gpx');
await gpx.saveAs(gpxPath);
console.log('gpx bytes', fs.statSync(gpxPath).size, fs.readFileSync(gpxPath, 'utf8').slice(0, 200).replace(/\n/g, ' '));
await page2.keyboard.press('Escape');
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
