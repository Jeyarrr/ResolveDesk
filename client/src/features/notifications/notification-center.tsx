import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, MessageSquare, AlertTriangle, UserCheck } from 'lucide-react';
import { useApi, useApiMutation } from '../../hooks/use-api';
import type { Page } from '../../services/contracts';
import type { Notification, Preferences } from '../../services/operations-contracts';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Card, InlineMessage } from '../../components/shared/primitives';
import { QueryState } from '../../components/shared/query-state';
function relative(value: string) {
  const m = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000));
  return m < 1
    ? 'Just now'
    : m < 60
      ? `${m}m ago`
      : m < 1440
        ? `${Math.floor(m / 60)}h ago`
        : `${Math.floor(m / 1440)}d ago`;
}
export function NotificationList({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const [state, setState] = useState('all'),
    [page, setPage] = useState(1),
    mutation = useApiMutation();
  const query = useApi<Page<Notification>>(
    `/notifications?page=${page}&limit=${compact ? 5 : 20}&state=${state}`,
  );
  const read = (id: string) =>
    void mutation
      .mutateAsync({
        path: id === 'all' ? '/notifications/read-all' : `/notifications/${id}/read`,
        method: 'PATCH',
        body: {},
      })
      .catch(() => {});
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {!compact && (
          <label className="label">
            Show notifications
            <select
              className="select"
              value={state}
              onChange={(e) => {
                setState(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All</option>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
            </select>
          </label>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => read('all')}
        >
          Mark all as read
        </Button>
      </div>
      <QueryState query={query} />
      {mutation.error && <InlineMessage error>{mutation.error.message}</InlineMessage>}
      {query.data?.total === 0 && (
        <p className="text-sm text-muted-foreground">No notifications in this view.</p>
      )}
      {query.data?.items.map((n) => {
        const Icon = n.type.startsWith('sla')
          ? AlertTriangle
          : n.type.includes('reply')
            ? MessageSquare
            : n.type.includes('assigned')
              ? UserCheck
              : Bell;
        return (
          <article
            key={n.id}
            className={`flex gap-3 rounded-xl border p-3 ${n.readAt ? 'border-border' : 'border-primary/40 bg-primary/5'}`}
          >
            <Icon size={18} className="mt-1 shrink-0 text-primary" />
            <div className="min-w-0 flex-1 space-y-2">
              <Link
                className="block break-words text-sm font-medium hover:underline"
                to={`/tickets/${n.ticketId}`}
                onClick={() => {
                  read(n.id);
                  onNavigate?.();
                }}
              >
                {n.title} · RD-{n.ticketNumber}
              </Link>
              <p className="text-xs text-muted-foreground">
                <time dateTime={n.createdAt} title={new Date(n.createdAt).toLocaleString()}>
                  {relative(n.createdAt)}
                </time>{' '}
                · {n.readAt ? 'Read' : 'Unread'}
              </p>
              {!n.readAt && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={mutation.isPending}
                  onClick={() => read(n.id)}
                >
                  Mark as read
                </Button>
              )}
            </div>
          </article>
        );
      })}
      {compact ? (
        <Link className="text-sm text-primary underline" to="/notifications" onClick={onNavigate}>
          View all notifications
        </Link>
      ) : (
        query.data &&
        query.data.total > 20 && (
          <div className="flex gap-3">
            <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <Button disabled={page * 20 >= query.data.total} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        )
      )}
    </div>
  );
}
export function NotificationCenter() {
  const [open, setOpen] = useState(false),
    query = useApi<{ count: number }>('/notifications/unread-count');
  const count = query.data?.count ?? 0;
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        aria-label={`Notifications, ${count} unread`}
        onClick={() => setOpen(true)}
      >
        <Bell />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Notification center"
        description="Updates for tickets you can access."
        className="max-h-[85dvh] overflow-y-auto"
      >
        {open && <NotificationList compact onNavigate={() => setOpen(false)} />}
      </Dialog>
    </>
  );
}
export function NotificationPreferences() {
  const q = useApi<Preferences>('/notifications/preferences'),
    m = useApiMutation();
  return (
    <Card title="In-app notification preferences">
      <div className="space-y-3 px-6 pb-6">
        <QueryState query={q} />
        {q.data &&
          Object.entries(q.data).map(([key, value]) => (
            <label key={key} className="flex items-center gap-3 text-sm capitalize">
              <input
                type="checkbox"
                checked={value}
                disabled={m.isPending}
                onChange={(e) =>
                  m.mutate({
                    path: '/notifications/preferences',
                    method: 'PATCH',
                    body: { ...q.data, [key]: e.target.checked },
                  })
                }
              />
              {key}
            </label>
          ))}
        {m.error && <InlineMessage error>{m.error.message}</InlineMessage>}
        <p className="text-xs text-muted-foreground">
          Preferences control future in-app alerts. Email, SMS and push delivery are not configured.
        </p>
      </div>
    </Card>
  );
}
