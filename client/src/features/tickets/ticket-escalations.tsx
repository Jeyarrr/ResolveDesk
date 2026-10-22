import { useState } from 'react';
import { useApp } from '../../app/context';
import { useApi, useApiMutation } from '../../hooks/use-api';
import type { ApiTicket, Escalation, Page } from '../../services/contracts';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Card, InlineMessage } from '../../components/shared/primitives';
import { QueryState } from '../../components/shared/query-state';
import { formatDate } from '../../lib/utils';

export function EscalationActions({
  escalation,
  onSuccess,
}: {
  escalation: Escalation;
  onSuccess?: () => void;
}) {
  const [action, setAction] = useState<'acknowledge' | 'resolve' | null>(null);
  const [expectedStatus, setExpectedStatus] = useState(escalation.status);
  const [message, setMessage] = useState('');
  const mutation = useApiMutation();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(['acknowledge', 'resolve'] as const)
          .filter(
            (a) =>
              escalation.status !== 'resolved' &&
              (a !== 'acknowledge' || escalation.status === 'open'),
          )
          .map((a) => (
            <Button
              key={a}
              size="sm"
              variant="outline"
              onClick={() => {
                mutation.reset();
                setMessage('');
                setExpectedStatus(escalation.status);
                setAction(a);
              }}
            >
              {a === 'acknowledge' ? 'Acknowledge' : 'Resolve escalation'}
            </Button>
          ))}
      </div>
      {message && <InlineMessage>{message}</InlineMessage>}
      <Dialog
        className="max-h-[85dvh] overflow-y-auto"
        open={action !== null}
        onOpenChange={(v) => {
          if (!v && !mutation.isPending) setAction(null);
        }}
        title={action === 'acknowledge' ? 'Acknowledge escalation' : 'Resolve escalation'}
        description="Confirm this escalation update. The ticket retains its current lifecycle status."
      >
        <p className="mb-4 whitespace-pre-wrap break-words text-sm">{escalation.reason}</p>
        {mutation.error && <InlineMessage error>{mutation.error.message}</InlineMessage>}
        {expectedStatus !== escalation.status && (
          <InlineMessage error>
            The escalation changed. Close this dialog and review its state.
          </InlineMessage>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={mutation.isPending} onClick={() => setAction(null)}>
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending || expectedStatus !== escalation.status}
            onClick={async () => {
              try {
                await mutation.mutateAsync({
                  path: `/escalations/${escalation.id}/${action}`,
                  method: 'PATCH',
                  body: { expectedStatus },
                });
                setAction(null);
                setMessage('Escalation updated.');
                onSuccess?.();
              } catch {
                /* Error displayed above. */
              }
            }}
          >
            {mutation.isPending ? 'Saving…' : 'Confirm escalation update'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

export function EscalationHistory({ escalation: e }: { escalation: Escalation }) {
  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium capitalize">Escalation: {e.status}</p>
      <p className="whitespace-pre-wrap break-words text-muted-foreground">{e.reason}</p>
      <p className="text-xs text-muted-foreground">
        Requested by {e.requestedByName} · {formatDate(e.createdAt, true)}
      </p>
      {e.acknowledgedAt && (
        <p className="text-xs text-muted-foreground">
          Acknowledged by {e.acknowledgedByName} · {formatDate(e.acknowledgedAt, true)}
        </p>
      )}
      {e.resolvedAt && (
        <p className="text-xs text-muted-foreground">
          Escalation resolved by {e.resolvedByName} · {formatDate(e.resolvedAt, true)}
        </p>
      )}
    </div>
  );
}

export function TicketEscalations({ ticket }: { ticket: ApiTicket }) {
  const { user } = useApp();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const history = useApi<Page<Escalation>>(
    `/tickets/${ticket.id}/escalations?state=all&limit=5&page=${page}`,
  );
  const active = useApi<Page<Escalation>>(`/tickets/${ticket.id}/escalations?state=active&limit=1`);
  const mutation = useApiMutation();
  const canRequest =
    user?.role === 'agent' &&
    !['resolved', 'closed'].includes(ticket.status) &&
    active.data?.total === 0;
  return (
    <Card title="Escalations">
      <div className="space-y-4 px-6 pb-6">
        <p className="text-xs text-muted-foreground">
          Private to the assigned agent and administrators. Escalations do not change ticket status.
        </p>
        <QueryState query={active} />
        {active.data && active.data.total > 0 && (
          <InlineMessage>Active escalation: {active.data.items[0]?.status}</InlineMessage>
        )}
        {canRequest && (
          <Button
            variant="outline"
            onClick={() => {
              mutation.reset();
              setMessage('');
              setReason('');
              setOpen(true);
            }}
          >
            Escalate ticket
          </Button>
        )}
        {message && <InlineMessage>{message}</InlineMessage>}
        <QueryState query={history} />
        {history.data?.total === 0 && (
          <p className="text-sm text-muted-foreground">No escalation requests.</p>
        )}
        {history.data?.items.map((e) => (
          <div key={e.id} className="space-y-3 rounded-xl border border-border p-4">
            <EscalationHistory escalation={e} />
            {user?.role === 'admin' && <EscalationActions escalation={e} />}
          </div>
        ))}
        {history.data && history.data.total > 5 && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous escalations
            </Button>
            <span className="text-xs">Page {page}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={page * 5 >= history.data.total}
              onClick={() => setPage(page + 1)}
            >
              Next escalations
            </Button>
          </div>
        )}
        <Dialog
          className="max-h-[85dvh] overflow-y-auto"
          open={open}
          onOpenChange={(v) => {
            if (!mutation.isPending) setOpen(v);
          }}
          title="Escalate ticket"
          description="Explain the administrator assistance you need, such as authorization, specialist support, or a security concern."
        >
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await mutation.mutateAsync({
                  path: `/tickets/${ticket.id}/escalations`,
                  body: { reason },
                });
                setOpen(false);
                setPage(1);
                setMessage('Escalation requested.');
              } catch {
                /* Error displayed below. */
              }
            }}
          >
            <label className="label">
              Escalation reason
              <textarea
                className="input min-h-28"
                required
                minLength={10}
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
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
              <Button disabled={mutation.isPending || reason.trim().length < 10 || !canRequest}>
                {mutation.isPending ? 'Submitting…' : 'Confirm escalation request'}
              </Button>
            </div>
          </form>
        </Dialog>
      </div>
    </Card>
  );
}
