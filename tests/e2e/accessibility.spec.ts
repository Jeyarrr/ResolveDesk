import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('login, dashboards, forms and responsive layouts remain accessible', async ({ page }) => {
  test.setTimeout(300000);
  await page.goto('/login');
  await page.screenshot({ path: 'tmp/phase45-login.png', fullPage: true });
  let result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
  await page.getByLabel('Email address').fill('admin@resolvedesk.example');
  await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back, Jayr' })).toBeVisible();
  await page.screenshot({ path: 'tmp/phase45-admin.png', fullPage: true });
  for (const path of ['/', '/tickets/new', '/team', '/escalations', '/settings']) {
    await page.goto(path);
    await expect(page.locator('main h1')).toBeVisible();
    result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations).toEqual([]);
    if (path !== '/')
      await page.screenshot({
        path: 'tmp/phase45' + path.replaceAll('/', '-') + '.png',
        fullPage: true,
      });
  }
  for (const width of [375, 430, 768, 1024, 1366, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/tickets', '/team', '/settings', '/escalations', '/reports']) {
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      if (path === '/') {
        const metric = await page
          .locator('.metrics-operations > .metric-card')
          .first()
          .boundingBox();
        expect(metric!.width).toBeLessThan(width / 2);
        await page.screenshot({ path: `tmp/phase45-admin-${width}.png`, fullPage: true });
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  }
  await page.setViewportSize({ width: 1366, height: 900 });
  for (const format of ['summary', 'performance', 'agents', 'sla']) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: `Export ${format} CSV`, exact: true }).click();
    expect((await download).suggestedFilename()).toContain('resolvedesk-' + format);
  }
  for (const role of ['agent', 'employee']) {
    await page.getByRole('button', { name: 'Open profile menu' }).click();
    await page.getByRole('menuitem', { name: 'Log out', exact: true }).click();
    await expect(page).toHaveURL(/login$/);
    await page.getByLabel('Email address').fill(role + '@resolvedesk.example');
    await page
      .getByLabel('Password', { exact: true })
      .fill(process.env['E2E_' + role.toUpperCase() + '_PASSWORD']!);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Welcome back,/ })).toBeVisible();
    for (const width of [1366, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: 'tmp/phase45-' + role + '-' + width + '.png', fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations).toEqual([]);
    await page.setViewportSize({ width: 1366, height: 900 });
    if (role === 'agent') {
      const legend = page.getByRole('button', { name: 'Highlight High', exact: true });
      if (await legend.count()) {
        await legend.click();
        await expect(legend).toHaveAttribute('aria-pressed', 'true');
        await legend.click();
        await expect(legend).toHaveAttribute('aria-pressed', 'false');
      }
    }
  }
});
