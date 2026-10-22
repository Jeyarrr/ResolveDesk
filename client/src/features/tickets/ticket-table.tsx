import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { TicketRow, Person } from '../../services/contracts';
import { Avatar, Badge, EmptyState } from '../../components/shared/primitives';
import { formatDate } from '../../lib/utils';
export function TicketTable({
  tickets,
  users,
  compact = false,
}: {
  tickets: TicketRow[];
  users: Person[];
  compact?: boolean;
}) {
  if (!tickets.length)
    return (
      <EmptyState
        title="No tickets found"
        description="Try adjusting your filters, or create a new support request."
      />
    );
  return (
    <div className="table-scroll">
      <table className={`data-table ${compact ? 'table-compact' : ''}`}>
        <caption className="sr-only">Support tickets. Open a subject to view its details.</caption>
        <thead>
          <tr>
            <th scope="col">Ticket / Subject</th>
            {!compact && <th scope="col">Category</th>}
            <th scope="col">Status</th>
            <th scope="col">Priority</th>
            <th scope="col">Assigned to</th>
            {!compact && <th scope="col">Created</th>}
            <th scope="col">Updated</th>
            <th scope="col">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => {
            const agent = users.find((user) => user.id === ticket.assigneeId);
            return (
              <tr key={'ticketNumber' in ticket ? `RD-${ticket.ticketNumber}` : ticket.id}>
                <td>
                  <Link className="ticket-subject" to={`/tickets/${ticket.id}`}>
                    <span className="ticket-id">
                      {'ticketNumber' in ticket ? `RD-${ticket.ticketNumber}` : ticket.id}
                    </span>
                    <strong>{ticket.subject}</strong>
                    {!!ticket.unreadCount && (
                      <span className="text-xs text-primary">
                        {ticket.unreadCount} unread replies
                      </span>
                    )}
                  </Link>
                </td>
                {!compact && <td>{ticket.category}</td>}
                <td>
                  <Badge value={ticket.status} />
                </td>
                <td>
                  <Badge value={ticket.priority} subtle />
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <Avatar user={agent} />
                    <span className="whitespace-nowrap">{agent?.name ?? 'Unassigned'}</span>
                  </div>
                </td>
                {!compact && <td className="whitespace-nowrap">{formatDate(ticket.createdAt)}</td>}
                <td className="whitespace-nowrap">{formatDate(ticket.updatedAt)}</td>
                <td>
                  <Link
                    className="table-open"
                    to={`/tickets/${ticket.id}`}
                    aria-label={`Open ${'ticketNumber' in ticket ? `RD-${ticket.ticketNumber}` : ticket.id}`}
                  >
                    <ChevronRight size={16} />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
