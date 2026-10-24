import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi, useApiMutation } from '../../hooks/use-api';
import { useApp } from '../../app/context';
import type { SlaOverview, SlaPolicy, TicketSla } from '../../services/operations-contracts';
import { Card, InlineMessage } from '../../components/shared/primitives';
import { QueryState } from '../../components/shared/query-state';
import { Dialog } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
const minutes = (n: number | null) =>
  n === null ? 'No completed measurement' : `${Math.round(n)} business minutes`;
function Deadline({
  label,
  due,
  state,
  remaining,
}: {
  label: string;
  due: string;
  state: string;
  remaining: number | null;
}) {
  return (
    <div className="space-y-1 rounded-lg border border-border p-3">
      <p className="text-sm font-medium">{label}</p>
      <p
        className={`text-xs ${state.includes('Breach') ? 'text-amber-700 dark:text-amber-400' : 'text-primary'}`}
      >
        {state}
      </p>
      <time className="block text-xs text-muted-foreground" dateTime={due}>
        {new Date(due).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} Manila
      </time>
      {remaining !== null && (
        <p className="text-xs text-muted-foreground">{minutes(remaining)} remaining</p>
      )}
    </div>
  );
}
export function TicketSlaPanel({ ticketId }: { ticketId: string }) {
  const q = useApi<TicketSla[]>(`/tickets/${ticketId}/sla`),
    c = q.data?.[0];
  return (
    <Card
      title="Service targets"
      subtitle="Business hours apply. Pending does not pause deadlines."
    >
      <div className="space-y-3 px-6 pb-6">
        <QueryState query={q} />
        {c ? (
          <>
            <p className="text-xs text-muted-foreground">
              {c.snapshot.name} · Cycle {c.cycle}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Deadline
                label="First public support response"
                due={c.responseDueAt}
                state={c.responseState}
                remaining={c.responseRemainingMinutes}
              />
              <Deadline
                label="Resolution"
                due={c.resolutionDueAt}
                state={c.resolutionState}
                remaining={c.resolutionRemainingMinutes}
              />
            </div>
            {q.data!.length > 1 && (
              <details>
                <summary className="cursor-pointer text-xs">Previous SLA cycles</summary>
                {q.data!.slice(1).map((r) => (
                  <p className="mt-2 text-xs" key={r.id}>
                    Cycle {r.cycle}: response {r.responseState}; resolution {r.resolutionState}
                  </p>
                ))}
              </details>
            )}
          </>
        ) : (
          q.data && (
            <p className="text-sm text-muted-foreground">
              No SLA cycle recorded. Existing active tickets are enrolled by the background worker
              when a policy is enabled.
            </p>
          )
        )}
      </div>
    </Card>
  );
}
export function SlaDashboard() {
  const q = useApi<SlaOverview>('/sla/overview'),
    { user } = useApp();
  if (!q.data) return <QueryState query={q} />;
  const d = q.data;
  return (
    <Card
      title={user?.role === 'admin' ? 'SLA operations' : 'My service targets'}
      subtitle="Current cycles; completed compliance requires both targets met."
    >
      <div className="space-y-4 px-6 pb-6">
        {d.limited && (
          <InlineMessage>
            Overview limited to the earliest 1,000 tracked tickets. Use filtered reports for larger
            cohorts.
          </InlineMessage>
        )}
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Object.entries({
            'Tracked tickets': d.tracked,
            'Completed within target': d.compliant,
            'Approaching deadline': d.approaching,
            'Response breaches': d.responseBreached,
            'Resolution breaches': d.resolutionBreached,
            'Completed compliance':
              d.compliance === null ? 'No completed cycles' : `${d.compliance.toFixed(1)}%`,
            'High priority active': d.highPriority,
            ...(user?.role === 'employee'
              ? {}
              : {
                  'Average first response': minutes(d.averageResponseMinutes),
                  'Average resolution': minutes(d.averageResolutionMinutes),
                }),
          }).map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-sm font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="space-y-2">
          {d.items.slice(0, 10).map((t) => (
            <Link
              key={t.id}
              to={`/tickets/${t.ticketId}`}
              className="block rounded-lg border border-border p-3"
            >
              <strong className="break-words text-sm">
                RD-{t.ticketNumber} · {t.subject}
              </strong>
              <span className="mt-1 block text-xs text-muted-foreground">
                Response: {t.responseState}
                {t.responseRemainingMinutes !== null
                  ? ` (${minutes(t.responseRemainingMinutes)} remaining)`
                  : ''}{' '}
                · Resolution: {t.resolutionState}
                {t.resolutionRemainingMinutes !== null
                  ? ` (${minutes(t.resolutionRemainingMinutes)} remaining)`
                  : ''}
              </span>
            </Link>
          ))}
          {!d.items.length && (
            <p className="text-sm text-muted-foreground">No active SLA obligations.</p>
          )}
        </div>
      </div>
    </Card>
  );
}
export function SlaPolicies() {
  const q = useApi<SlaPolicy[]>('/sla/policies'),
    m = useApiMutation(),
    [editing, setEditing] = useState<SlaPolicy | null>(null),
    [error, setError] = useState('');
  return (
    <Card
      title="SLA policies"
      subtitle="Changes apply to new cycles. Existing deadlines retain their policy snapshot."
    >
      <div className="space-y-3 px-6 pb-6">
        <QueryState query={q} />
        {q.data?.map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
          >
            <div>
              <p className="text-sm font-medium">
                {p.name} {p.active ? '' : '(disabled)'}
              </p>
              <p className="text-xs text-muted-foreground">
                Response {p.responseMinutes}m · Resolution {p.resolutionMinutes}m · Warning{' '}
                {p.warningPercent}%
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                m.reset();
                setError('');
                setEditing(p);
              }}
            >
              Edit {p.priority} policy
            </Button>
          </div>
        ))}
      </div>
      <Dialog
        open={!!editing}
        onOpenChange={(v) => {
          if (!v && !m.isPending) setEditing(null);
        }}
        title="Edit SLA policy"
        description="Business time uses Asia/Manila. Holidays are excluded only when explicitly listed."
        className="max-h-[85dvh] overflow-y-auto"
      >
        {editing && (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setError('');
              try {
                await m.mutateAsync({
                  path: `/sla/policies/${editing.id}`,
                  method: 'PATCH',
                  body: {
                    name: f.get('name'),
                    responseMinutes: Number(f.get('responseMinutes')),
                    resolutionMinutes: Number(f.get('resolutionMinutes')),
                    warningPercent: Number(f.get('warningPercent')),
                    active: f.get('active') === 'on',
                    calendar: {
                      timezone: 'Asia/Manila',
                      startHour: Number(f.get('startHour')),
                      endHour: Number(f.get('endHour')),
                      weekdays: String(f.get('weekdays')).split(',').map(Number),
                      holidays: String(f.get('holidays'))
                        .split(/[\s,]+/)
                        .filter(Boolean),
                    },
                  },
                });
                setEditing(null);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <label className="label">
              Policy name
              <input
                className="input"
                name="name"
                defaultValue={editing.name}
                required
                maxLength={100}
              />
            </label>
            {(['responseMinutes', 'resolutionMinutes', 'warningPercent'] as const).map((key) => (
              <label className="label" key={key}>
                {key === 'responseMinutes'
                  ? 'Response target (business minutes)'
                  : key === 'resolutionMinutes'
                    ? 'Resolution target (business minutes)'
                    : 'Warning percent'}
                <input
                  className="input"
                  type="number"
                  name={key}
                  defaultValue={editing[key]}
                  min={1}
                  max={key === 'warningPercent' ? 99 : 525600}
                  required
                />
              </label>
            ))}
            <div className="grid grid-cols-2 gap-3">
              {(['startHour', 'endHour'] as const).map((key) => (
                <label className="label" key={key}>
                  {key === 'startHour' ? 'Opening hour' : 'Closing hour'}
                  <input
                    className="input"
                    type="number"
                    min={key === 'startHour' ? 0 : 1}
                    max={key === 'startHour' ? 23 : 24}
                    name={key}
                    defaultValue={editing.calendar[key]}
                    required
                  />
                </label>
              ))}
            </div>
            <label className="label">
              Weekdays (0 Sunday to 6 Saturday, comma-separated)
              <input
                className="input"
                name="weekdays"
                defaultValue={editing.calendar.weekdays.join(',')}
                required
              />
            </label>
            <label className="label">
              Holiday dates (YYYY-MM-DD, separated by spaces)
              <textarea
                className="input"
                name="holidays"
                defaultValue={editing.calendar.holidays.join(' ')}
              />
            </label>
            <label className="flex gap-2 text-sm">
              <input name="active" type="checkbox" defaultChecked={editing.active} />
              Enable for new SLA cycles
            </label>
            {error && <InlineMessage error>{error}</InlineMessage>}
            <Button disabled={m.isPending}>Save SLA policy</Button>
          </form>
        )}
      </Dialog>
    </Card>
  );
}
