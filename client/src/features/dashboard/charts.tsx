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
const COLORS = ['#8b86f5', '#60a5fa', '#f6b85c', '#52cfa1', '#8b98aa'];
const tooltipStyle = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  color: 'var(--foreground)',
  fontSize: 12,
};
const axis = { fontSize: 10, fill: 'var(--muted-foreground)' };
export function VolumeChart({
  tickets = [],
  days = 14,
  series,
}: {
  tickets?: Ticket[];
  days?: number;
  series?: { label: string; received: number; resolved: number }[];
}) {
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
            <linearGradient id="volume-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b86f5" stopOpacity={0.23} />
              <stop offset="100%" stopColor="#8b86f5" stopOpacity={0} />
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
            stroke="#8b86f5"
            fill="url(#volume-fill)"
            strokeWidth={2.5}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            name="Resolved"
            dataKey="resolved"
            stroke="#52cfa1"
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
  const data = counts ?? distribution(tickets, kind);
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
                <Cell key={d.name} fill={COLORS[i]} />
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
          <div key={item.name}>
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ background: COLORS[i] }} />
              {item.name}
            </span>
            <strong>{item.value}</strong>
          </div>
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
      aria-label={`Agent performance. ${data.map((d) => `${d.name}: ${d.resolved} resolved of ${d.assigned} assigned`).join('. ')}`}
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
            fill="#8b86f5"
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
            isAnimationActive={false}
          />
          <Bar
            dataKey="resolved"
            name="Resolved"
            fill="#52cfa1"
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
