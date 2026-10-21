import { useState } from 'react';
import { Check, CircleDot } from 'lucide-react';
import { Card, InlineMessage } from '../../components/shared/primitives';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { formatDate } from '../../lib/utils';
import type { ApiTicket } from '../../services/contracts';

type Action = 'resolve' | 'confirm-resolution' | 'close' | 'reopen';
const titles: Record<Action, string> = {
  resolve: 'Resolve ticket',
  'confirm-resolution': 'Confirm resolution',
  close: 'Close ticket',
  reopen: 'Reopen ticket',
};
export function TicketLifecycle({
  ticket: t,
  busy,
  error,
  update,
}: {
  ticket: ApiTicket;
  busy: boolean;
  error?: string;
  update: (path: string, body: unknown) => Promise<boolean>;
}) {
  const [dialog, setDialog] = useState<{ action: Action; version: number } | null>(null);
  const [text, setText] = useState('');
  const [validation, setValidation] = useState('');
  const [failed, setFailed] = useState(false);
  const actions = t.lifecycleActions;
  const stage =
    t.status === 'open'
      ? 0
      : ['in_progress', 'pending'].includes(t.status)
        ? 1
        : t.status === 'resolved'
          ? 2
          : 3;
  function open(action: Action) {
    setText('');
    setValidation('');
    setFailed(false);
    setDialog({ action, version: t.lifecycleVersion });
  }
  return (
    <>
      <Card
        title="Ticket lifecycle"
        subtitle="Progress reflects the current attempt. Earlier resolutions remain in the activity history."
      >
        <ol
          aria-label="Ticket lifecycle progress"
          className="grid grid-cols-2 gap-3 px-6 pb-6 sm:grid-cols-4"
        >
          {['Open', 'In progress', 'Resolved', 'Closed'].map((label, index) => (
            <li
              key={label}
              aria-current={index === stage ? 'step' : undefined}
              className={`rounded-xl border p-3 text-sm ${index === stage ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
            >
              <span className="mb-2 flex items-center gap-2">
                {index < stage ? (
                  <Check size={16} aria-hidden="true" />
                ) : (
                  <CircleDot size={16} aria-hidden="true" />
                )}
                {label}
              </span>
              <span className="text-xs">
                {index === stage
                  ? t.status === 'pending'
                    ? 'Pending: waiting for a dependency'
                    : 'Current stage'
                  : index < stage
                    ? 'Completed'
                    : 'Upcoming'}
              </span>
            </li>
          ))}
        </ol>
        {t.status === 'pending' && (
          <p className="px-6 pb-5 text-sm text-muted-foreground">
            Pending is a temporary waiting state. Investigation can resume when the dependency is
            ready.
          </p>
        )}
      </Card>
      <Card
        title="Resolution"
        subtitle="Resolution summaries and reopening reasons are visible to the requester."
      >
        <div className="space-y-4 px-6 pb-6">
          {t.status === 'resolved' || t.status === 'closed' ? (
            <>
              <p className="whitespace-pre-wrap break-words text-sm leading-7">
                {t.resolutionSummary ??
                  'This ticket was resolved before structured resolution notes were introduced. Review its existing history for details.'}
              </p>
              <p className="text-xs text-muted-foreground">
                Resolved by {t.resolver?.name ?? 'a previously recorded support user'}
                {t.resolvedAt && ` on ${formatDate(t.resolvedAt, true)}`}
              </p>
              <p className="text-sm">
                {t.status === 'resolved'
                  ? 'Awaiting requester confirmation.'
                  : `Closed${t.closer ? ` by ${t.closer.name}` : ''}${t.closedAt ? ` on ${formatDate(t.closedAt, true)}` : ''}.`}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              This ticket is active. Any previous resolution summaries and reopening reasons are
              preserved below in its history.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {actions?.resolve && (
              <Button disabled={busy} onClick={() => open('resolve')}>
                Mark as resolved
              </Button>
            )}
            {actions?.confirm && (
              <Button disabled={busy} onClick={() => open('confirm-resolution')}>
                Confirm resolution
              </Button>
            )}
            {actions?.reopen && (
              <Button variant="outline" disabled={busy} onClick={() => open('reopen')}>
                {actions.confirm ? 'Issue still exists' : 'Reopen ticket'}
              </Button>
            )}
            {actions?.close && (
              <Button variant="outline" disabled={busy} onClick={() => open('close')}>
                Close ticket
              </Button>
            )}
          </div>
        </div>
      </Card>
      <Dialog
        open={!!dialog}
        onOpenChange={(value) => {
          if (!value && !busy) setDialog(null);
        }}
        title={dialog ? titles[dialog.action] : 'Ticket action'}
        description={
          dialog?.action === 'confirm-resolution'
            ? 'Confirm that the issue is fixed. This closes your ticket; only an administrator can reopen a closed ticket.'
            : dialog?.action === 'resolve'
              ? 'Explain what fixed the issue. The requester will review this public summary.'
              : dialog?.action === 'close'
                ? 'Explain why you are closing this resolved ticket without requester confirmation. Your administrator action will be recorded.'
                : 'Explain why the issue needs further investigation. Earlier resolution attempts will remain in the history.'
        }
      >
        {dialog && (
          <form
            noValidate
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const value = text.trim();
              const minimum = dialog.action === 'resolve' ? 20 : 10;
              if (dialog.action !== 'confirm-resolution' && value.length < minimum) {
                setValidation(`Enter at least ${minimum} characters.`);
                return;
              }
              setValidation('');
              setFailed(false);
              const body = {
                expectedVersion: dialog.version,
                ...(dialog.action === 'resolve'
                  ? { summary: value }
                  : dialog.action === 'confirm-resolution'
                    ? {}
                    : { reason: value }),
              };
              if (await update('/' + dialog.action, body)) setDialog(null);
              else setFailed(true);
            }}
          >
            {dialog.action !== 'confirm-resolution' && (
              <div>
                <label className="label" htmlFor="lifecycle-note">
                  {dialog.action === 'resolve'
                    ? 'Resolution summary'
                    : dialog.action === 'close'
                      ? 'Closure reason'
                      : 'Reopening reason'}
                </label>
                <textarea
                  id="lifecycle-note"
                  className="input"
                  rows={5}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={dialog.action === 'resolve' ? 5000 : 2000}
                  disabled={busy}
                  aria-invalid={!!validation}
                  aria-describedby={validation ? 'lifecycle-validation' : undefined}
                />
                {validation && (
                  <p
                    id="lifecycle-validation"
                    role="alert"
                    className="mt-2 text-sm text-destructive"
                  >
                    {validation}
                  </p>
                )}
              </div>
            )}
            {failed && (
              <InlineMessage error>
                {error ?? 'The action could not be saved. Refresh the ticket and try again.'}
              </InlineMessage>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setDialog(null)}
              >
                Cancel
              </Button>
              <Button disabled={busy}>{busy ? 'Saving…' : titles[dialog.action]}</Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
