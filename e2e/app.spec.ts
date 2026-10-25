import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const FIXTURES = path.resolve('e2e/fixtures');

async function openApp(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('terrain-o:onboarding-v1', 'seen');
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
        const text = await page.locator('.counter-row').innerText();
        return Number(text.match(/(\d+) poligoni/)?.[1] ?? 0);
      })
      .toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Valida topologia' }).click();
    await expect(page.getByText(/Topologia valida|problemi di topologia/i).last()).toBeVisible();
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
