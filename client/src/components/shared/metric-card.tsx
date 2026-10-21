import type { LucideIcon } from 'lucide-react';
export function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone = 'indigo',
}: {
  label: string;
  value: string | number;
  note: string;
  icon: LucideIcon;
  tone?: string;
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
    </div>
  );
}
