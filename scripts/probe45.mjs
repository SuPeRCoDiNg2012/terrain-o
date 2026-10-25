import { chromium } from 'playwright';
const browser = await chromium.launch();
for (const vp of [{width:1280,height:720},{width:1024,height:768},{width:960,height:600}]) {
  const context = await browser.newContext({ viewport: vp });
  await context.addInitScript(() => localStorage.setItem('terrain-o:onboarding-v1', 'seen'));
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => {
    const q = (s) => document.querySelector(s)?.getBoundingClientRect().toJSON();
    return { map: q('.map-stage'), left: q('.dock-left'), right: q('.dock-right'), palette: q('.tool-palette'), overflow: document.documentElement.scrollWidth - innerWidth };
  });
  console.log(vp.width, JSON.stringify({mapW: m.map?.width, leftW: m.left?.width, rightW: m.right?.width, overflow: m.overflow}));
  await page.screenshot({ path: `screenshots/126-${vp.width}.png` });
  await context.close();
}
await browser.close();
