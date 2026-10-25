import { chromium } from 'playwright';
import path from 'node:path';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addInitScript(() => localStorage.setItem('terrain-o:onboarding-v1', 'seen'));
const page = await context.newPage();
await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });
await page.locator('[data-testid="file-input"]').setInputFiles([path.resolve('e2e/fixtures/alpine.png'), path.resolve('e2e/fixtures/alpine.jgw')]);
await page.waitForFunction(() => document.body.innerText.includes('800 × 600'), null, { timeout: 30000 });
const info = await page.evaluate(() => {
  const dock = document.querySelector('.dock-right');
  const head = dock?.querySelector('.dock-head');
  const tabs = [...(dock?.querySelectorAll('.dock-tab') ?? [])];
  return { head: head?.getBoundingClientRect().toJSON(), tabs: tabs.map(t => ({ text: t.textContent, r: t.getBoundingClientRect().toJSON() })), scroll: dock?.querySelector('.dock-tabs')?.scrollWidth, client: dock?.querySelector('.dock-tabs')?.clientWidth };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
