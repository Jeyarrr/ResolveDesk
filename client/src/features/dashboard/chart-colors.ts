export function chartColor(name: string, index = 0) {
  const colors: Record<string, string> = {
    open: 'var(--chart-blue)',
    'in progress': 'var(--chart-violet)',
    pending: 'var(--chart-amber)',
    resolved: 'var(--chart-green)',
    closed: '#94a3b8',
    critical: 'var(--chart-red)',
    high: 'var(--chart-orange)',
    medium: 'var(--chart-blue)',
    low: 'var(--chart-green)',
  };
  return (
    colors[name.toLowerCase().replaceAll('_', ' ')] ??
    ['var(--chart-violet)', 'var(--chart-green)', 'var(--chart-amber)'][index % 3]
  );
}
