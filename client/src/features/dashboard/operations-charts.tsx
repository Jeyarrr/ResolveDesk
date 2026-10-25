import { useId } from 'react';
import { chartColor } from './chart-colors';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Area,
  Cell,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
export function OperationsChart({
  data,
  series,
  horizontal = false,
  line = false,
  labelKey = 'name',
  title,
}: {
  data: Record<string, unknown>[];
  series: { key: string; label: string }[];
  horizontal?: boolean;
  line?: boolean;
  labelKey?: string;
  title: string;
}) {
  const gradientId = useId();
  const colors = ['var(--chart-violet)', 'var(--chart-green)', 'var(--chart-amber)'];
  if (!data.some((row) => series.some((s) => typeof row[s.key] === 'number')))
    return <p className="p-6 text-sm text-muted-foreground">No measurements for these filters.</p>;
  const tooltip = {
    background: 'var(--popover)',
    color: 'var(--foreground)',
    border: '1px solid var(--border)',
    borderRadius: 8,
  };
  const content = (
    <>
      <defs>
        {series.map((s, i) => (
          <linearGradient key={s.key} id={`${gradientId}-${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colors[i % 3]} stopOpacity={0.28} />
            <stop offset="100%" stopColor={colors[i % 3]} stopOpacity={0} />
          </linearGradient>
        ))}
      </defs>
      <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
      <XAxis
        type={horizontal ? 'number' : 'category'}
        dataKey={horizontal ? undefined : labelKey}
        axisLine={false}
        tickLine={false}
        tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
      />
      <YAxis
        type={horizontal ? 'category' : 'number'}
        dataKey={horizontal ? labelKey : undefined}
        width={horizontal ? 85 : 40}
        tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
      />
      <Tooltip contentStyle={tooltip} />
      <Legend
        wrapperStyle={{ fontSize: 11 }}
        formatter={(value) => <span style={{ color: 'var(--muted-foreground)' }}>{value}</span>}
      />
      {series.map((s, i) =>
        line ? (
          <Area
            type="monotone"
            fill={`url(#${gradientId}-${i})`}
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stroke={colors[i % 3]}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        ) : (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={colors[i % 3]}
            radius={horizontal ? [0, 5, 5, 0] : [5, 5, 0, 0]}
            maxBarSize={36}
            isAnimationActive={false}
          >
            {data.map((row, index) => (
              <Cell
                key={index}
                fill={series.length === 1 ? chartColor(String(row[labelKey]), i) : colors[i % 3]}
              />
            ))}
          </Bar>
        ),
      )}
    </>
  );
  return (
    <div
      className="operations-chart h-72 min-w-0 p-3"
      role="img"
      aria-label={`${title}. ${data
        .slice(0, 10)
        .map(
          (d) =>
            `${d[labelKey]}: ${series.map((s) => `${s.label} ${d[s.key] ?? 'no data'}`).join(', ')}`,
        )
        .join('; ')}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        {line ? (
          <AreaChart data={data}>{content}</AreaChart>
        ) : (
          <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'}>
            {content}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
