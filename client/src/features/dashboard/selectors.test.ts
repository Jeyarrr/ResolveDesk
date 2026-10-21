import { describe, expect, it } from 'vitest';
import { createSeed } from '../../data/seed';
import { distribution, reportWindow, ticketMetrics, volumeSeries } from './selectors';
describe('consistent sample analytics', () => {
  const { tickets } = createSeed();
  it('calculates metrics from the same ticket collection', () => {
    const metrics = ticketMetrics(tickets);
    expect(metrics.total).toBe(48);
    expect(metrics.resolved).toBe(
      tickets.filter((t) => ['Resolved', 'Closed'].includes(t.status)).length,
    );
  });
  it('has status totals equal to the ticket count', () => {
    expect(distribution(tickets, 'status').reduce((n, s) => n + s.value, 0)).toBe(tickets.length);
  });
  it('makes reporting date ranges affect results', () => {
    expect(reportWindow(tickets, 7).tickets.length).toBeLessThan(
      reportWindow(tickets, 90).tickets.length,
    );
  });
  it('produces count-based chart series and handles empty metrics', () => {
    expect(volumeSeries(tickets, 7)).toHaveLength(7);
    expect(ticketMetrics([]).sla).toBeNull();
    expect(ticketMetrics([]).average).toBe(0);
  });
});
