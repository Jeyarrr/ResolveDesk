import { useId, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Ticket, User } from '../../types/domain';
import { distribution, performance, volumeSeries } from './selectors';
import { EmptyState } from '../../components/shared/primitives';
import { chartColor } from './chart-colors';
const tooltipStyle = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  color: 'var(--foreground)',
  fontSize: 12,
};
const axis = { fontSize: 11, fill: 'var(--muted-foreground)' };
export function VolumeChart({
  tickets = [],
  days = 14,
  series,
}: {
  tickets?: Ticket[];
  days?: number;
  series?: { label: string; received: number; resolved: number }[];
}) {
  const gradientId = useId();
  const data = series ?? volumeSeries(tickets, days);
  return (
    <div
      className="chart-area"
      role="img"
      aria-label={`Ticket volume: ${data.reduce((s, d) => s + d.received, 0)} received and ${data.reduce((s, d) => s + d.resolved, 0)} resolved over ${days} days.`}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart data={data} margin={{ top: 10, right: 12, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-violet)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--chart-violet)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 5" />
          <XAxis
            dataKey="label"
            tick={axis}
            tickLine={false}
            axisLine={false}
            minTickGap={35}
            dy={8}
          />
          <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Area
            type="monotone"
            name="Received"
            dataKey="received"
            stroke="var(--chart-violet)"
            fill={`url(#${gradientId})`}
            strokeWidth={2.5}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            name="Resolved"
            dataKey="resolved"
            stroke="var(--chart-green)"
            fill="transparent"
            strokeWidth={2}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function DistributionChart({
  tickets = [],
  kind = 'status',
  counts,
}: {
  tickets?: Ticket[];
  kind?: 'status' | 'priority';
  counts?: { name: string; value: number }[];
}) {
  const [highlight, setHighlight] = useState<string | null>(null);
  const data = (counts ?? distribution(tickets, kind)).map((item) => ({
    ...item,
    name: item.name.replaceAll('_', ' '),
  }));
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <EmptyState description="Create a ticket to see a distribution." />;
  return (
    <div className="distribution">
      <div
        className="donut-wrap"
        role="img"
        aria-label={data.map((d) => `${d.name}: ${d.value}`).join(', ')}
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="72%"
              outerRadius="95%"
              paddingAngle={3}
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((d, i) => (
                <Cell
                  key={d.name}
                  fill={chartColor(d.name, i)}
                  opacity={highlight && highlight !== d.name ? 0.2 : 1}
                />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <strong>{total}</strong>
          <span>Total tickets</span>
        </div>
      </div>
      <div className="distribution-legend">
        {data.map((item, i) => (
          <button
            type="button"
            key={item.name}
            aria-pressed={highlight === item.name}
            aria-label={`Highlight ${item.name}`}
            onClick={() => setHighlight(highlight === item.name ? null : item.name)}
          >
            <span className="flex items-center gap-2">
              <span
                className="size-2 rounded-full"
                style={{ background: chartColor(item.name, i) }}
              />
              {item.name}
            </span>
            <strong>
              {item.value}
              <small>{Math.round((item.value / total) * 100)}%</small>
            </strong>
          </button>
        ))}
      </div>
    </div>
  );
}
export function PerformanceChart({
  tickets = [],
  users = [],
  series,
}: {
  tickets?: Ticket[];
  users?: User[];
  series?: { name: string; assigned: number; resolved: number }[];
}) {
  const data = series ?? performance(tickets, users);
  return (
    <div
      className="chart-area"
      role="img"
      aria-label={`Agent workload. ${data.map((d) => `${d.name}: ${d.resolved} resolved of ${d.assigned} assigned`).join('. ')}`}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={data} margin={{ left: -24, top: 10, right: 10 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
          <XAxis dataKey="name" tick={axis} tickLine={false} axisLine={false} />
          <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--accent)' }} />
          <Bar
            dataKey="assigned"
            name="Assigned"
            fill="var(--chart-violet)"
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
            isAnimationActive={false}
          />
          <Bar
            dataKey="resolved"
            name="Resolved"
            fill="var(--chart-green)"
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
