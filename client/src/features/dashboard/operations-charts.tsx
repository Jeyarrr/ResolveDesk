import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
  const colors = ['#8b86f5', '#52cfa1', '#f6b85c'];
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
      <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" />
      <XAxis
        type={horizontal ? 'number' : 'category'}
        dataKey={horizontal ? undefined : labelKey}
        tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
      />
      <YAxis
        type={horizontal ? 'category' : 'number'}
        dataKey={horizontal ? labelKey : undefined}
        width={horizontal ? 85 : 40}
        tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
      />
      <Tooltip contentStyle={tooltip} />
      <Legend wrapperStyle={{ fontSize: 11 }} />
      {series.map((s, i) =>
        line ? (
          <Line
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
            isAnimationActive={false}
          />
        ),
      )}
    </>
  );
  return (
    <div
      className="h-72 min-w-0 p-3"
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
          <LineChart data={data}>{content}</LineChart>
        ) : (
          <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'}>
            {content}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
