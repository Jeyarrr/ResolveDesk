import { useState } from 'react';
import { useApi } from '../../hooks/use-api';
import type { AgentWorkload, Page } from '../../services/contracts';
import { Card } from '../../components/shared/primitives';
import { QueryState } from '../../components/shared/query-state';
import { Button } from '../../components/ui/button';

export function AgentWorkloads() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const query = useApi<Page<AgentWorkload>>(
    `/users/workloads?limit=10&page=${page}&search=${encodeURIComponent(search)}`,
  );
  return (
    <Card title="Agent workload">
      <div className="space-y-4 px-6 pb-6">
        <p className="text-xs text-muted-foreground">
          Active support agents only. Total includes all five statuses; resolved and closed are
          counted separately. Active work is open + in progress + pending.
        </p>
        <input
          className="input"
          aria-label="Search agent workloads"
          placeholder="Search agent name"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <QueryState query={query} />
        {query.data?.total === 0 && (
          <p className="text-sm text-muted-foreground">No eligible agents match this search.</p>
        )}
        {query.data && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Current assigned tickets by active agent and status
              </caption>
              <thead>
                <tr>
                  {[
                    'Agent',
                    'Department',
                    'Total',
                    'Open',
                    'In progress',
                    'Pending',
                    'Resolved',
                    'Closed',
                  ].map((h) => (
                    <th
                      scope="col"
                      key={h}
                      className="whitespace-nowrap border-b border-border p-3 font-medium text-muted-foreground"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((a) => (
                  <tr key={a.id}>
                    <th
                      scope="row"
                      className="whitespace-nowrap border-b border-border p-3 font-medium"
                    >
                      {a.name}
                    </th>
                    <td className="border-b border-border p-3">{a.department ?? 'Unassigned'}</td>
                    {[a.total, a.open, a.inProgress, a.pending, a.resolved, a.closed].map(
                      (n, i) => (
                        <td key={i} className="border-b border-border p-3 tabular-nums">
                          {n}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {query.data && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {query.data.total} agents · Page {page}
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous agents
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page * 10 >= query.data.total}
                onClick={() => setPage(page + 1)}
              >
                Next agents
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
