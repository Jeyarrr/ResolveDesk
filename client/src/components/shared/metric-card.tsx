import type { LucideIcon } from 'lucide-react';
export function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone = 'indigo',
  history,
  historyLabel,
}: {
  label: string;
  value: string | number;
  note: string;
  icon: LucideIcon;
  tone?: string;
  history?: number[];
  historyLabel?: string;
}) {
  return (
    <div className="metric-card">
      <div className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <span className={`metric-icon metric-${tone}`}>
          <Icon size={17} />
        </span>
      </div>
      <strong>{value}</strong>
      <p>{note}</p>
      {history && history.length > 1 && (
        <svg
          className="metric-sparkline"
          viewBox="0 0 160 36"
          role="img"
          aria-label={historyLabel ?? 'Ticket trend'}
          preserveAspectRatio="none"
        >
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            points={history
              .map(
                (v, i) =>
                  `${(i * 160) / (history.length - 1)},${32 - (v * 28) / Math.max(1, ...history)}`,
              )
              .join(' ')}
          />
        </svg>
      )}
    </div>
  );
}
