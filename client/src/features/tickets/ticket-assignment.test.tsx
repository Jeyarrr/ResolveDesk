import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TicketAssignment } from './ticket-assignment';
import { EscalationActions } from './ticket-escalations';
import type { ApiTicket, Escalation } from '../../services/contracts';

const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn(), reset: vi.fn() }));
vi.mock('../../hooks/use-api', () => ({
  useApi: () => ({
    data: {
      total: 1,
      items: [
        {
          id: 'new-agent',
          name: 'Specialist',
          department: 'IT',
          total: 5,
          open: 1,
          inProgress: 1,
          pending: 1,
          resolved: 1,
          closed: 1,
        },
      ],
    },
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
  useApiMutation: () => ({ ...mocks, isPending: false, error: null }),
}));
const ticket = {
  id: 'ticket',
  assignmentVersion: 3,
  assignedAgentId: 'old-agent',
  assignee: { id: 'old-agent', name: 'George', initials: 'G' },
  status: 'open',
} as ApiTicket;
beforeEach(() => {
  mocks.mutateAsync.mockReset().mockResolvedValue({});
  mocks.reset.mockClear();
});

describe('assignment and escalation confirmations', () => {
  it('shows workload, requires a reason, and sends the captured assignment version only after confirmation', async () => {
    const user = userEvent.setup();
    render(<TicketAssignment ticket={ticket} />);
    await user.click(screen.getByRole('button', { name: 'Reassign ticket' }));
    await user.selectOptions(screen.getByLabelText('Assigned agent', { exact: true }), 'new-agent');
    expect(screen.getByText(/Total 5/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirm assignment' })).toBeDisabled();
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    await user.click(screen.getByLabelText('Reassignment reason'));
    await user.paste('A specialist is needed to handle this request.');
    await user.click(screen.getByRole('button', { name: 'Confirm assignment' }));
    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      path: '/tickets/ticket/assign',
      method: 'PATCH',
      body: {
        assignedAgentId: 'new-agent',
        expectedVersion: 3,
        reason: 'A specialist is needed to handle this request.',
      },
    });
    expect(await screen.findByText('Assignment saved.')).toBeVisible();
  });
  it('cancels without saving and blocks a stale dialog after a ticket refresh', async () => {
    const user = userEvent.setup();
    const view = render(<TicketAssignment ticket={ticket} />);
    await user.click(screen.getByRole('button', { name: 'Reassign ticket' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Reassign ticket' }));
    view.rerender(<TicketAssignment ticket={{ ...ticket, assignmentVersion: 4 }} />);
    expect(screen.getByText(/Assignment changed/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirm assignment' })).toBeDisabled();
  });
  it('disables assignment on resolved and closed tickets', () => {
    const view = render(<TicketAssignment ticket={{ ...ticket, status: 'resolved' }} />);
    expect(screen.getByRole('button', { name: 'Reassign ticket' })).toBeDisabled();
    view.rerender(<TicketAssignment ticket={{ ...ticket, status: 'closed' }} />);
    expect(screen.getByRole('button', { name: 'Reassign ticket' })).toBeDisabled();
  });
  it('confirms escalation updates with the observed state and supports keyboard cancellation', async () => {
    const user = userEvent.setup();
    render(
      <EscalationActions
        escalation={
          {
            id: 'escalation',
            reason: 'Administrator authorization is required.',
            status: 'open',
          } as Escalation
        }
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Acknowledge' }));
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Acknowledge' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm escalation update' }),
    );
    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      path: '/escalations/escalation/acknowledge',
      method: 'PATCH',
      body: { expectedStatus: 'open' },
    });
  });
});
