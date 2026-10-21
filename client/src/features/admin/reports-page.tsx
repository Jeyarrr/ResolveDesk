import { useState } from 'react';
import { Ticket, CheckCheck, Clock3, ShieldCheck } from 'lucide-react';
import { useApi } from '../../hooks/use-api';
import { type Analytics, statusLabels, priorityLabels } from '../../services/contracts';
import { Card, PageHeader } from '../../components/shared/primitives';
import { QueryState } from '../../components/shared/query-state';
import { MetricCard } from '../../components/shared/metric-card';
import { DistributionChart, PerformanceChart, VolumeChart } from '../dashboard/charts';
export default function ReportsPage() {
  const [days, setDays] = useState(30);
  const q = useApi<Analytics>('/analytics/dashboard?period=true&days=' + days);
  if (!q.data) return <QueryState query={q} />;
  const d = q.data;
  return (
    <>
      <PageHeader
        eyebrow="A CLEARER VIEW OF YOUR SUPPORT"
        title="Reports & analytics"
        description="Database statistics for tickets created within the selected UTC period. Volume charts count received and resolved events within the period."
        actions={
          <select
            className="select"
            aria-label="Report date range"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[7, 30, 90].map((n) => (
              <option key={n} value={n}>
                Last {n} days
              </option>
            ))}
          </select>
        }
      />
      <QueryState query={q} />
      <div className="metrics-grid">
        <MetricCard
          label="Tickets received"
          value={d.total}
          note="Created within the period"
          icon={Ticket}
        />
        <MetricCard
          label="Resolved tickets"
          value={d.status
            .filter((s) => ['resolved', 'closed'].includes(s.name))
            .reduce((sum, s) => sum + s.value, 0)}
          note="Current status of the selected cohort"
          icon={CheckCheck}
        />
        <MetricCard
          label="Avg. resolution time"
          value={d.average === null ? '—' : d.average.toFixed(1) + 'h'}
          note="Completed tickets in this cohort"
          icon={Clock3}
        />
        <MetricCard label="SLA compliance" value="—" note="Not yet available" icon={ShieldCheck} />
      </div>
      <div className="dashboard-chart-grid">
        <Card title="Ticket volume">
          <VolumeChart series={d.series} days={days} />
        </Card>
        <Card title="Status distribution">
          <DistributionChart counts={d.status.map((v) => ({ ...v, name: statusLabels[v.name] }))} />
        </Card>
        <Card title="Agent workload" subtitle="Top 20 agents by assigned tickets in this cohort">
          <PerformanceChart series={d.performance} />
        </Card>
        <Card title="Priority distribution">
          <DistributionChart
            counts={d.priority.map((v) => ({ ...v, name: priorityLabels[v.name] }))}
          />
        </Card>
      </div>
    </>
  );
}
