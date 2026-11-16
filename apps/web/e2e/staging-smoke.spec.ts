import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('home page renders and has no automated accessibility violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cafetería');

  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test('health endpoint returns the platform HTTP contract', async ({ request }) => {
  const response = await request.get(
    `${process.env.API_BASE_URL ?? 'http://127.0.0.1:4000'}/health`,
  );
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toEqual({ status: 'ok' });
});
