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
// classification via menu
await page.getByRole('menuitem', { name: 'Classificazione' }).click();
await page.getByRole('menuitem', { name: 'Esegui con i parametri correnti' }).click();
await page.waitForTimeout(12000);
// vectorize panel
const tabs = page.locator('.dock-right [role="tab"]');
console.log('right tabs:', await tabs.allInnerTexts());
await page.getByRole('tab', { name: /Vettor/i }).click();
await page.waitForTimeout(400);
const panel = page.locator('.dock-right');
console.log('vector panel head:', (await panel.innerText()).split('\n').filter(l=>/sperimentale|poligon|fori|scart|Confidenza|Applica/i.test(l)).slice(0,15).join(' | '));
// find apply button
const apply = panel.getByRole('button', { name: /Applica/i }).first();
console.log('apply count', await panel.getByRole('button', { name: /Applica/i }).count(), 'disabled', await apply.isDisabled());
await apply.click();
await page.waitForTimeout(15000);
console.log('after apply:', (await panel.innerText()).split('\n').filter(l=>/poligon|fori|scart|element|Elementi|Applicat|errore|Errore|%/.test(l)).slice(0,12).join(' | '));
console.log('status:', (await page.locator('.status-bar').innerText()).replace(/\n/g,' | ').slice(0,180));
// export dialog
await page.keyboard.press('Control+e');
await page.waitForTimeout(700);
console.log('dialog:', (await page.locator('.dialog-panel').innerText()).split('\n').slice(0,14).join(' | '));
await page.screenshot({ path: 'screenshots/123-vector-export.png' });
console.log('errors:', errors.length ? [...new Set(errors)].slice(0,8) : 'none');
await browser.close();
