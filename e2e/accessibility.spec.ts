import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

const FIXTURES = path.resolve('e2e/fixtures');

async function openApp(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('terrain-o:onboarding-v1', 'seen');
    localStorage.setItem('terrain-o/locale/v1', 'it');
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
}

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2aa', 'wcag21aa']).analyze();
  return result.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => node.target.join(' ')),
  }));
}

test.describe('WCAG AA in the desktop shell', () => {
  test('shell, panels and export dialog have no contrast violations', async ({ page }) => {
    await openApp(page);
    expect(await violations(page), 'empty shell').toEqual([]);

    await importFixture(page);

    // A drawn feature exercises selected rows, source pills and the inspector.
    await page.getByTestId('tool-draw-area').click();
    const box = await page.locator('.map-surface').boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    for (const [x, y] of [
      [0.3, 0.3],
      [0.5, 0.3],
      [0.5, 0.5],
      [0.3, 0.5],
    ]) {
      await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
    }
    await page.keyboard.press('Enter');
    await page.getByTestId('tool-select').click();
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);

    for (const tab of ['Elementi', 'Proprietà', 'Classificazione', 'Vettoriz.', 'AI', 'Storia', 'Info', 'OSM', 'Percorso']) {
      await page.getByRole('tab', { name: tab, exact: true }).first().click();
      expect(await violations(page), `panel ${tab}`).toEqual([]);
    }

    await page.locator('.menu-icon-button[aria-label="Esporta"]').click();
    await expect(page.getByTestId('export-omap')).toBeVisible();
    expect(await violations(page), 'export dialog').toEqual([]);
  });
});
