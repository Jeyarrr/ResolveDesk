import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../hooks/use-api';
import { priorityLabels, statusLabels, type Escalation, type Page } from '../../services/contracts';
import { Badge, Card, InlineMessage, PageHeader } from '../../components/shared/primitives';
import { QueryState } from '../../components/shared/query-state';
import { Button } from '../../components/ui/button';
import { EscalationActions, EscalationHistory } from '../tickets/ticket-escalations';
import { AgentWorkloads } from './agent-workloads';

export default function EscalationsPage() {
  const [state, setState] = useState('active');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState('');
  const query = useApi<Page<Escalation>>(
    `/escalations?state=${state}&page=${page}&limit=10&search=${encodeURIComponent(search)}`,
  );
  return (
    <>
      <PageHeader
        eyebrow="SUPPORT OPERATIONS"
        title="Escalations & workload"
        description="Review requests for administrator attention and plan agent assignments."
      />
      <div className="mb-6">
        <AgentWorkloads />
      </div>
      <Card title="Escalated tickets">
        <div className="space-y-5 px-6 pb-6">
          <div className="flex flex-wrap gap-3">
            <input
              className="input flex-1"
              aria-label="Search escalated tickets"
              placeholder="Search ticket number or subject"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            <select
              className="select"
              aria-label="Escalation state"
              value={state}
              onChange={(e) => {
                setState(e.target.value);
                setPage(1);
              }}
            >
              <option value="active">Active escalations</option>
              <option value="resolved">Resolved escalations</option>
              <option value="all">All escalations</option>
            </select>
          </div>
          <QueryState query={query} />
          {message && <InlineMessage>{message}</InlineMessage>}
          {query.data?.total === 0 && (
            <p className="text-sm text-muted-foreground">No escalations match this view.</p>
          )}
          {query.data?.items.map((e) => (
            <article key={e.id} className="space-y-4 rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  className="font-medium text-primary hover:underline"
                  to={`/tickets/${e.ticketId}`}
                >
                  RD-{e.ticketNumber} · {e.subject}
                </Link>
                <Badge value={priorityLabels[e.priority]} />
                <Badge value={statusLabels[e.ticketStatus]} />
              </div>
              <p className="text-xs text-muted-foreground">
                Assigned agent: {e.assigneeName ?? 'Unassigned'}
              </p>
              <EscalationHistory escalation={e} />
              <EscalationActions
                escalation={e}
                onSuccess={() => setMessage('Escalation updated.')}
              />
              <Button asChild variant="outline" size="sm">
                <Link to={`/tickets/${e.ticketId}`}>View ticket / reassign</Link>
              </Button>
            </article>
          ))}
          {query.data && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {query.data.total} escalations · Page {page}
              </span>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <Button
                  variant="outline"
                  disabled={page * 10 >= query.data.total}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </>
  );
}
