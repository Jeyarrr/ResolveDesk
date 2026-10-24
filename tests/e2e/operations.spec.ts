import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function login(page: Page, role: string) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(role + '@resolvedesk.example');
  await page
    .getByLabel('Password', { exact: true })
    .fill(process.env['E2E_' + role.toUpperCase() + '_PASSWORD']!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Welcome back,/ })).toBeVisible();
}
test('three simultaneous roles receive live updates, private notes stay private, and reports export real results', async ({
  browser,
}) => {
  test.setTimeout(240000);
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const [admin, agent, employee] = await Promise.all(contexts.map((c) => c.newPage()));
  for (const page of [admin, agent, employee]) page!.setDefaultTimeout(15000);
  try {
    await Promise.all([
      login(admin!, 'admin'),
      login(agent!, 'agent'),
      login(employee!, 'employee'),
    ]);
    await admin!.goto('/notifications');
    await agent!.goto('/tickets/mine');
    await employee!.goto('/tickets/new');
    const subject = 'Phase four live printer ' + Date.now();
    await employee!.getByRole('textbox', { name: 'Subject', exact: true }).fill(subject);
    await employee!
      .getByRole('textbox', { name: 'Description', exact: true })
      .fill('The shared printer is disconnected from the office wireless network.');
    await employee!
      .getByRole('combobox', { name: 'Category', exact: true })
      .selectOption({ label: 'Network' });
    await employee!.getByRole('button', { name: 'Submit ticket' }).click();
    await expect(employee!.getByRole('heading', { name: subject })).toBeVisible();
    const url = employee!.url(),
      id = url.split('/').at(-1)!;
    await expect(
      employee!.getByText('First public support response', { exact: true }),
    ).toBeVisible();
    const number = await employee!.locator('.ticket-detail-heading .font-mono').innerText();
    await expect(
      admin!.getByRole('link', { name: 'New ticket created · ' + number }),
    ).toBeVisible();
    await admin!.goto(url);
    await admin!.getByRole('button', { name: 'Assign ticket', exact: true }).click();
    await admin!.getByLabel('Assigned agent', { exact: true }).selectOption({ label: 'George' });
    await admin!.getByRole('button', { name: 'Confirm assignment' }).click();
    await expect(admin!.getByRole('dialog')).toHaveCount(0);
    await expect(agent!.getByRole('link', { name: new RegExp(subject) }).first()).toBeVisible();
    await agent!.goto('/notifications');
    await expect(agent!.getByRole('link', { name: 'Ticket assigned · ' + number })).toBeVisible();
    await agent!.goto(url);
    await agent!.getByLabel('Ticket status', { exact: true }).selectOption('in_progress');
    await agent!
      .getByLabel('Add a reply')
      .fill('Please reconnect the printer to the office wireless network.');
    await agent!.getByRole('button', { name: 'Post reply', exact: true }).click();
    await expect(
      employee!
        .getByRole('article')
        .getByText('Please reconnect the printer to the office wireless network.'),
    ).toBeVisible();
    await employee!
      .getByLabel('Add a reply')
      .fill('The printer is now connected but the job is still pending.');
    await employee!.getByRole('button', { name: 'Post reply', exact: true }).click();
    await expect(
      agent!
        .getByRole('article')
        .getByText('The printer is now connected but the job is still pending.'),
    ).toBeVisible();
    await agent!.getByLabel('Internal note (support staff only)').check();
    await agent!.getByLabel('Add a reply').fill('Private phase four troubleshooting detail.');
    await agent!.getByRole('button', { name: 'Post internal note' }).click();
    await expect(
      agent!.getByRole('article').getByText('Private phase four troubleshooting detail.'),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const r = await employee!.request.get(`/api/tickets/${id}/comments`);
        return JSON.stringify(await r.json());
      })
      .not.toContain('Private phase four troubleshooting detail.');
    await expect(employee!.getByText('Private phase four troubleshooting detail.')).toHaveCount(0);
    await agent!.getByRole('button', { name: 'Escalate ticket', exact: true }).click();
    await agent!
      .getByLabel('Escalation reason')
      .fill('Administrator approval is required for the replacement printer adapter.');
    await agent!.getByRole('button', { name: 'Confirm escalation request' }).click();
    await expect(agent!.getByRole('dialog')).toHaveCount(0);
    await admin!.goto('/notifications');
    await expect(
      admin!.getByRole('link', { name: 'Escalation requested · ' + number }),
    ).toBeVisible();
    await admin!.goto('/escalations');
    await admin!.getByLabel('Search escalated tickets').fill(subject);
    await admin!.getByRole('button', { name: 'Acknowledge', exact: true }).click();
    await admin!.getByRole('button', { name: 'Confirm escalation update' }).click();
    await expect(admin!.getByRole('dialog')).toHaveCount(0);
    await agent!.getByRole('button', { name: 'Mark as resolved', exact: true }).click();
    await agent!
      .getByLabel('Resolution summary')
      .fill('Replaced the printer adapter and verified a successful test page.');
    await agent!.getByRole('button', { name: 'Resolve ticket', exact: true }).click();
    await expect(agent!.getByRole('dialog')).toHaveCount(0);
    await expect(
      employee!.getByRole('button', { name: 'Confirm resolution', exact: true }),
    ).toBeVisible();
    await employee!.goto('/notifications');
    await expect(
      employee!.getByRole('link', { name: 'Ticket resolved · ' + number }),
    ).toBeVisible();
    await employee!.getByRole('button', { name: 'Mark all as read' }).click();
    await expect(employee!.getByRole('button', { name: 'Notifications, 0 unread' })).toBeVisible();
    await employee!.reload();
    await expect(employee!.getByRole('button', { name: 'Notifications, 0 unread' })).toBeVisible();
    await employee!.goto(url);
    await employee!.getByRole('button', { name: 'Confirm resolution', exact: true }).click();
    await employee!
      .getByRole('dialog')
      .getByRole('button', { name: 'Confirm resolution', exact: true })
      .click();
    await expect(employee!.getByRole('dialog')).toHaveCount(0);
    await admin!.goto('/reports');
    await expect(admin!.getByRole('heading', { name: 'Reports & analytics' })).toBeVisible();
    await admin!
      .getByRole('combobox', { name: 'Ticket status', exact: true })
      .selectOption('closed');
    const download = admin!.waitForEvent('download');
    await admin!.getByRole('button', { name: 'Export summary CSV' }).click();
    expect((await download).suggestedFilename()).toContain('resolvedesk-summary');
    const report = await (await admin!.request.get('/api/reports/export?status=closed')).text();
    expect(report).toContain(subject);
    expect(report).not.toContain('Private phase four troubleshooting detail.');
    const sla = (await (await employee!.request.get(`/api/tickets/${id}/sla`)).json()).data[0];
    expect(sla.firstRespondedAt).toBeTruthy();
    expect(sla.resolvedAt).toBeTruthy();
    for (const path of ['/reports', '/notifications', '/settings']) {
      await admin!.goto(path);
      await expect(admin!.locator('main h1')).toBeVisible();
      await expect(admin!.getByText('Loading your workspace…', { exact: true })).toHaveCount(0);
      if (path === '/reports')
        await expect(admin!.getByRole('button', { name: 'Export summary CSV' })).toBeEnabled();
      if (path === '/settings')
        await expect(admin!.getByText('Critical priority', { exact: true })).toBeVisible();
      expect(
        (
          await new AxeBuilder({ page: admin! })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      for (const width of [375, 430, 768, 1366, 1920]) {
        await admin!.setViewportSize({ width, height: 900 });
        expect(
          await admin!.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        ).toBe(true);
      }
    }
    await admin!.setViewportSize({ width: 1366, height: 900 });
    await admin!.goto('/reports');
    await expect(admin!.getByRole('button', { name: 'Export summary CSV' })).toBeEnabled();
    await expect(
      admin!.getByRole('heading', { name: 'Agent measurements', exact: true }),
    ).toBeVisible();
    await admin!.screenshot({ path: 'tmp/phase4-reports.png', fullPage: true });
    await admin!.setViewportSize({ width: 375, height: 900 });
    await admin!.screenshot({ path: 'tmp/phase4-reports-mobile.png', fullPage: true });
    await admin!.getByRole('button', { name: 'Switch to light mode' }).click();
    expect(
      (await new AxeBuilder({ page: admin! }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await admin!.screenshot({ path: 'tmp/phase4-reports-light.png', fullPage: true });
    await admin!.setViewportSize({ width: 1366, height: 900 });
    // A real transport interruption triggers a REST resync when the same session reconnects.
    await employee!.goto(url);
    await expect(employee!.getByRole('heading', { name: subject })).toBeVisible();
    await contexts[2]!.setOffline(true);
    await expect(
      employee!.getByText('Live updates unavailable. Reconnecting; refresh still works.'),
    ).toBeVisible({ timeout: 60000 });
    await admin!.goto(url);
    await admin!.getByRole('button', { name: 'Reopen ticket', exact: true }).click();
    await admin!
      .getByLabel('Reopening reason')
      .fill('The printer failed again after the overnight office network update.');
    await admin!
      .getByRole('dialog')
      .getByRole('button', { name: 'Reopen ticket', exact: true })
      .click();
    await expect(admin!.getByRole('dialog')).toHaveCount(0);
    await contexts[2]!.setOffline(false);
    await expect(
      employee!.getByText('Live updates unavailable. Reconnecting; refresh still works.'),
    ).toHaveCount(0, { timeout: 20000 });
    await expect(employee!.getByText('Previous SLA cycles')).toBeVisible({ timeout: 20000 });
    expect(
      (await (await employee!.request.get(`/api/tickets/${id}/sla`)).json()).data,
    ).toHaveLength(2);
  } finally {
    await Promise.allSettled(contexts.map((c) => c.close()));
  }
});
