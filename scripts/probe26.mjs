import { chromium } from 'playwright';
import path from 'node:path';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addInitScript(() => localStorage.setItem('terrain-o:onboarding-v1', 'seen'));
const page = await context.newPage();
await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });
const info = await page.evaluate(() => {
  const pick = (el) => {
    const style = getComputedStyle(el);
    let bg = style.backgroundColor;
    let node = el;
    while ((bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') && node.parentElement) {
      node = node.parentElement;
      bg = getComputedStyle(node).backgroundColor;
    }
    return { html: el.outerHTML.slice(0, 110), color: style.color, bg, opacity: style.opacity, font: style.fontSize };
  };
  return {
    codes: [...document.querySelectorAll('code')].slice(0, 4).map(pick),
    hidden: [...document.querySelectorAll('.layer-hidden')].slice(0, 2).map(pick),
    hiddenMuted: [...document.querySelectorAll('.layer-hidden .muted.tiny, .layer-hidden .tiny.mono')].slice(0, 3).map(pick),
    statusLabel: [...document.querySelectorAll('.status-label')].slice(0, 2).map(pick),
    statusMuted: [...document.querySelectorAll('.status-muted')].slice(0, 2).map(pick),
    minimapHeader: [...document.querySelectorAll('.minimap-header span')].map(pick),
    layerRow: [...document.querySelectorAll('.layer-row')].slice(0, 2).map(pick),
  };
});
console.log(JSON.stringify(info, null, 2));
await page.locator('[data-testid="file-input"]').setInputFiles([path.resolve('e2e/fixtures/alpine.png'), path.resolve('e2e/fixtures/alpine.jgw')]);
await page.waitForTimeout(3000);
const info2 = await page.evaluate(() => {
  const pick = (el) => {
    const style = getComputedStyle(el);
    return { html: el.outerHTML.slice(0, 110), color: style.color, bg: style.backgroundColor, opacity: style.opacity };
  };
  return { minimapHeader: [...document.querySelectorAll('.minimap-header, .minimap-header span')].map(pick) };
});
console.log(JSON.stringify(info2, null, 2));
await browser.close();
