import { chromium } from 'playwright';
import path from 'node:path';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto('http://127.0.0.1:5183/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('terrain-o:onboarding-v1', 'seen'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.setInputFiles('[data-testid="file-input"]', [
  path.join(process.cwd(), '.ref/fixtures/alpine.png'),
  path.join(process.cwd(), '.ref/fixtures/alpine.jgw'),
]);
await page.waitForTimeout(2200);
console.log(await page.evaluate(() => {
  const el = document.querySelector('[data-testid="tool-area"]');
  const bar = document.querySelector('.map-toolbar');
  const r = el?.getBoundingClientRect();
  const cs = el ? getComputedStyle(el) : null;
  const bs = bar ? getComputedStyle(bar) : null;
  const br = bar?.getBoundingClientRect();
  return {
    rect: r && { x: r.x, y: r.y, w: r.width, h: r.height },
    display: cs?.display, visibility: cs?.visibility, opacity: cs?.opacity, zIndex: cs?.zIndex,
    parent: el?.parentElement?.className,
    barRect: br && { x: br.x, y: br.y, w: br.width, h: br.height },
    barDisplay: bs?.display, barVisibility: bs?.visibility, barOpacity: bs?.opacity,
    elementAtPoint: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.outerHTML.slice(0, 160),
  };
}));
await page.screenshot({ path: 'screenshots/23-toolbar.png' });
await browser.close();
