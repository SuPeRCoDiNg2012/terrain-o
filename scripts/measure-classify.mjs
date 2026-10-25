import { chromium } from 'playwright';
import path from 'node:path';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.goto('http://127.0.0.1:5183/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('terrain-o:onboarding-v1', 'seen'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.setInputFiles('[data-testid="file-input"]', [
  path.join(process.cwd(), '.ref/fixtures/alpine.png'),
  path.join(process.cwd(), '.ref/fixtures/alpine.jgw'),
]);
await page.waitForTimeout(2200);
await page.getByRole('tab', { name: 'Classificazione' }).click();
const store = async () => page.evaluate(async () => {
  const urls = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('/src/store/projectStore.ts'));
  const mod = await import(urls[urls.length - 1]);
  const s = mod.useProjectStore.getState();
  return { classification: Boolean(s.project.classification), job: s.classificationJob, labels: Boolean(s.classificationLabels) };
});
console.log('before', await store());
const t0 = Date.now();
await page.getByRole('button', { name: 'Applica classificazione' }).click();
let last = '';
for (let i = 0; i < 300; i++) {
  const s = await store();
  const label = `${s.job.running ? 'running' : 'idle'} ${s.job.percent}% ${s.job.phase} | applied=${s.classification} labels=${s.labels}`;
  if (label !== last) { console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`, label); last = label; }
  if (s.classification && !s.job.running) break;
  await page.waitForTimeout(1000);
}
console.log(`TOTAL ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log('after', await store());
await page.screenshot({ path: 'screenshots/30-classify-done.png' });
await browser.close();
