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

test('keyboard users can reveal the skip link, see its focus and reach the main landmark', async ({
  page,
}) => {
  await page.goto('/');
  const main = page.getByRole('main');
  const skipLink = page.getByRole('link', { name: 'Saltar al contenido' });
  await expect(main).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(skipLink).not.toBeInViewport();
  await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeInViewport();
  await expect(skipLink).toHaveCSS('outline-style', 'solid');
  await expect(skipLink).toHaveCSS('outline-width', '3px');
  const focusColors = await skipLink.evaluate((link) => {
    const style = getComputedStyle(link);
    return {
      outline: style.outlineColor,
      foreground: style.color,
      background: style.backgroundColor,
    };
  });
  expect(contrastRatio(focusColors.outline, focusColors.background)).toBeGreaterThanOrEqual(3);
  expect(contrastRatio(focusColors.foreground, focusColors.background)).toBeGreaterThanOrEqual(7);
  await page.keyboard.press('Enter');
  await expect(main).toBeFocused();
  await expect(page).toHaveURL(/#contenido$/);
  await page.keyboard.press('Shift+Tab');
  await expect(skipLink).toBeFocused();
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
