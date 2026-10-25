import { chromium } from 'playwright';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://127.0.0.1:5183/';
const shots = (...p) => path.join(process.cwd(), 'screenshots', ...p);
const log = (...a) => console.log(...a);
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

const getState = () => page.evaluate(async () => {
  const urls = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('/src/store/projectStore.ts'));
  const mod = await import(urls[urls.length - 1]);
  const s = mod.useProjectStore.getState();
  const uiUrls = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('/src/ui/uiStore.ts'));
  const ui = await import(uiUrls[uiUrls.length - 1]);
  return {
    features: s.project.features.length,
    selection: s.selection.length,
    verified: s.project.features.filter((f) => f.verified).length,
    calibration: s.project.calibration && { mPerPx: s.project.calibration.mPerPx, samples: 1 + (s.project.calibration.extraSamples?.length ?? 0), method: s.project.calibration.method },
    scale: s.view.scale,
    tool: s.activeTool,
    sample: ui.useUiStore.getState().sampledColor,
    history: s.project.features.find((f) => s.selection.includes(f.id))?.history.length ?? 0,
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

// Palette only, never the hidden legacy toolbar.
log('visible palette buttons:', await page.locator('.palette-tool:visible').count());
log('text tool disabled:', await page.getByTestId('tool-text').isDisabled());

// Calibration
await page.getByTestId('tool-calibrate').click();
const box = await page.locator('.map-surface').boundingBox();
const p1 = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.5 };
const p2 = { x: box.x + box.width * 0.7, y: box.y + box.height * 0.5 };
await page.mouse.click(p1.x, p1.y);
await page.waitForTimeout(250);
await page.mouse.click(p2.x, p2.y);
await page.waitForTimeout(500);
log('calibration dialog:', await page.getByTestId('calibration-input').isVisible().catch(() => false));
await page.getByTestId('calibration-input').fill('100');
await page.getByTestId('dialog-confirm').click();
await page.waitForTimeout(700);
log('after calibration:', await getState());

// Draw an area with the new palette, then lasso select it
await page.getByTestId('tool-draw-area').click();
for (const [dx, dy] of [[-80, -60], [80, -60], [80, 60], [-80, 60], [-80, -60]]) {
  await page.mouse.click(box.x + box.width * 0.5 + dx, box.y + box.height * 0.5 + dy);
  await page.waitForTimeout(120);
}
await page.waitForTimeout(400);
log('after draw:', await getState());

await page.getByTestId('tool-lasso').click();
await page.mouse.move(box.x + box.width * 0.5 - 140, box.y + box.height * 0.5 - 110);
await page.mouse.down();
for (let i = 0; i <= 20; i++) {
  const angle = (i / 20) * Math.PI * 2;
  await page.mouse.move(
    box.x + box.width * 0.5 + Math.cos(angle) * 140,
    box.y + box.height * 0.5 + Math.sin(angle) * 110,
  );
}
await page.mouse.up();
await page.waitForTimeout(500);
log('after lasso:', await getState());
await page.screenshot({ path: shots('50-lasso.png') });

// Select tolerance: set 24 px, click 20 px away from the drawn edge
await page.getByTestId('tool-select').click();
const range = page.getByLabel('Tolleranza di selezione');
await range.fill('24');
await page.waitForTimeout(200);
log('tolerance value:', await range.inputValue());

// Eyedropper sample (requires classification? no, source only)
await page.getByTestId('tool-eyedropper').click();
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
await page.waitForTimeout(400);
log('eyedropper:', (await getState()).sample);

// Menu: Testo must be disabled; Zoom 100% must be enabled; Svuota label removed
await page.getByRole('menuitem', { name: 'Strumenti' }).click();
log('menu text item disabled:', await page.getByRole('menuitem', { name: 'Testo' }).getAttribute('disabled') !== null);
await page.keyboard.press('Escape');
await page.getByRole('menuitem', { name: 'OSM' }).click();
log('menu OSM labels:', (await page.locator('.menu-popup').innerText()).replace(/\n+/g, ' | '));
await page.keyboard.press('Escape');

// Dock tabs all reachable
const tabs = await page.locator('.dock-right .dock-tab:visible').allInnerTexts();
log('right dock tabs:', tabs);
log('dock head height:', await page.locator('.dock-right .dock-head').evaluate((el) => el.getBoundingClientRect().height));
await page.screenshot({ path: shots('51-dock.png') });

// Verification revocation via geometry drag: select the drawn area, verify it, drag a vertex.
await page.getByTestId('tool-select').click();
await page.mouse.click(box.x + box.width * 0.5 - 80, box.y + box.height * 0.5 - 60);
await page.waitForTimeout(300);
let state = await getState();
log('area selected:', state);
if (state.selection === 1) {
  await page.getByRole('tab', { name: 'Proprietà' }).click();
  if (await page.getByTestId('verify-button').isVisible().catch(() => false)) {
    await page.getByTestId('verify-button').click();
    await page.getByTestId('verify-declaration').check();
    await page.getByTestId('dialog-confirm').click();
    await page.waitForTimeout(500);
    log('verified area:', await getState());
    // drag a corner handle 25 px
    await page.mouse.move(box.x + box.width * 0.5 - 80, box.y + box.height * 0.5 - 60);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5 - 110, box.y + box.height * 0.5 - 85, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    log('after geometry edit:', await getState());
  }
}

log('ERRORS:', errors.length ? `\n${errors.join('\n')}` : 'none');
await browser.close();
