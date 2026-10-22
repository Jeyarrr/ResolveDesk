import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TicketLifecycle } from './ticket-lifecycle';
import type { ApiTicket } from '../../services/contracts';

const base: ApiTicket = {
  id: 'ticket',
  ticketNumber: 1,
  subject: 'Network issue',
  description: 'A connection problem.',
  categoryId: 'category',
  category: 'Network',
  priority: 'high',
  status: 'resolved',
  requesterId: 'employee',
  assignedAgentId: 'agent',
  requester: { id: 'employee', name: 'Mon', initials: 'M' },
  assignee: { id: 'agent', name: 'George', initials: 'G' },
  resolver: { id: 'agent', name: 'George', initials: 'G' },
  closer: null,
  createdAt: '2026-10-21T00:00:00Z',
  updatedAt: '2026-10-21T01:00:00Z',
  resolvedAt: '2026-10-21T01:00:00Z',
  closedAt: null,
  resolvedBy: 'agent',
  closedBy: null,
  resolutionSummary: 'Replaced the broken adapter and verified connectivity.',
  lifecycleVersion: 2,
  assignmentVersion: 1,
  lifecycleActions: {
    statusTransitions: [],
    resolve: false,
    confirm: true,
    close: false,
    reopen: true,
  },
};
describe('ticket lifecycle controls', () => {
  it('shows requester confirmation and reopening, and hides support and admin actions', () => {
    render(<TicketLifecycle ticket={base} busy={false} update={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Confirm resolution' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Issue still exists' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Mark as resolved' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close ticket' })).not.toBeInTheDocument();
  });
  it('requires explicit confirmation and supports cancel without a request', async () => {
    const update = vi.fn().mockResolvedValue(true),
      user = userEvent.setup();
    render(<TicketLifecycle ticket={base} busy={false} update={update} />);
    await user.click(screen.getByRole('button', { name: 'Confirm resolution' }));
    expect(update).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(update).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirm resolution' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm resolution' }),
    );
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('/confirm-resolution', { expectedVersion: 2 }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('validates reopening reasons and preserves text on server conflicts', async () => {
    const update = vi.fn().mockResolvedValue(false),
      user = userEvent.setup();
    render(
      <TicketLifecycle
        ticket={base}
        busy={false}
        error="This ticket changed. Refresh it before trying again."
        update={update}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Issue still exists' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Reopen ticket' }));
    expect(dialog.getByText('Enter at least 10 characters.')).toBeVisible();
    expect(update).not.toHaveBeenCalled();
    await user.click(dialog.getByLabelText('Reopening reason'));
    await user.paste('The connection still drops during calls.');
    await user.click(dialog.getByRole('button', { name: 'Reopen ticket' }));
    expect(
      await dialog.findByText('This ticket changed. Refresh it before trying again.'),
    ).toBeVisible();
    expect(dialog.getByLabelText('Reopening reason')).toHaveValue(
      'The connection still drops during calls.',
    );
  });
  it('validates resolution notes and sends the version captured when opening the dialog', async () => {
    const update = vi.fn().mockResolvedValue(true),
      user = userEvent.setup();
    const ticket = {
      ...base,
      status: 'in_progress' as const,
      lifecycleVersion: 1,
      lifecycleActions: {
        statusTransitions: [],
        resolve: true,
        confirm: false,
        close: false,
        reopen: false,
      },
    };
    const { rerender } = render(<TicketLifecycle ticket={ticket} busy={false} update={update} />);
    await user.click(screen.getByRole('button', { name: 'Mark as resolved' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Resolve ticket' }));
    expect(dialog.getByText('Enter at least 20 characters.')).toBeVisible();
    await user.click(dialog.getByLabelText('Resolution summary'));
    await user.paste('Replaced the adapter and confirmed stable connectivity.');
    rerender(
      <TicketLifecycle ticket={{ ...ticket, lifecycleVersion: 3 }} busy={false} update={update} />,
    );
    await user.click(dialog.getByRole('button', { name: 'Resolve ticket' }));
    expect(update).toHaveBeenCalledWith('/resolve', {
      expectedVersion: 1,
      summary: 'Replaced the adapter and confirmed stable connectivity.',
    });
  });
  it('disables actions while saving and resets progression when reopened', () => {
    const { rerender } = render(<TicketLifecycle ticket={base} busy={true} update={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Confirm resolution' })).toBeDisabled();
    rerender(
      <TicketLifecycle
        ticket={{
          ...base,
          status: 'open',
          resolutionSummary: null,
          lifecycleActions: {
            statusTransitions: [],
            resolve: false,
            confirm: false,
            close: false,
            reopen: false,
          },
        }}
        busy={false}
        update={vi.fn()}
      />,
    );
    const steps = within(
      screen.getByRole('list', { name: 'Ticket lifecycle progress' }),
    ).getAllByRole('listitem');
    expect(steps[0]).toHaveAttribute('aria-current', 'step');
    expect(steps[2]).toHaveTextContent('Upcoming');
    expect(screen.queryByRole('button', { name: 'Confirm resolution' })).not.toBeInTheDocument();
  });
});
