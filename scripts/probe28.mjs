import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addInitScript(() => localStorage.setItem('terrain-o:onboarding-v1', 'seen'));
const page = await context.newPage();
await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });
await page.locator('[data-testid="file-input"]').setInputFiles([path.resolve('e2e/fixtures/alpine.png'), path.resolve('e2e/fixtures/alpine.jgw')]);
await page.waitForFunction(() => document.body.innerText.includes('800 × 600'), null, { timeout: 30000 });
const box = await page.locator('.map-surface').boundingBox();
const at = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
await page.keyboard.press('a');
for (const [x, y] of [[0.3, 0.3], [0.5, 0.3], [0.5, 0.5], [0.3, 0.5]]) await page.mouse.click(at(x, y).x, at(x, y).y);
await page.keyboard.press('Enter');
await page.keyboard.press('v');
await page.mouse.click(at(0.4, 0.4).x, at(0.4, 0.4).y);
const tabs = ['Progetto', 'Livelli', 'Elementi', 'Proprietà', 'Classificazione', 'Vettoriz.', 'Storia', 'Info', 'Navigatore', 'OSM', 'DEM', 'Percorso'];
for (const name of tabs) {
  const tab = page.getByRole('tab', { name, exact: true }).first();
  if (!(await tab.count())) { console.log(name, 'MISSING'); continue; }
  await tab.click();
  await page.waitForTimeout(450);
  const r = await new AxeBuilder({ page }).withTags(['wcag2aa', 'wcag21aa']).analyze();
  const list = r.violations.map(v => `${v.id}(${v.nodes.length})`).join(', ');
  console.log(name, '->', r.violations.length ? list : 'ok');
  for (const v of r.violations) console.log('   ', v.id, v.nodes.slice(0,2).map(n => n.target.join(' ')).join(' ; '));
}
await browser.close();
