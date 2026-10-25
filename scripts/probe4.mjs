import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:5183/';
const outDir = path.join(process.cwd(), 'screenshots', 'exports');
fs.mkdirSync(outDir, { recursive: true });
const errors = [];
const log = (...a) => console.log(...a);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

const getState = () => page.evaluate(async () => {
  const urls = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('/src/store/projectStore.ts'));
  const mod = await import(urls[urls.length - 1]);
  const s = mod.useProjectStore.getState();
  return {
    features: s.project.features.length,
    verified: s.project.features.filter((f) => f.verified).length,
    selection: s.selection.length,
    classification: Boolean(s.project.classification),
    labels: Boolean(s.classificationLabels),
    tool: s.activeTool,
    scale: s.view.scale,
    tx: s.view.tx,
    ty: s.view.ty,
    types: [...new Set(s.project.features.map((f) => f.type))],
    geoWarnings: s.project.geoWarnings?.length ?? 0,
    sample: s.sampledColor,
  };
});

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('terrain-o:onboarding-v1', 'seen'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.setInputFiles('[data-testid="file-input"]', [
  path.join(process.cwd(), '.ref/fixtures/alpine.png'),
  path.join(process.cwd(), '.ref/fixtures/alpine.jgw'),
]);
await page.waitForTimeout(2400);
log('warnings after import:', (await page.evaluate(() => document.body.innerText.match(/Nessun file \.prj[^\n]*/g)?.length ?? 0)));

// classification
await page.getByRole('tab', { name: 'Classificazione' }).click();
await page.getByRole('button', { name: 'Applica classificazione' }).click();
await page.waitForTimeout(2500);

// vectorize
await page.getByRole('tab', { name: 'Vettoriz.' }).click();
await page.getByRole('button', { name: 'Applica come livelli auto' }).click();
await page.getByTestId('dialog-confirm').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
if (await page.getByTestId('dialog-confirm').isVisible().catch(() => false)) await page.getByTestId('dialog-confirm').click();
await page.waitForTimeout(4000);
log('after vectorize:', await getState());
await page.screenshot({ path: path.join(process.cwd(), 'screenshots', '40-vectorized.png') });

// draw + verify
await page.getByTestId('tool-draw-area').click();
const box = await page.locator('.map-surface').boundingBox();
const cx = box.x + box.width * 0.4;
const cy = box.y + box.height * 0.4;
for (const [dx, dy] of [[-100, -70], [100, -70], [100, 70], [-100, 70], [-100, -70]]) {
  await page.mouse.click(cx + dx, cy + dy);
  await page.waitForTimeout(150);
}
await page.waitForTimeout(500);
log('after draw:', await getState());
await page.getByTestId('tool-draw-point').click();
await page.mouse.click(cx + 300, cy + 160);
await page.waitForTimeout(400);
await page.getByRole('tab', { name: 'Proprietà' }).click();
await page.getByTestId('verify-button').click();
await page.getByTestId('verify-declaration').check();
await page.getByTestId('dialog-confirm').click();
await page.waitForTimeout(500);
log('after verify:', await getState());

// menu zoom 100% after panning/zooming
await page.getByTestId('tool-pan').click();
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx + 160, cy + 90, { steps: 8 });
await page.mouse.up();
await page.mouse.wheel(0, -500);
await page.waitForTimeout(400);
const beforeMenu = await getState();
await page.getByRole('menuitem', { name: 'Visualizza' }).click();
await page.getByRole('menuitem', { name: 'Zoom 100%' }).click();
await page.waitForTimeout(500);
const afterMenu = await getState();
log('menu zoom before/after:', { before: { scale: beforeMenu.scale, tx: beforeMenu.tx, ty: beforeMenu.ty }, after: { scale: afterMenu.scale, tx: afterMenu.tx, ty: afterMenu.ty } });

// eyedropper: click in the middle of the image
await page.getByTestId('tool-eyedropper').click();
const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
await page.mouse.click(center.x, center.y);
await page.waitForTimeout(400);
log('eyedropper:', (await getState()).sample);

// exports
await page.keyboard.press('Control+e');
await page.waitForTimeout(600);
const formats = [
  ['export-png-1', 'png'],
  ['export-svg', 'svg'],
  ['export-pdf-a4', 'pdf'],
  ['export-omap', 'omap'],
  ['export-geojson', 'geojson'],
  ['export-gpx', 'gpx'],
  ['export-kml', 'kml'],
  ['export-project', 'json'],
];
for (const [id, ext] of formats) {
  const button = page.getByTestId(id);
  if (!(await button.isVisible().catch(() => false))) { log('missing export button', id); continue; }
  if (await button.isDisabled().catch(() => false)) { log('disabled export', id); continue; }
  const downloadPromise = page.waitForEvent('download', { timeout: 45000 }).catch(() => null);
  await button.click();
  const download = await downloadPromise;
  if (!download) { log('no download for', id, '| panel:', (await page.locator('.modal-body, .dialog-panel').last().innerText().catch(() => '')).slice(0, 200)); continue; }
  const target = path.join(outDir, `test.${ext}`);
  await download.saveAs(target);
  const size = fs.statSync(target).size;
  log('exported', id, download.suggestedFilename(), size, 'bytes');
  if (ext === 'geojson') {
    const json = JSON.parse(fs.readFileSync(target, 'utf8'));
    log('  geojson type', json.type, 'features', json.features?.length, 'first props', JSON.stringify(json.features?.[0]?.properties ?? {}).slice(0, 160));
  }
  if (ext === 'omap') {
    const xml = fs.readFileSync(target, 'utf8');
    log('  omap objects', (xml.match(/<object /g) ?? []).length, 'refs', (xml.match(/<georeferencing[\s\S]*?<\/georeferencing>/)?.[0] ?? '').slice(0, 220));
  }
  await page.waitForTimeout(300);
}
await page.screenshot({ path: path.join(process.cwd(), 'screenshots', '41-exports.png') });

// close modal + reload persistence
await page.getByRole('button', { name: 'Chiudi' }).last().click();
await page.waitForTimeout(2200);
const beforeReload = await getState();
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
const afterReload = await getState();
log('persistence:', { before: beforeReload, after: afterReload });
await page.screenshot({ path: path.join(process.cwd(), 'screenshots', '42-reloaded.png') });

log('ERRORS:', errors.length ? `\n${errors.join('\n')}` : 'none');
await browser.close();
