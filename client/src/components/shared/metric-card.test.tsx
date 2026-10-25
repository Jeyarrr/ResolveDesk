import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Ticket } from 'lucide-react';
import { MetricCard } from './metric-card';

describe('metric presentation', () => {
  it('keeps a metric static when no history exists', () => {
    render(<MetricCard label="Active agents" value={3} note="Active accounts" icon={Ticket} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
  it('plots only the supplied history, including an all-zero series', () => {
    const { container } = render(
      <MetricCard
        label="Received"
        value={0}
        note="Last three days"
        icon={Ticket}
        history={[0, 0, 0]}
        historyLabel="Received over three days"
      />,
    );
    expect(screen.getByRole('img', { name: 'Received over three days' })).toBeInTheDocument();
    expect(container.querySelector('polyline')).toHaveAttribute('points', '0,32 80,32 160,32');
  });
});
