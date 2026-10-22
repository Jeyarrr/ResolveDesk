import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { useApp } from '../../app/context';
import { useApi } from '../../hooks/use-api';
import { queryString } from '../../services/api';
import {
  displayTicket,
  ticketPeople,
  statusValue,
  priorityValue,
  type ApiTicket,
  type Page,
  type Reference,
} from '../../services/contracts';
import { QueryState } from '../../components/shared/query-state';
import { type TicketFilters } from '../../services/demo-store';
import { priorities, statuses } from '../../types/domain';
import { Button } from '../../components/ui/button';
import { PageHeader } from '../../components/shared/primitives';
import { TicketTable } from './ticket-table';

export default function TicketListPage({ mine = false }: { mine?: boolean }) {
  const { user } = useApp();
  const [filters, setFilters] = useState<TicketFilters>({});
  const [page, setPage] = useState(1);
  const [unassigned, setUnassigned] = useState(false);
  const references = useApi<Reference[]>('/ticket-categories');
  const query = useApi<Page<ApiTicket>>(
    '/tickets?' +
      queryString({
        ...filters,
        status: filters.status ? statusValue(filters.status) : '',
        priority: filters.priority ? priorityValue(filters.priority) : '',
        page,
        limit: 8,
        mine: String(mine),
        unassigned: String(unassigned),
      }),
    true,
    true,
  );
  if (!user) return null;
  if (!query.data) return <QueryState query={query} />;
  const filtered = query.data.items.map(displayTicket);
  const users = ticketPeople(query.data.items);
  const total = query.data.total;
  const pages = Math.max(1, Math.ceil(total / 8));
  const currentPage = page;
  const update = (key: keyof TicketFilters, value: string) => {
    setFilters((previous) => ({ ...previous, [key]: value }));
    setPage(1);
  };
  const activeCount = [filters.status, filters.priority, filters.category, unassigned].filter(
    Boolean,
  ).length;
  return (
    <>
      <PageHeader
        eyebrow="TICKET WORKSPACE"
        title={user.role === 'agent' ? 'Assigned tickets' : mine ? 'My tickets' : 'All tickets'}
        description={
          mine
            ? user.role === 'agent'
              ? 'Your assigned requests, organized and ready for the next step.'
              : 'Every request you have submitted, all in one place.'
            : 'A shared view of support requests across the organization.'
        }
        actions={
          user.role !== 'agent' && (
            <Button asChild>
              <Link to="/tickets/new">
                <Plus />
                Create ticket
              </Link>
            </Button>
          )
        }
      />
      <div className="ticket-tabs" aria-label="Ticket status shortcuts">
        <button className={!filters.status ? 'selected' : ''} onClick={() => update('status', '')}>
          All tickets
        </button>
        {['Open', 'In progress', 'Resolved'].map((status) => (
          <button
            key={status}
            className={filters.status === status ? 'selected' : ''}
            onClick={() => update('status', status)}
          >
            {status}
          </button>
        ))}
        {user.role === 'admin' && (
          <button
            className={unassigned ? 'selected' : ''}
            aria-pressed={unassigned}
            onClick={() => {
              setUnassigned(!unassigned);
              setPage(1);
            }}
          >
            Unassigned {unassigned ? '✓' : ''}
          </button>
        )}
      </div>
      <QueryState query={query} />
      <section className="card overflow-hidden" aria-label="Ticket list">
        <div className="filter-toolbar">
          <div className="search-input">
            <Search size={16} />
            <input
              aria-label="Search tickets"
              placeholder="Search by subject or ticket ID…"
              value={filters.search ?? ''}
              onChange={(e) => update('search', e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SlidersHorizontal size={15} className="text-muted-foreground" />
            <select
              aria-label="Filter status"
              className="select"
              value={filters.status ?? ''}
              onChange={(e) => update('status', e.target.value)}
            >
              <option value="">All statuses</option>
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select
              aria-label="Filter priority"
              className="select"
              value={filters.priority ?? ''}
              onChange={(e) => update('priority', e.target.value)}
            >
              <option value="">All priorities</option>
              {priorities.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select
              aria-label="Filter category"
              className="select"
              value={filters.category ?? ''}
              onChange={(e) => update('category', e.target.value)}
            >
              <option value="">All categories</option>
              {references.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Sort tickets"
              className="select"
              value={filters.sort ?? ''}
              onChange={(e) => update('sort', e.target.value)}
            >
              <option value="">Recently updated</option>
              <option value="oldest">Oldest first</option>
              <option value="priority">Highest priority</option>
              <option value="subject">Subject A–Z</option>
            </select>
          </div>
        </div>
        {(activeCount > 0 || filters.search) && (
          <div className="flex items-center gap-3 border-b border-border px-5 pb-3 text-xs text-muted-foreground">
            <span>{total} matching tickets</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setFilters({});
                setUnassigned(false);
                setPage(1);
              }}
            >
              <X />
              Clear filters
            </Button>
          </div>
        )}
        <TicketTable tickets={filtered} users={users} />
        <div className="pagination">
          <span>
            Showing {total ? (currentPage - 1) * 8 + 1 : 0}–{Math.min(currentPage * 8, total)} of{' '}
            {total} tickets
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous page"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft />
            </Button>
            <span>
              Page {currentPage} of {pages}
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next page"
              disabled={currentPage >= pages || query.isPlaceholderData}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
