import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const FIXTURES = path.resolve('e2e/fixtures');

async function openApp(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('terrain-o:onboarding-v1', 'seen');
    if (!localStorage.getItem('terrain-o/locale/v1')) localStorage.setItem('terrain-o/locale/v1', 'it');
  });
  await page.goto('/');
  await expect(page.getByTestId('app-shell')).toBeVisible();
}

async function importFixture(page: Page) {
  await page.getByTestId('file-input').setInputFiles([
    path.join(FIXTURES, 'alpine.png'),
    path.join(FIXTURES, 'alpine.jgw'),
  ]);
  await expect(page.getByText(/immagine 800×600 px importata/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.image-card')).toContainText('alpine.png');
}

test.describe('Terrain / O desktop shell', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('boots with the professional shell, draft warning and no interrogative marker', async ({ page }) => {
    await expect(page).toHaveTitle(/Terrain \/ O/);
    await expect(page.locator('.menu-bar')).toContainText('BOZZA PRELIMINARE');
    await expect(page.getByTestId('file-input')).toHaveAttribute(
      'aria-label',
      /Seleziona file da importare/,
    );
    await expect(page.locator('.tool-palette')).toBeVisible();
    await expect(page.locator('.options-bar')).toBeVisible();
    await expect(page.locator('.status-bar-pro')).toBeVisible();
    // The brief forbids a question mark as a provenance marker anywhere.
    await expect(page.getByText('?', { exact: true })).toHaveCount(0);
    // The legend is opt-in and must not be on the map by default.
    await expect(page.locator('.map-legend')).toHaveCount(0);
  });

  test('opens every desktop menu, runs a command and supports keyboard navigation', async ({ page }) => {
    const labels = [
      'File',
      'Modifica',
      'Visualizza',
      'Strumenti',
      'Classificazione',
      'Vettorizzazione',
      'AI',
      'OSM',
      'Esporta',
      'Aiuto',
    ];
    for (const label of labels) {
      await page.getByRole('menuitem', { name: label, exact: true }).click();
      await expect(page.getByRole('menu', { name: label })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menu', { name: label })).toHaveCount(0);
    }

    await page.getByRole('menuitem', { name: 'AI', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: /Elaborazione automatica completa/ })).toBeVisible();
    await page.keyboard.press('Escape');

    // A real click on the first row must reach the item, not the workspace
    // behind it: this is the regression for the clipped dropdown bug.
    await page.getByRole('menuitem', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: /Guida e scorciatoie/ }).click();
    await expect(page.getByRole('dialog')).toContainText('Scorciatoie da tastiera');
    await page.getByRole('dialog').getByRole('button', { name: 'Chiudi', exact: true }).last().click();

    await page.locator('[data-menu-trigger="file"]').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menu', { name: 'File' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Nuovo progetto/ })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('menu', { name: 'Modifica' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-menu-trigger="edit"]')).toBeFocused();
  });

  test('keeps the menu usable in a small desktop window and switches language', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 720 });
    await page.getByRole('menuitem', { name: 'Visualizza', exact: true }).click();
    const menu = page.getByRole('menu', { name: 'Visualizza' });
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(1024);
      expect(box.y + box.height).toBeLessThanOrEqual(720);
    }
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Switch to English' }).click();
    await expect(page.getByRole('menuitem', { name: 'View', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Layers' })).toBeVisible();
    await expect(page.locator('.menu-bar-draft')).toHaveText('PRELIMINARY DRAFT');

    // The choice is stored and survives a reload.
    await page.reload();
    await expect(page.getByTestId('app-shell')).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'File', exact: true })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Visualizza', exact: true })).toHaveCount(0);
  });

  test('imports into a database left broken by an early build', async ({ page }) => {
    // Seed the schema produced by early builds on the app origin before the
    // application boots. `assets` has no inline key, so every asset put()
    // rejects with "the object store uses out-of-line keys".
    await page.route('**/__indexeddb-seed', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>seed</title>' }),
    );
    await page.goto('/__indexeddb-seed');
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase('terrain-o');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => resolve();
      });
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('terrain-o', 3);
        request.onupgradeneeded = () => {
          const database = request.result;
          database.createObjectStore('projects', { keyPath: 'id' });
          database.createObjectStore('assets');
          database.createObjectStore('backups', { keyPath: 'key' });
          database.createObjectStore('osmCache', { keyPath: 'key' });
        };
        request.onsuccess = () => {
          request.result.close();
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    });

    await openApp(page);
    await importFixture(page);

    // The repaired project must also survive a reload.
    await page.reload();
    await expect(page.getByTestId('app-shell')).toBeVisible();
    await expect(page.locator('.image-card')).toContainText('alpine.png');
  });

  test('does not start a classification preview until its panel is opened', async ({ page }) => {
    await importFixture(page);
    await page.waitForTimeout(1500);
    await expect(page.locator('.classification-preview-layer')).toHaveCount(0);

    await page.getByRole('tab', { name: 'Classificazione' }).click();
    await expect(page.locator('.classification-preview')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.classification-preview-layer')).toHaveCount(1);
  });

  test('classifies, vectorizes and validates the automatic geometry', async ({ page }) => {
    await importFixture(page);

    await page.getByRole('tab', { name: 'Classificazione' }).click();
    await page.getByRole('button', { name: 'Applica classificazione' }).click();
    await expect(page.locator('.stats-block')).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('.dock-right .experimental-line').first()).toBeVisible();

    await page.getByRole('tab', { name: 'Vettoriz.' }).click();
    await page.getByRole('button', { name: 'Applica come livelli auto' }).click();
    await page.getByTestId('dialog-confirm').click();
    await expect
      .poll(async () => {
        const text = await page.locator('.counter-row').first().innerText();
        return Number(text.match(/(\d+) poligoni/)?.[1] ?? 0);
      })
      .toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Valida topologia' }).click();
    await expect(page.getByText(/Topologia valida|problemi di topologia/i).last()).toBeVisible();
  });

  test('runs the local AI recognizer and unifies the symbol layer', async ({ page }) => {
    await importFixture(page);

    await page.getByRole('tab', { name: 'AI', exact: true }).click();
    await expect(page.getByText('Risultato sperimentale.')).toBeVisible();
    await page.getByTestId('run-ai').click();
    await expect(page.getByText(/Riconoscimento completato|validazione/i).first()).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.getByText(/Riconoscimento AI|validazione holdout/i).first()).toBeVisible();
    // Fusion now runs as part of recognition, so the unified layer is already
    // reported before the explicit button is pressed.
    await expect(page.getByText('Duplicati rimossi')).toBeVisible();

    await page.getByTestId('fuse-symbols').click();
    await expect(page.getByText(/Livello simboli unificato|Nessun duplicato automatico/i)).toBeVisible();
    await expect(page.getByText('?', { exact: true })).toHaveCount(0);
  });

  test('runs the whole map preparation from one automatic action', async ({ page }) => {
    await importFixture(page);

    await page.getByRole('tab', { name: 'AI', exact: true }).click();
    // Keep the end-to-end test deterministic: no external OSM or DEM request.
    await page.getByText('Scarica anche OSM', { exact: true }).click();
    await page.getByText('Genera anche le curve di livello', { exact: true }).click();
    await page.getByTestId('run-auto-pipeline').click();

    await expect(page.getByText('Simboli totali', { exact: true })).toBeVisible({ timeout: 180_000 });
    await expect(page.getByText('Duplicati uniti', { exact: true })).toBeVisible();
    await expect(page.getByText(/simboli totali/i).first()).toBeVisible();
    await expect(page.locator('.status-bar-pro')).not.toContainText('Elaborazione annullata');
  });

  test('runs the one-click pipeline with OSM, buildings and trees from a mocked source', async ({ page }) => {
    await page.route('**/api/interpreter**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          elements: [
            {
              type: 'way',
              id: 910001,
              tags: { building: 'yes', name: 'Edificio prova' },
              geometry: [
                { lat: 47.274, lon: 11.36 },
                { lat: 47.274, lon: 11.361 },
                { lat: 47.273, lon: 11.361 },
                { lat: 47.273, lon: 11.36 },
                { lat: 47.274, lon: 11.36 },
              ],
            },
            {
              type: 'node',
              id: 910002,
              lat: 47.275,
              lon: 11.365,
              tags: { natural: 'tree' },
            },
          ],
        }),
      });
    });

    await importFixture(page);
    await page.getByRole('tab', { name: 'AI', exact: true }).click();
    // OSM is on by default; contours stay off so the test needs no DEM route.
    await page.getByText('Genera anche le curve di livello', { exact: true }).click();
    await page.getByTestId('run-auto-pipeline').click();

    await expect(page.getByText('Simboli totali', { exact: true })).toBeVisible({ timeout: 180_000 });
    await expect(page.getByText(/2 grezzi · 2 simboli/)).toBeVisible();
    await expect(page.getByText(/Duplicati uniti/)).toBeVisible();
  });

  test('declares a verification and revokes it automatically on geometry edits', async ({ page }) => {
    await importFixture(page);

    await page.getByTestId('tool-draw-area').click();
    const box = await page.locator('.map-surface').boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    const points = [
      { x: box.x + box.width * 0.3, y: box.y + box.height * 0.3 },
      { x: box.x + box.width * 0.55, y: box.y + box.height * 0.3 },
      { x: box.x + box.width * 0.55, y: box.y + box.height * 0.55 },
      { x: box.x + box.width * 0.3, y: box.y + box.height * 0.55 },
    ];
    for (const point of points) await page.mouse.click(point.x, point.y);
    await page.keyboard.press('Enter');
    await expect(page.locator('.status-bar-pro')).toContainText('1 elemento');

    await page.getByTestId('tool-select').click();
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
    await page.getByRole('tab', { name: 'Proprietà' }).click();
    await expect(page.locator('.status-bar-pro')).toContainText('manuale');

    await page.getByTestId('verify-button').click();
    await page.locator('#verify-note').fill('controllo di prova sul campo');
    await page.getByTestId('verify-declaration').check();
    await page.getByTestId('dialog-confirm').click();
    await expect(page.locator('.status-bar-pro')).toContainText('verificato');

    // §2: any geometry edit revokes the declaration without a second prompt.
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.status-bar-pro')).toContainText('manuale');

    // The history keeps both edits, so undo restores the previous declaration.
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
    await page.keyboard.press('Control+z');
    await expect(page.locator('.status-bar-pro')).toContainText('verificato');
  });

  test('exports OMAP with a top-left reference and y growing downward', async ({ page }) => {
    await importFixture(page);

    await page.getByTestId('tool-draw-area').click();
    const box = await page.locator('.map-surface').boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    const points = [
      { x: box.x + box.width * 0.35, y: box.y + box.height * 0.35 },
      { x: box.x + box.width * 0.6, y: box.y + box.height * 0.35 },
      { x: box.x + box.width * 0.6, y: box.y + box.height * 0.6 },
      { x: box.x + box.width * 0.35, y: box.y + box.height * 0.6 },
    ];
    for (const point of points) await page.mouse.click(point.x, point.y);
    await page.keyboard.press('Enter');
    await expect(page.locator('.status-bar-pro')).toContainText('1 elemento');

    await page.locator('.menu-icon-button[aria-label="Esporta"]').click();
    await expect(page.getByTestId('export-omap')).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-omap').click(),
    ]);
    const file = await download.path();
    expect(file).not.toBeNull();
    const omap = fs.readFileSync(file as string, 'utf8');

    expect(omap).toContain('<ref_point x="11.35000000" y="47.28000000"/>');
    expect(omap).toContain('<georeferencing scale="15000"><ref_point x="0" y="0"/>');
    const objects = omap.split('<parts')[1] ?? '';
    const pairs = [...objects.matchAll(/<coords count="\d+">([^<]+)<\/coords>/g)]
      .flatMap((match) => match[1].split(';'))
      .map((pair) => pair.trim().split(/\s+/).map(Number))
      .filter((pair) => pair.length >= 2 && pair.every(Number.isFinite));
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs.every((pair) => pair[1] > 0)).toBe(true);
  });
});

