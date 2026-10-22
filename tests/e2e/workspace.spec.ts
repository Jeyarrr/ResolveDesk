import { expect, test, type Page } from '@playwright/test';
async function login(page: Page, role: 'admin' | 'agent' | 'employee' = 'admin') {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(role + '@resolvedesk.example');
  await page
    .getByLabel('Password', { exact: true })
    .fill(process.env['E2E_' + role.toUpperCase() + '_PASSWORD']!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Welcome back,/ })).toBeVisible();
}
async function logout(page: Page) {
  await page.getByRole('button', { name: 'Open profile menu' }).click();
  await page.getByRole('menuitem', { name: 'Log out', exact: true }).click();
  await expect(page).toHaveURL(/login$/);
}
test('real login, recovery unavailable, refresh, logout and route guards', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username or email address').fill('');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#email-error')).toBeVisible();
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('status')).toContainText('not yet available');
  await login(page, 'employee');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome back, Mon' })).toBeVisible();
  await page.goto('/team');
  await expect(page).toHaveURL('http://127.0.0.1:5174/');
  await logout(page);
  await page.goto('/tickets/mine');
  await expect(page).toHaveURL(/login$/);
});
test('database ticket workflow across employee, admin and agent sessions', async ({ page }) => {
  test.setTimeout(120000);
  await login(page, 'employee');
  await page.goto('/tickets/new');
  await page.getByRole('button', { name: 'Submit ticket' }).click();
  await expect(page.getByText('Use at least 5 characters.')).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Subject', exact: true })
    .fill('Browser integration VPN issue');
  await page
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill('The company VPN disconnects during calls and blocks the project workspace.');
  await page
    .getByRole('combobox', { name: 'Category', exact: true })
    .selectOption({ label: 'Network' });
  await page.getByRole('combobox', { name: 'Priority', exact: true }).selectOption('High');
  await page.getByRole('button', { name: 'Submit ticket' }).click();
  await expect(page.getByRole('heading', { name: 'Browser integration VPN issue' })).toBeVisible();
  const url = page.url();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Browser integration VPN issue' })).toBeVisible();
  await logout(page);
  await login(page);
  await page.goto(url);
  await page.getByRole('button', { name: 'Assign ticket', exact: true }).click();
  await page.getByLabel('Assigned agent', { exact: true }).selectOption({ label: 'George' });
  await page.getByRole('button', { name: 'Confirm assignment' }).click();
  await expect(page.getByText('Assignment saved.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reassign ticket', exact: true }).click();
  await page.getByLabel('Assigned agent', { exact: true }).selectOption('unassigned');
  await expect(page.getByRole('button', { name: 'Confirm assignment' })).toBeDisabled();
  await page
    .getByLabel('Reassignment reason')
    .fill('Return to the queue for administrator review.');
  await page.getByRole('button', { name: 'Confirm assignment' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Assign ticket', exact: true }).click();
  await page.getByLabel('Assigned agent', { exact: true }).selectOption({ label: 'George' });
  await expect(
    page.getByRole('dialog').getByText(/Total includes resolved and closed/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Confirm assignment' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Ticket priority', { exact: true }).selectOption('critical');
  await expect(page.getByLabel('Ticket priority', { exact: true })).toBeEnabled();
  await logout(page);
  await login(page, 'agent');
  await page.goto(url);
  await page.getByRole('button', { name: 'Escalate ticket', exact: true }).click();
  await page
    .getByLabel('Escalation reason')
    .fill('Administrator authorization is needed for network hardware replacement.');
  await page.getByRole('button', { name: 'Confirm escalation request' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Active escalation: open', { exact: true })).toBeVisible();
  await logout(page);
  await login(page);
  await page.goto('/escalations');
  await expect(page.getByRole('table')).toContainText('George');
  await page.getByLabel('Search escalated tickets').fill('Browser integration VPN issue');
  await page.getByRole('button', { name: 'Acknowledge', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm escalation update' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Escalation: acknowledged', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resolve escalation', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm escalation update' }).click();
  await expect(page.getByText('No escalations match this view.')).toBeVisible();
  await page.getByLabel('Escalation state').selectOption('resolved');
  await expect(page.getByText('Escalation: resolved', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await logout(page);
  await login(page, 'agent');
  await page.goto(url);
  await page.getByLabel('Ticket status', { exact: true }).selectOption('in_progress');
  await expect(page.getByLabel('Ticket status', { exact: true })).toBeEnabled();
  await page.getByLabel('Add a reply').fill('Private agent investigation');
  await page.getByLabel('Internal note (support staff only)').check();
  await page.getByRole('button', { name: 'Post internal note' }).click();
  await expect(
    page.getByRole('article').getByText('Private agent investigation', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Internal note (support staff only)').uncheck();
  await page
    .getByLabel('Add a reply')
    .fill('Updated the VPN configuration and verified connectivity.');
  await page.getByRole('button', { name: 'Post reply', exact: true }).click();
  await expect(
    page.getByRole('article').getByText('Updated the VPN configuration and verified connectivity.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Mark as resolved', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Resolve ticket', exact: true }).click();
  await expect(dialog.getByText('Enter at least 20 characters.')).toBeVisible();
  await dialog
    .getByLabel('Resolution summary')
    .fill('Replaced the VPN configuration and verified stable connectivity.');
  await dialog.getByRole('button', { name: 'Resolve ticket', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Awaiting requester confirmation.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm resolution', exact: true })).toHaveCount(
    0,
  );
  await logout(page);
  await login(page, 'employee');
  await page.goto(url);
  await expect(
    page.getByRole('article').getByText('Updated the VPN configuration and verified connectivity.'),
  ).toBeVisible();
  await expect(page.getByText('Private agent investigation')).toHaveCount(0);
  await expect(page.getByLabel('Ticket status', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Resolution submitted', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark as resolved', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Issue still exists', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Reopen ticket', exact: true }).click();
  await expect(dialog.getByText('Enter at least 10 characters.')).toBeVisible();
  await dialog
    .getByLabel('Reopening reason')
    .fill('The VPN still disconnects when I start a video meeting.');
  await dialog.getByRole('button', { name: 'Reopen ticket', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Ticket reopened', { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByText('The VPN still disconnects when I start a video meeting.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Replaced the VPN configuration and verified stable connectivity.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('[aria-current="step"]')).toContainText('Open');
  await logout(page);
  await login(page, 'agent');
  await page.goto(url);
  await page.getByLabel('Ticket status', { exact: true }).selectOption('in_progress');
  await page.getByRole('button', { name: 'Mark as resolved', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Resolution summary')
    .fill('Replaced the faulty adapter and confirmed the VPN remains stable during calls.');
  await dialog.getByRole('button', { name: 'Resolve ticket', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await logout(page);
  await login(page, 'employee');
  await page.goto(url);
  await page.getByRole('button', { name: 'Confirm resolution', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('Awaiting requester confirmation.')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm resolution', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirm resolution', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText('Resolution confirmed and ticket closed', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Issue still exists', exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator('[aria-current="step"]')).toContainText('Closed');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('admin account creation and reference management persist', async ({ page }) => {
  await login(page);
  await page.goto('/team');
  await page.getByRole('button', { name: 'Create account' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Full name').fill('Browser Colleague');
  await dialog.getByLabel('Email', { exact: true }).fill('browser-colleague@resolvedesk.example');
  await dialog.getByRole('button', { name: 'Save account' }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByLabel('Search team').fill('browser-colleague');
  await expect(page.getByText('Browser Colleague', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByLabel('Search team').fill('browser-colleague');
  await expect(page.getByText('Awaiting provisioning')).toBeVisible();
  await page.goto('/reports');
  await page.getByLabel('Report date range').selectOption('7');
  await expect(page.getByRole('img', { name: /Ticket volume/ })).toBeVisible();
  await page.goto('/notifications');
  await expect(
    page.getByRole('heading', { name: 'Notifications are not yet available' }),
  ).toBeVisible();
});
test('mobile navigation, theme persistence, health and knowledge guides', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'My Tickets', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My tickets', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await page.goto('/settings');
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.getByRole('button', { name: 'Check API health' }).click();
  await expect(page.getByText('resolvedesk-api: ok')).toBeVisible();
  await page.goto('/knowledge');
  await page.getByLabel('Search articles').fill('printer');
  await page.getByRole('link', { name: /Troubleshoot an offline printer/ }).click();
  await expect(page.getByRole('heading', { name: 'Check the basics' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
