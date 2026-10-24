import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../hooks/use-api';
import { queryString, downloadReport } from '../../services/api';
import type { ReportData } from '../../services/operations-contracts';
import type { ApiUser, Page, Reference } from '../../services/contracts';
import { Card, PageHeader, InlineMessage } from '../../components/shared/primitives';
import { QueryState } from '../../components/shared/query-state';
import { Button } from '../../components/ui/button';
import { DistributionChart } from '../dashboard/charts';
import { OperationsChart } from '../dashboard/operations-charts';
const date = (offset = 0) =>
  new Date(Date.now() + 8 * 3600000 - offset * 86400000).toISOString().slice(0, 10);
export default function ReportsPage() {
  const [filters, setFilters] = useState<Record<string, string>>({
      from: date(29),
      to: date(),
      interval: 'day',
    }),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const params = queryString(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)));
  const q = useApi<ReportData>('/analytics/overview?' + params),
    categories = useApi<Reference[]>('/ticket-categories'),
    departments = useApi<Reference[]>('/departments'),
    agents = useApi<Page<ApiUser>>('/users?role=agent&limit=100');
  const change = (key: string, value: string) => setFilters((f) => ({ ...f, [key]: value }));
  const number = (n: number | null) => (n === null ? 'No data' : n.toFixed(1));
  const d = q.data;
  return (
    <>
      <PageHeader
        eyebrow="SUPPORT OPERATIONS"
        title="Reports & analytics"
        description="Filtered ticket creation cohorts, Manila calendar dates. SLA durations use business minutes; reopen cycles remain separate."
      />
      <Card title="Report filters">
        <div className="grid gap-3 px-6 pb-6 sm:grid-cols-2 lg:grid-cols-4">
          <label className="label">
            Report date range
            <select
              className="select"
              defaultValue="30"
              onChange={(e) =>
                setFilters((f) => ({ ...f, from: date(Number(e.target.value) - 1), to: date() }))
              }
            >
              {[7, 30, 90, 365].map((n) => (
                <option key={n} value={n}>
                  Last {n} days
                </option>
              ))}
            </select>
          </label>
          {(['from', 'to'] as const).map((key) => (
            <label className="label" key={key}>
              {key === 'from' ? 'Start date' : 'End date'}
              <input
                type="date"
                className="input"
                value={filters[key]}
                onChange={(e) => change(key, e.target.value)}
              />
            </label>
          ))}
          <label className="label">
            Trend interval
            <select
              className="select"
              value={filters.interval}
              onChange={(e) => change('interval', e.target.value)}
            >
              {['day', 'week', 'month'].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {[
            {
              key: 'status',
              label: 'Ticket status',
              options: ['open', 'in_progress', 'pending', 'resolved', 'closed'].map((v) => ({
                id: v,
                name: v.replaceAll('_', ' '),
              })),
            },
            {
              key: 'priority',
              label: 'Priority',
              options: ['low', 'medium', 'high', 'critical'].map((v) => ({ id: v, name: v })),
            },
            { key: 'category', label: 'Category', options: categories.data ?? [] },
            { key: 'department', label: 'Requester department', options: departments.data ?? [] },
            { key: 'agent', label: 'Support agent', options: agents.data?.items ?? [] },
          ].map((f) => (
            <label key={f.key} htmlFor={'report-' + f.key} className="label">
              {f.label}
              <select
                id={'report-' + f.key}
                className="select"
                value={filters[f.key] ?? ''}
                onChange={(e) => change(f.key, e.target.value)}
              >
                <option value="">All</option>
                {f.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 px-6 pb-6">
          {['summary', 'performance', 'agents', 'sla'].map((format) => (
            <Button
              key={format}
              size="sm"
              variant="outline"
              disabled={busy || !d || q.isFetching}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await downloadReport(
                    params + '&format=' + format,
                    'resolvedesk-' + format + '-' + filters.from + '.csv',
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Export {format} CSV
            </Button>
          ))}
        </div>
      </Card>
      <QueryState query={q} />
      {error && <InlineMessage error>{error}</InlineMessage>}
      {d && (
        <div className="mt-5 space-y-5">
          {d.metrics.total === 0 && (
            <InlineMessage>
              No tickets match these filters. Choose a different date range or clear a filter.
            </InlineMessage>
          )}
          <Card title="Selected cohort">
            <dl className="grid grid-cols-2 gap-4 px-6 pb-6 lg:grid-cols-4">
              {Object.entries({
                'Total tickets': d.metrics.total,
                ...Object.fromEntries(d.status.map((s) => [s.name.replaceAll('_', ' '), s.value])),
                'Reopened tickets': d.metrics.reopenedTickets,
                'Reopen events': d.metrics.reopenEvents,
                'Reopen frequency %': number(d.metrics.reopenFrequency),
                'Mean first response (business min)': number(d.metrics.averageResponseMinutes),
                'Mean resolution (business min)': number(d.metrics.averageResolutionMinutes),
                'Median resolution (business min)': number(d.metrics.medianResolutionMinutes),
                'Completed SLA cycles': d.metrics.completed,
                'Active SLA cycles': d.metrics.active,
                'Both-target compliance %': number(d.metrics.compliance),
                'Response compliance %': number(d.metrics.responseCompliance),
                'Resolution compliance %': number(d.metrics.resolutionCompliance),
                'Completed without public response': d.metrics.missingResponse,
                'Approaching deadline': d.metrics.approaching,
                'Response breaches': d.metrics.responseBreached,
                'Resolution breaches': d.metrics.resolutionBreached,
              }).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs capitalize text-muted-foreground">{label}</dt>
                  <dd className="mt-1 text-lg font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <div className="dashboard-chart-grid">
            <Card title="Ticket volume trend">
              <OperationsChart
                title="Ticket volume"
                data={d.series}
                labelKey="label"
                line
                series={[
                  { key: 'received', label: 'Created' },
                  { key: 'resolved', label: 'Resolved cycles' },
                ]}
              />
            </Card>
            <Card title="Status distribution">
              <DistributionChart counts={d.status} />
            </Card>
            <Card title="Priority breakdown">
              <OperationsChart
                title="Priority breakdown"
                data={d.priority}
                series={[{ key: 'value', label: 'Tickets' }]}
              />
            </Card>
            <Card title="Completed SLA outcomes">
              <OperationsChart
                title="SLA outcomes"
                data={[
                  { name: 'Both targets met', value: d.metrics.compliant },
                  {
                    name: 'Other completed cycles',
                    value: d.metrics.completed - d.metrics.compliant,
                  },
                ]}
                series={[{ key: 'value', label: 'Completed cycles' }]}
              />
            </Card>
            <Card title="Agent workload" subtitle="Top 20 current assignees in this cohort">
              <OperationsChart
                title="Agent workload"
                horizontal
                data={d.agents.slice(0, 20)}
                series={[
                  { key: 'open', label: 'Active' },
                  { key: 'resolved', label: 'Resolved / closed' },
                ]}
              />
            </Card>
            <Card title="Resolution performance">
              <OperationsChart
                title="Resolution performance"
                data={d.series}
                labelKey="label"
                line
                series={[{ key: 'averageResolutionMinutes', label: 'Mean business minutes' }]}
              />
            </Card>
            <Card title="SLA breaches over time">
              <OperationsChart
                title="Breaches over time"
                data={d.series}
                labelKey="label"
                line
                series={[{ key: 'breaches', label: 'Breached obligations' }]}
              />
            </Card>
            <Card title="Breaches by priority">
              <OperationsChart
                title="Breaches by priority"
                data={d.breachPriority}
                series={[{ key: 'value', label: 'Breached cycles' }]}
              />
            </Card>
            <Card title="Request categories">
              <OperationsChart
                title="Categories"
                data={d.categories}
                series={[{ key: 'value', label: 'Tickets' }]}
              />
            </Card>
            <Card title="Requester departments">
              <OperationsChart
                title="Departments"
                data={d.departments}
                series={[{ key: 'value', label: 'Tickets' }]}
              />
            </Card>
          </div>
          <Card
            title="Agent measurements"
            subtitle="Current assignment attribution. Ticket counts alone do not measure individual performance."
          >
            <div
              className="table-scroll"
              role="region"
              aria-label="Agent measurements"
              tabIndex={0}
            >
              <table className="data-table">
                <caption className="sr-only">Agent workload, timing and SLA performance</caption>
                <thead>
                  <tr>
                    {[
                      'Agent',
                      'Assigned',
                      'Active',
                      'Resolved',
                      'Response min',
                      'Resolution min',
                      'Compliance %',
                      'Breached tickets',
                    ].map((h) => (
                      <th key={h} scope="col">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.agents.map((a) => (
                    <tr key={a.id}>
                      <td>{a.name}</td>
                      <td>{a.assigned}</td>
                      <td>{a.open}</td>
                      <td>{a.resolved}</td>
                      <td>{number(a.averageResponseMinutes)}</td>
                      <td>{number(a.averageResolutionMinutes)}</td>
                      <td>{number(a.compliance)}</td>
                      <td>{a.breaches}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!d.agents.length && (
                <p className="p-6 text-sm text-muted-foreground">No assigned tickets match.</p>
              )}
            </div>
          </Card>
          <Card title="Approaching SLA deadlines">
            <div className="space-y-2 px-6 pb-6">
              {d.approaching.map((t) => (
                <Link
                  className="block text-sm text-primary underline"
                  key={t.ticketId}
                  to={'/tickets/' + t.ticketId}
                >
                  View ticket targets ·{' '}
                  {new Date(t.resolutionDueAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}{' '}
                  Manila
                </Link>
              ))}
              {!d.approaching.length && (
                <p className="text-sm text-muted-foreground">
                  No approaching deadlines in this cohort.
                </p>
              )}
            </div>
          </Card>
          <p className="text-xs text-muted-foreground">
            Compliance uses completed SLA cycles; response compliance excludes unanswered cycles,
            which are listed separately. Agent metrics use current assignment and latest cycles.
            Exports are capped at 10,000 tickets / 20,000 cycles. Narrow filters if the report
            exceeds these limits.
          </p>
        </div>
      )}
    </>
  );
}
