import { expect, test } from '@playwright/test';

function luminance(color: string): number {
  const channels = color
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  if (!channels || channels.length !== 3) throw new Error(`Unsupported computed color: ${color}`);
  const linear = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
}

function contrastRatio(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light! + 0.05) / (dark! + 0.05);
}

test('home has meaningful landmarks and no keyboard trap or unexpected focus target', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.keyboard.press('Tab');
  const focusState = await page.evaluate(() => ({
    focusInsideMain: Boolean(document.activeElement?.closest('main')),
    focusableCount: document.querySelectorAll(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ).length,
  }));
  expect(focusState.focusableCount).toBe(0);
  expect(focusState.focusInsideMain).toBe(false);
});

test('visible home text meets AAA contrast and reduced-motion preference is respected', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const colors = await page.locator('h1').evaluate((heading) => ({
    foreground: getComputedStyle(heading).color,
    background: getComputedStyle(document.body).backgroundColor,
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
  }));
  expect(contrastRatio(colors.foreground, colors.background)).toBeGreaterThanOrEqual(7);
  expect(colors.scrollBehavior).toBe('auto');
});
