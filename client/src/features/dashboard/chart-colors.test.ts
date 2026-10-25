import { describe, expect, it } from 'vitest';
import { chartColor } from './chart-colors';

describe('chart semantics', () => {
  it('keeps priority colors stable when categories are reordered or missing', () => {
    expect(chartColor('Critical', 0)).toBe('var(--chart-red)');
    expect(chartColor('critical', 4)).toBe('var(--chart-red)');
    expect(chartColor('Low', 1)).toBe('var(--chart-green)');
    expect(chartColor('High', 2)).toBe('var(--chart-orange)');
  });
  it('accepts both API status values and display labels', () => {
    expect(chartColor('in_progress')).toBe(chartColor('In progress'));
    expect(chartColor('Resolved')).toBe('var(--chart-green)');
  });
});
