import { chromium } from 'playwright';
import path from 'node:path';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addInitScript(() => localStorage.setItem('terrain-o:onboarding-v1', 'seen'));
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGE: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push('CON: ' + m.text()); });
let queried = 0;
await page.route('**/api/interpreter*', async (route) => {
  queried++;
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ elements: [
    { type: 'way', id: 1234, tags: { highway: 'track', name: 'Mulattiera di prova' }, geometry: [ { lat: 47.2802, lon: 11.3601 }, { lat: 47.2805, lon: 11.3605 }, { lat: 47.2810, lon: 11.3608 } ] },
    { type: 'way', id: 5678, tags: { waterway: 'stream' }, geometry: [ { lat: 47.2800, lon: 11.3598 }, { lat: 47.2808, lon: 11.3602 } ] }
  ] }) });
});
await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });
await page.locator('[data-testid="file-input"]').setInputFiles([path.resolve('e2e/fixtures/alpine.png'), path.resolve('e2e/fixtures/alpine.jgw')]);
await page.waitForFunction(() => document.body.innerText.includes('800 × 600'), null, { timeout: 30000 });
await page.getByRole('tab', { name: 'OSM' }).click();
await page.getByTestId('fetch-osm').click();
await page.waitForTimeout(3000);
const panel = page.locator('.dock-left');
console.log('queried:', queried);
console.log('panel:', (await panel.innerText()).split('\n').filter(l=>/Tracciati|Strade|Corsi|Convertiti|riuscit|tracciati/i.test(l)).slice(0,10).join(' | '));
await panel.getByRole('button', { name: /Converti in elementi/i }).click();
await page.waitForTimeout(600);
console.log('after convert status:', (await page.locator('.status-bar').innerText()).replace(/\n/g,' | ').slice(0,160));
console.log('features layer:', (await page.locator('.dock-right').innerText()).split('\n').filter(l=>/elementi|tracciati/i.test(l)).slice(0,4).join(' | '));
console.log('errors:', errors.length ? [...new Set(errors)].slice(0,6) : 'none');
await browser.close();
