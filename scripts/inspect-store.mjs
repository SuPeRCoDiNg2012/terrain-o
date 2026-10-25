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
await page.waitForTimeout(2500);
console.log(await page.evaluate(async () => {
  const paths = performance.getEntriesByType('resource').map(e => e.name).filter(n => /projectStore|main.tsx|App.tsx/.test(n));
  const mods = {};
  for (const p of paths) { try { const m = await import(p.replace(location.origin, '')); mods[p] = m.useProjectStore?.getState?.().project?.image?.name ?? 'no-store'; } catch (e) { mods[p] = 'ERR ' + e.message; } }
  const direct = await import('/src/store/projectStore.ts');
  return { paths, mods, direct: direct.useProjectStore.getState().project.image?.name ?? null, bodyHasAlpine: document.body.innerText.includes('alpine') };
}));
await browser.close();
