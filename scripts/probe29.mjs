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
await page.keyboard.press('a');
for (const [x, y] of [[0.3, 0.3], [0.5, 0.3], [0.5, 0.5], [0.3, 0.5]]) await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
await page.keyboard.press('Enter');
await page.keyboard.press('v');
await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
for (const name of ['Elementi', 'Proprietà', 'Storia']) {
  await page.getByRole('tab', { name, exact: true }).first().click();
  await page.waitForTimeout(400);
  const r = await new AxeBuilder({ page }).withTags(['wcag2aa', 'wcag21aa']).analyze();
  console.log('---', name);
  for (const v of r.violations) for (const n of v.nodes) console.log(n.target.join(' '), '::', n.any[0]?.message);
  const styles = await page.evaluate(() => {
    const pick = (el) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      return { html: el.outerHTML.slice(0, 90), color: s.color, bg: s.backgroundColor, border: s.borderColor, opacity: s.opacity };
    };
    return {
      activeChip: pick(document.querySelector('.filter-chip.active')),
      secondChip: pick(document.querySelectorAll('.filter-chip')[1]),
      danger: pick(document.querySelector('.btn-danger')),
      historyMono: pick(document.querySelector('.history-item.current .mono')),
      historyItem: pick(document.querySelector('.history-item.current')),
    };
  });
  console.log(JSON.stringify(styles, null, 1));
}
await browser.close();
