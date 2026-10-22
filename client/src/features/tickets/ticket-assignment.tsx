import { useState } from 'react';
import { useApi, useApiMutation } from '../../hooks/use-api';
import type { ApiTicket, AgentWorkload, Page } from '../../services/contracts';
import { Dialog } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { InlineMessage } from '../../components/shared/primitives';
import { QueryState } from '../../components/shared/query-state';

export function TicketAssignment({ ticket }: { ticket: ApiTicket }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [agentId, setAgentId] = useState('');
  const [reason, setReason] = useState('');
  const [version, setVersion] = useState(ticket.assignmentVersion);
  const [message, setMessage] = useState('');
  const mutation = useApiMutation();
  const agents = useApi<Page<AgentWorkload>>(
    '/users/workloads?limit=100&search=' + encodeURIComponent(search),
    open,
  );
  const selected = agents.data?.items.find((a) => a.id === agentId);
  const reassignment = !!ticket.assignedAgentId;
  const locked = ['resolved', 'closed'].includes(ticket.status);
  return (
    <div className="space-y-3">
      <p>{ticket.assignee?.name ?? 'Unassigned'}</p>
      <Button
        size="sm"
        variant="outline"
        disabled={locked}
        onClick={() => {
          setVersion(ticket.assignmentVersion);
          setAgentId('');
          setReason('');
          setSearch('');
          setMessage('');
          mutation.reset();
          setOpen(true);
        }}
      >
        {reassignment ? 'Reassign ticket' : 'Assign ticket'}
      </Button>
      {locked && (
        <p className="text-xs text-muted-foreground">Reopen the ticket to change its assignment.</p>
      )}
      {message && <InlineMessage>{message}</InlineMessage>}
      <Dialog
        className="max-h-[85dvh] overflow-y-auto"
        open={open}
        onOpenChange={(value) => {
          if (!mutation.isPending) setOpen(value);
        }}
        title={reassignment ? 'Reassign ticket' : 'Assign ticket'}
        description={`Current agent: ${ticket.assignee?.name ?? 'Unassigned'}. Confirm the new assignment below. Ticket status and history are preserved.`}
      >
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await mutation.mutateAsync({
                path: `/tickets/${ticket.id}/assign`,
                method: 'PATCH',
                body: {
                  assignedAgentId: agentId === 'unassigned' ? null : agentId,
                  expectedVersion: version,
                  ...(reassignment ? { reason } : {}),
                },
              });
              setOpen(false);
              setMessage('Assignment saved.');
            } catch {
              /* The mutation error remains visible in the dialog. */
            }
          }}
        >
          <label className="label">
            Search active agents
            <input
              className="input"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setAgentId('');
              }}
            />
          </label>
          <QueryState query={agents} />
          <label className="label">
            Assigned agent
            <select
              aria-label="Assigned agent"
              className="select w-full"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              required
            >
              <option value="">Choose an agent</option>
              {reassignment && <option value="unassigned">Unassigned</option>}
              {agents.data?.items
                .filter((a) => a.id !== ticket.assignedAgentId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
          {selected && (
            <div className="rounded-xl border border-border p-3 text-xs text-muted-foreground space-y-2">
              <p>
                {selected.name} · {selected.department ?? 'No department'}
              </p>
              <p>
                Total {selected.total} · Open {selected.open} · In progress {selected.inProgress} ·
                Pending {selected.pending} · Resolved {selected.resolved} · Closed {selected.closed}
              </p>
              <p>
                Total includes resolved and closed tickets. Review these counts before confirming.
              </p>
            </div>
          )}
          {agents.data && agents.data.total > agents.data.items.length && (
            <p className="text-xs text-muted-foreground">Refine your search to find more agents.</p>
          )}
          {reassignment && (
            <label className="label">
              Reassignment reason
              <textarea
                className="input min-h-24"
                required
                minLength={10}
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          )}
          {version !== ticket.assignmentVersion && (
            <InlineMessage error>
              Assignment changed. Close this dialog and review the current agent before retrying.
            </InlineMessage>
          )}
          {mutation.error && <InlineMessage error>{mutation.error.message}</InlineMessage>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={
                mutation.isPending ||
                !agents.data ||
                version !== ticket.assignmentVersion ||
                (reassignment && reason.trim().length < 10) ||
                !agentId
              }
            >
              {mutation.isPending ? 'Saving…' : 'Confirm assignment'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
