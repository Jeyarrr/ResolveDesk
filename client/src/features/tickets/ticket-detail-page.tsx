import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Send } from 'lucide-react';
import { useApp } from '../../app/context';
import { useApi, useApiMutation } from '../../hooks/use-api';
import {
  statusLabels,
  priorityLabels,
  displayPerson,
  type ApiTicket,
  type Comment,
  type Activity,
  type Reference,
} from '../../services/contracts';
import { formatDate } from '../../lib/utils';
import { Avatar, Badge, Card, InlineMessage } from '../../components/shared/primitives';
import { QueryState } from '../../components/shared/query-state';
import { Button } from '../../components/ui/button';
import { TicketLifecycle } from './ticket-lifecycle';
import { TicketAssignment } from './ticket-assignment';
import { TicketEscalations } from './ticket-escalations';
export default function TicketDetailPage() {
  const { id } = useParams();
  const { user } = useApp();
  const ticket = useApi<ApiTicket>('/tickets/' + id);
  const comments = useApi<Comment[]>('/tickets/' + id + '/comments');
  const activity = useApi<Activity[]>('/tickets/' + id + '/activity');
  const categories = useApi<Reference[]>('/ticket-categories', user?.role === 'admin');
  const mutation = useApiMutation();
  const [reply, setReply] = useState('');
  const [internal, setInternal] = useState(false);
  const [message, setMessage] = useState('');
  if (!ticket.data) return <QueryState query={ticket} />;
  const t = ticket.data;
  const manageable = user?.role !== 'employee';
  async function update(path: string, body: unknown, method = 'PATCH') {
    setMessage('');
    try {
      await mutation.mutateAsync({ path: '/tickets/' + id + path, body, method });
      setMessage('Changes saved.');
      return true;
    } catch {
      return false;
    }
  }
  return (
    <>
      <Link className="back-link" to="/tickets/mine">
        <ArrowLeft size={14} />
        Back to tickets
      </Link>
      <div className="ticket-detail-heading">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="font-mono text-sm text-muted-foreground">RD-{t.ticketNumber}</span>
          <Badge value={statusLabels[t.status]} />
          <Badge value={priorityLabels[t.priority]} />
        </div>
        <h1>{t.subject}</h1>
        <p className="mt-3 text-xs text-muted-foreground">
          Created {formatDate(t.createdAt, true)} · Updated {formatDate(t.updatedAt, true)}
        </p>
      </div>
      {message && <InlineMessage>{message}</InlineMessage>}
      {mutation.error && <InlineMessage error>{mutation.error.message}</InlineMessage>}
      <div className="form-layout mt-6">
        <div className="space-y-5">
          <TicketLifecycle
            ticket={t}
            busy={mutation.isPending}
            error={mutation.error?.message}
            update={update}
          />
          <Card title="Description">
            <p className="whitespace-pre-wrap break-words px-6 pb-6 text-sm leading-7 text-muted-foreground">
              {t.description}
            </p>
            <div className="border-t border-border px-6 py-5 text-xs text-muted-foreground">
              Attachments are not available until secure file storage is configured.
            </div>
          </Card>
          {manageable && <TicketEscalations key={t.id} ticket={t} />}
          {user?.role === 'admin' && (
            <Card title="Edit ticket details">
              <form
                className="p-6 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  void update('', {
                    subject: data.get('subject'),
                    description: data.get('description'),
                    categoryId: data.get('categoryId'),
                  });
                }}
                key={t.updatedAt}
              >
                <label className="label">
                  Subject
                  <input
                    name="subject"
                    className="input"
                    defaultValue={t.subject}
                    minLength={5}
                    maxLength={120}
                    required
                  />
                </label>
                <label className="label">
                  Description
                  <textarea
                    name="description"
                    className="input"
                    defaultValue={t.description}
                    minLength={20}
                    maxLength={5000}
                    required
                  />
                </label>
                <label className="label">
                  Category
                  <select name="categoryId" className="select w-full" defaultValue={t.categoryId}>
                    <option value={t.categoryId}>{t.category}</option>
                    {categories.data
                      ?.filter((c) => c.active && c.id !== t.categoryId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
                <Button disabled={mutation.isPending}>Save details</Button>
              </form>
            </Card>
          )}
          <Card
            title="Conversation"
            subtitle="Replies are saved to this ticket. Internal notes are visible only to authorized support staff."
          >
            <div className="px-6 pb-6 space-y-5">
              <QueryState query={comments} />
              {comments.data?.map((c) => (
                <article key={c.id} className="comment">
                  <Avatar user={displayPerson(c.author)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-medium">{c.author.name}</h3>
                      {c.isInternal && <Badge value="Internal note" />}
                      <time className="text-[11px] text-muted-foreground">
                        {formatDate(c.createdAt, true)}
                      </time>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                      {c.message}
                    </p>
                  </div>
                </article>
              ))}
              {comments.data?.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No replies yet. Start the conversation below.
                </p>
              )}
              <form
                className="border-t border-border pt-5"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await update('/comments', { message: reply, isInternal: internal }, 'POST'))
                    setReply('');
                }}
              >
                <label htmlFor="reply" className="label">
                  Add a reply
                </label>
                <textarea
                  id="reply"
                  className="input"
                  rows={4}
                  maxLength={5000}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  required
                />
                {manageable && (
                  <label className="my-3 flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={internal}
                      onChange={(e) => setInternal(e.target.checked)}
                    />
                    Internal note (support staff only)
                  </label>
                )}
                <div className="mt-3 flex justify-end">
                  <Button disabled={mutation.isPending}>
                    <Send />
                    {internal ? 'Post internal note' : 'Post reply'}
                  </Button>
                </div>
              </form>
            </div>
          </Card>
          <Card title="Activity & status history">
            <QueryState query={activity} />
            <ol className="timeline">
              {activity.data
                ?.slice()
                .reverse()
                .map((a) => (
                  <li key={a.id}>
                    <span className="timeline-dot" />
                    <div>
                      <strong>{a.action}</strong>
                      {a.explanation && (
                        <p className="whitespace-pre-wrap break-words">{a.explanation}</p>
                      )}
                      {['Ticket assigned', 'Ticket reassigned'].includes(a.action) ? (
                        <p className="text-xs text-muted-foreground">
                          {a.previousAgentName ?? 'Unassigned'} → {a.nextAgentName ?? 'Unassigned'}
                        </p>
                      ) : (
                        a.newValue && (
                          <p className="break-all">
                            {a.oldValue ? a.oldValue + ' → ' : ''}
                            {a.newValue}
                          </p>
                        )
                      )}
                      <p>
                        {a.actor.name} · {formatDate(a.createdAt, true)}
                      </p>
                    </div>
                  </li>
                ))}
            </ol>
          </Card>
        </div>
        <aside className="space-y-5">
          <Card title="Ticket details">
            <dl className="ticket-properties">
              <div>
                <dt>Requester</dt>
                <dd className="flex items-center gap-2">
                  <Avatar user={displayPerson(t.requester)} />
                  {t.requester.name}
                </dd>
              </div>
              <div>
                <dt>Assigned agent</dt>
                <dd>
                  {user?.role === 'admin' ? (
                    <TicketAssignment ticket={t} />
                  ) : (
                    (t.assignee?.name ?? 'Unassigned')
                  )}
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  {(t.lifecycleActions?.statusTransitions.length ?? 0) > 0 ? (
                    <select
                      aria-label="Ticket status"
                      className="select w-full"
                      value={t.status}
                      disabled={mutation.isPending}
                      onChange={(e) =>
                        void update('/status', {
                          status: e.target.value,
                          expectedVersion: t.lifecycleVersion,
                        })
                      }
                    >
                      {[t.status, ...(t.lifecycleActions?.statusTransitions ?? [])].map((s) => (
                        <option key={s} value={s}>
                          {statusLabels[s]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Badge value={statusLabels[t.status]} />
                  )}
                </dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd>
                  {user?.role === 'admin' ? (
                    <select
                      aria-label="Ticket priority"
                      className="select w-full"
                      value={t.priority}
                      disabled={mutation.isPending}
                      onChange={(e) => void update('', { priority: e.target.value })}
                    >
                      {Object.entries(priorityLabels).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Badge value={priorityLabels[t.priority]} />
                  )}
                </dd>
              </div>
              <div>
                <dt>Category</dt>
                <dd>{t.category}</dd>
              </div>
              <div>
                <dt>SLA monitoring</dt>
                <dd>Not yet available</dd>
              </div>
            </dl>
          </Card>
          <div className="help-card">
            <h2>Every update tells a story</h2>
            <p>
              Status changes and replies are recorded in the ticket history. Access is controlled by
              your organization role.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