test.describe('Terrain / O mobile shell', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test('recognises the phone, opens the menu sheet and the side drawers', async ({ page }) => {
    await openApp(page);
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-device', 'phone');
    await expect(page.locator('.menu-mobile-toggle')).toBeVisible();
    await expect(page.locator('.menu-bar-items')).toBeHidden();

    await page.locator('.menu-mobile-toggle').click();
    await expect(page.locator('.menu-bar-items')).toBeVisible();
    await page.getByRole('menuitem', { name: 'File' }).click();
    await expect(page.getByRole('menu', { name: 'File' })).toBeVisible();
    await page.locator('.menu-mobile-close').click();

    const palette = await page.locator('.tool-palette').boundingBox();
    const map = await page.locator('.map-stage').boundingBox();
    expect(palette).not.toBeNull();
    expect(map).not.toBeNull();
    if (!palette || !map) return;
    expect(palette.y).toBeGreaterThan(700);
    expect(palette.width).toBeGreaterThan(360);
    expect(map.height).toBeGreaterThan(400);

    await page.locator('.mobile-panel-button.mobile-left').click();
    await expect(page.locator('.dock-left')).toHaveClass(/mobile-open/);
    await expect(page.locator('.mobile-scrim')).toBeVisible();
    await page.locator('.mobile-scrim').click({ position: { x: 370, y: 500 } });
    await expect(page.locator('.dock-left')).not.toHaveClass(/mobile-open/);

    await page.locator('.mobile-panel-button.mobile-right').click();
    await expect(page.locator('.dock-right')).toHaveClass(/mobile-open/);
    await expect(page.locator('.dock-right .dock-tabs')).toContainText('Classificazione');
    await page.locator('.dock-right .dock-mobile-close').click();
    await expect(page.locator('.dock-right')).not.toHaveClass(/mobile-open/);
  });
});
