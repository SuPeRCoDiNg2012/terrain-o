import { chromium } from 'playwright';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://127.0.0.1:5183/';
const shots = (...p) => path.join(process.cwd(), 'screenshots', ...p);
const errors = [];
const log = (...a) => console.log(...a);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

const state = () => page.evaluate(async () => {
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/src/store/projectStore.ts')) ?? '/src/store/projectStore.ts';
  const mod = await import(url);
  const s = mod.useProjectStore.getState();
  return {
    features: s.project.features.length,
    selection: s.selection.length,
    tool: s.activeTool,
    classification: Boolean(s.project.classification),
    labels: Boolean(s.classificationLabels),
    osm: s.project.osmWays.length,
    past: s.past.length,
    future: s.future.length,
    types: [...new Set(s.project.features.map((f) => f.type))],
    saveState: s.saveState,
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
await page.waitForTimeout(2200);
log('imported:', await state());

// classification
await page.getByRole('tab', { name: 'Classificazione' }).click();
await page.getByRole('button', { name: 'Applica classificazione' }).click();
await page.waitForFunction(async () => {
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/src/store/projectStore.ts')) ?? '/src/store/projectStore.ts';
  const mod = await import(url);
  return Boolean(mod.useProjectStore.getState().project.classification);
}, null, { timeout: 120000 });
log('classified:', await state());

// vectorize
await page.getByRole('tab', { name: 'Vettoriz.' }).click();
await page.getByRole('button', { name: 'Applica come livelli auto' }).click();
await page.getByTestId('dialog-confirm').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
if (await page.getByTestId('dialog-confirm').isVisible().catch(() => false)) {
  await page.getByTestId('dialog-confirm').click();
}
await page.waitForFunction(async () => {
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/src/store/projectStore.ts')) ?? '/src/store/projectStore.ts';
  const mod = await import(url);
  const s = mod.useProjectStore.getState();
  return !s.vectorJob.running && s.project.features.some((f) => f.source === 'vector');
}, null, { timeout: 120000 });
log('vectorized:', await state());

// draw
await page.getByTestId('tool-draw-area').click();
const box = await page.locator('.map-surface').boundingBox();
const cx = box.x + box.width * 0.45;
const cy = box.y + box.height * 0.45;
const pts = [[-120, -90], [120, -90], [120, 90], [-120, 90]];
for (const [dx, dy] of pts) {
  await page.mouse.click(cx + dx, cy + dy);
  await page.waitForTimeout(120);
}
log('draft tool active:', await state());
await page.mouse.click(cx + pts[0][0], cy + pts[0][1]);
await page.waitForTimeout(500);
const afterClose = await state();
log('after clicking first point:', afterClose, 'dialog:', await page.locator('.dialog-backdrop').count());

// If still drafting, press Enter
if (afterClose.tool !== 'select' && (await page.locator('.draft-bar').count())) {
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
}
log('after draw:', await state());
await page.screenshot({ path: shots('20-drawn.png') });

// select all + inspector + verify
await page.keyboard.press('Control+a');
await page.waitForTimeout(400);
log('ctrl+a:', await state());
await page.getByRole('tab', { name: 'Proprietà' }).click();
await page.waitForTimeout(400);
log('inspector:', (await page.locator('[role=tabpanel]').last().innerText()).slice(0, 200).replace(/\n+/g, ' | '));

// create a manual point and verify it
await page.getByTestId('tool-draw-point').click();
await page.mouse.click(cx + 260, cy + 200);
await page.waitForTimeout(500);
const afterPoint = await state();
log('after point:', afterPoint);
await page.getByRole('tab', { name: 'Proprietà' }).click();
const verifyButton = page.getByRole('button', { name: 'Dichiara verificato' });
log('verify visible:', await verifyButton.isVisible().catch(() => false));
if (await verifyButton.isVisible().catch(() => false)) {
  await verifyButton.click();
  await page.waitForTimeout(300);
  await page.locator('#verify-note').fill('Controllo sul campo');
  await page.getByTestId('verify-declaration').check();
  await page.getByTestId('dialog-confirm').click();
  await page.waitForTimeout(600);
  log('after verify:', await state());
  log('selected feature:', await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/src/store/projectStore.ts')) ?? '/src/store/projectStore.ts';
    const mod = await import(url);
    const s = mod.useProjectStore.getState();
    const f = s.project.features.find((x) => s.selection.includes(x.id));
    return f && { verified: f.verified, source: f.source, history: f.history.length, note: f.verifiedNote };
  }));
  await page.screenshot({ path: shots('21-verified.png') });
}

// undo/redo
await page.keyboard.press('Control+z');
await page.waitForTimeout(400);
log('undo:', await state());
await page.keyboard.press('Control+Shift+z');
await page.waitForTimeout(400);
log('redo:', await state());

// marquee
await page.getByTestId('tool-select').click().catch(() => {});
await page.keyboard.press('m');
await page.mouse.move(box.x + 20, box.y + 20);
await page.mouse.down();
await page.mouse.move(box.x + box.width - 20, box.y + box.height - 20, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(400);
log('marquee:', await state());

// layering toggles
await page.getByRole('tab', { name: 'Livelli' }).click();
await page.getByRole('button', { name: 'Nascondi livello Classificazione' }).click();
await page.waitForTimeout(200);
await page.screenshot({ path: shots('22-layers.png') });

log('ERRORS:', errors.length ? `\n${errors.join('\n')}` : 'none');
await browser.close();
