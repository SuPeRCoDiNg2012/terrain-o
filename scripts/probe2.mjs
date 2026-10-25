import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:5183/';
const shots = (...p) => path.join(process.cwd(), 'screenshots', ...p);
const errors = [];
const log = (...a) => console.log(...a);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

async function body() {
  return (await page.locator('body').innerText()).replace(/\n+/g, ' | ');
}

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('terrain-o:onboarding-v1', 'seen'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);

await page.setInputFiles('[data-testid="file-input"]', [
  path.join(process.cwd(), '.ref/fixtures/alpine.png'),
  path.join(process.cwd(), '.ref/fixtures/alpine.jgw'),
]);
await page.waitForTimeout(2500);
log('import done:', (await body()).slice(0, 160));

// --- OSM ---
await page.getByRole('tab', { name: 'OSM', exact: true }).click();
await page.waitForTimeout(500);
log('OSM panel has fetch:', await page.getByTestId('fetch-osm').isVisible());
await page.getByTestId('fetch-osm').click();
const osmStart = Date.now();
await page.waitForFunction(
  () => {
    const text = document.body.innerText;
    return /tracciati da|Nessuna strada o corso|Importazione OSM non riuscita|Richiesta OSM annullata/.test(text);
  },
  null,
  { timeout: 120000 },
).catch(() => log('OSM wait timed out'));
log(`OSM after ${Math.round((Date.now() - osmStart) / 1000)}s:`, (await body()).match(/[^|]*(tracciati da|Nessuna strada|Importazione OSM non riuscita|Richiesta OSM annullata)[^|]*/)?.[0]?.trim());
await page.screenshot({ path: shots('10-osm.png') });

if (await page.getByRole('button', { name: 'Converti in elementi' }).isEnabled().catch(() => false)) {
  await page.getByRole('button', { name: 'Converti in elementi' }).click();
  await page.waitForTimeout(600);
  log('converted OSM:', await page.getByText('Convertiti').locator('..').innerText().catch(() => '?'));
}

// --- Classification + vectorization ---
await page.getByRole('tab', { name: 'Classificazione' }).click();
await page.getByRole('button', { name: 'Applica classificazione' }).click();
await page.waitForFunction(
  () => document.body.innerText.includes('Ultimo risultato applicato'),
  null,
  { timeout: 180000 },
).catch((e) => log('classification wait failed:', e.message));
log('classification applied');

await page.getByRole('tab', { name: 'Vettoriz.' }).click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Applica come livelli auto' }).click();
if (await page.getByRole('button', { name: 'Sostituisci' }).isVisible().catch(() => false)) {
  await page.getByRole('button', { name: 'Sostituisci' }).click();
}
await page.waitForFunction(
  () => /Vettorizzazione completata|Errore durante la vettorizzazione/.test(document.body.innerText),
  null,
  { timeout: 180000 },
).catch(() => log('vectorize wait timed out'));
await page.waitForTimeout(800);
log('vectorize:', (await body()).match(/[^|]*(aree generate|Errore durante la vettorizzazione)[^|]*/)?.[0]?.trim());
await page.screenshot({ path: shots('11-vectorized.png') });

// Feature count via Elementi tab
await page.getByRole('tab', { name: 'Elementi' }).click();
await page.waitForTimeout(400);
log('features:', (await body()).match(/Elementi \d+/)?.[0]);
log('feature list sample:', (await page.locator('.feature-panel').innerText()).slice(0, 240).replace(/\n+/g, ' | '));

// --- Draw area ---
await page.getByRole('button', { name: 'Area', exact: true }).click().catch(async () => {
  await page.getByTitle(/Disegna area/).first().click();
});
const box = await page.locator('.map-surface').boundingBox();
log('map box:', box);
const cx = box.x + box.width * 0.5;
const cy = box.y + box.height * 0.5;
for (const [dx, dy] of [[-60, -50], [60, -50], [60, 50], [-60, 50]]) {
  await page.mouse.click(cx + dx, cy + dy);
  await page.waitForTimeout(160);
}
await page.screenshot({ path: shots('12-drawing.png') });
await page.getByRole('button', { name: 'Termina' }).click();
await page.waitForTimeout(500);
log('after draw features:', (await body()).match(/Elementi \d+/)?.[0]);
await page.screenshot({ path: shots('13-drawn.png') });

// --- Undo / redo ---
await page.keyboard.press('Control+z');
await page.waitForTimeout(300);
log('after undo features:', (await body()).match(/Elementi \d+/)?.[0]);
await page.keyboard.press('Control+Shift+z');
await page.waitForTimeout(300);
log('after redo features:', (await body()).match(/Elementi \d+/)?.[0]);

// --- Export OMAP ---
await page.keyboard.press('Control+e');
await page.waitForTimeout(500);
const downloadPromise = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
await page.getByTestId('export-omap').click();
const download = await downloadPromise;
if (download) {
  const target = path.join(process.cwd(), 'screenshots', 'export-test.omap');
  await download.saveAs(target);
  const xml = fs.readFileSync(target, 'utf8');
  log('OMAP downloaded bytes:', xml.length, 'objects:', (xml.match(/<object /g) ?? []).length);
  log('first coords:', xml.match(/<coords count="[^"]+">[^<]+/)?.[0]?.slice(0, 120));
} else {
  log('OMAP download did not fire');
}
await page.screenshot({ path: shots('14-export.png') });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// --- Persistence ---
await page.waitForTimeout(1800);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
log('after reload features:', (await body()).match(/Elementi \d+/)?.[0]);
log('after reload source:', /alpine/.test(await body()));
await page.screenshot({ path: shots('15-reloaded.png') });

// --- Zoom / pan / marquee ---
const box2 = await page.locator('.map-surface').boundingBox();
await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
await page.mouse.wheel(0, -400);
await page.waitForTimeout(500);
log('zoom status:', (await body()).match(/ZOOM \| \d+/)?.[0] ?? (await body()).match(/ZOOM[^|]*\|[^|]*\|[^|]*/)?.[0]);
await page.keyboard.press('m');
await page.mouse.move(box2.x + 100, box2.y + 100);
await page.mouse.down();
await page.mouse.move(box2.x + box2.width - 100, box2.y + box2.height - 100, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(400);
log('marquee selection status:', (await body()).match(/SELEZIONE[^|]*\|[^|]*/)?.[0]);
await page.screenshot({ path: shots('16-marquee.png') });

log('ERRORS:', errors.length ? `\n${errors.join('\n')}` : 'none');
await browser.close();
