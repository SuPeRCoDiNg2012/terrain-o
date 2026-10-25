import { chromium } from 'playwright';
import path from 'node:path';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
await context.addInitScript(() => localStorage.setItem('terrain-o:onboarding-v1', 'seen'));
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGE: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push('CON: ' + m.text()); });
await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });
await page.locator('[data-testid="file-input"]').setInputFiles([path.resolve('e2e/fixtures/alpine.png'), path.resolve('e2e/fixtures/alpine.jgw')]);
await page.waitForFunction(() => document.body.innerText.includes('800 × 600'), null, { timeout: 30000 });
await page.waitForTimeout(500);
const stage = await page.locator('.map-stage').boundingBox();
console.log('stage', stage);
async function chooseTool(key, testid) {
  await page.keyboard.press(key);
  await page.waitForTimeout(150);
  console.log('tool', testid, await page.getByTestId(testid).getAttribute('aria-pressed'));
}
await chooseTool('a', 'tool-draw-area');
const cx = stage.x + stage.width/2, cy = stage.y + stage.height/2;
for (const [dx,dy] of [[-60,-40],[60,-40],[60,40],[-60,40]]) await page.mouse.click(cx+dx, cy+dy);
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
console.log('after polygon status:', (await page.locator('.status-bar').innerText()).replace(/\n/g,' | ').slice(0,200));
console.log('inspector:', (await page.locator('.dock-right').innerText()).split('\n').filter(l=>/Origine|area|Area|verific/i.test(l)).slice(0,6).join(' | '));
// select tool click inside polygon
await chooseTool('v', 'tool-select');
await page.mouse.click(cx, cy);
await page.waitForTimeout(300);
console.log('selected:', (await page.locator('.status-bar').innerText()).replace(/\n/g,' | ').slice(0,200));
console.log('props origin:', (await page.locator('.dock-right').innerText()).split('\n').filter(l=>/Origine/.test(l)).join(' | '));
// undo
await page.keyboard.press('Control+z');
await page.waitForTimeout(300);
console.log('after undo status:', (await page.locator('.status-bar').innerText()).replace(/\n/g,' | ').slice(0,160));
// classification via menu
await page.getByRole('menuitem', { name: 'Classificazione' }).click();
await page.getByRole('menuitem', { name: 'Esegui con i parametri correnti' }).click();
await page.waitForFunction(() => /%|Risultato|classificazione/i.test(document.body.innerText), null, { timeout: 5000 }).catch(()=>{});
await page.waitForTimeout(12000);
console.log('classify panel text:', (await page.locator('.dock-right').innerText()).split('\n').filter(l=>/classific|%|elementi|Zona|veget/i.test(l)).slice(0,10).join(' | '));
console.log('errors:', errors.length ? [...new Set(errors)].slice(0,8) : 'none');
await page.screenshot({ path: 'screenshots/122-functional.png' });
await browser.close();
