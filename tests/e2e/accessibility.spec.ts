import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('login, dashboards, forms and responsive layouts remain accessible', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/login');
  let result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
  await page.getByLabel('Email address').fill('admin@resolvedesk.example');
  await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back, Jayr' })).toBeVisible();
  await page.screenshot({ path: 'tmp/phase2-dashboard.png', fullPage: true });
  for (const path of ['/', '/tickets/new', '/team', '/escalations']) {
    await page.goto(path);
    await expect(page.locator('main h1')).toBeVisible();
    result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations).toEqual([]);
  }
  for (const width of [1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/tickets', '/team', '/settings', '/escalations']) {
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  }
});
