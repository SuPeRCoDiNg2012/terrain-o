import { chromium } from 'playwright';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addInitScript(() => localStorage.setItem('terrain-o:onboarding-v1', 'seen'));
const page = await context.newPage();
await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });
console.log(await page.evaluate(() => {
  const el = document.querySelector('code');
  const chain = [];
  let n = el;
  while (n && chain.length < 10) { chain.push(`${n.tagName}.${n.className}`); n = n.parentElement; }
  const style = getComputedStyle(el);
  return { html: el.outerHTML, chain, color: style.color, bg: style.backgroundColor };
}));
await browser.close();
