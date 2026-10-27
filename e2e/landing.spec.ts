import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('download page', () => {
  test('explains the program, its limits and links the Windows installer', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('orienteering');
    await expect(page.locator('#download')).toHaveAttribute(
      'href',
      /releases\/latest\/download\/Terrain-O-Setup\.exe$/,
    );
    await expect(page.getByRole('link', { name: 'Prova nel browser' })).toHaveAttribute(
      'href',
      './editor.html',
    );
    await expect(page.getByText('Non dichiara mai')).toBeVisible();
    await expect(page.getByText('Avviso di Windows')).toBeVisible();
    await expect(page.getByText('Quattro provenienze, sempre distinte')).toBeVisible();
  });

  test('switches to English and remembers the choice', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Switch to English' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Preliminary orienteering maps',
    );
    await expect(page).toHaveTitle(/Desktop editor/);
    await expect(page.getByRole('button', { name: /Passa all/ })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Preliminary orienteering maps',
    );
  });

  test('has no WCAG AA violations in either language', async ({ page }) => {
    await page.goto('/');

    const analyze = async () => {
      const result = await new AxeBuilder({ page }).withTags(['wcag2aa', 'wcag21aa']).analyze();
      return result.violations.map((violation) => ({
        id: violation.id,
        nodes: violation.nodes.map((node) => node.target.join(' ')),
      }));
    };

    expect(await analyze(), 'italian landing').toEqual([]);
    await page.getByRole('button', { name: 'Switch to English' }).click();
    expect(await analyze(), 'english landing').toEqual([]);
  });
});
