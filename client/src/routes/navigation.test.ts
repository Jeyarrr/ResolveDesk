import { describe, expect, it } from 'vitest';
import { navigationFor } from './navigation';
describe('role-specific navigation', () => {
  it('shows employee pages without organization or admin pages', () => {
    const paths = navigationFor('employee').map((n) => n.to);
    expect(paths).toEqual([
      '/',
      '/tickets/mine',
      '/tickets/new',
      '/knowledge',
      '/notifications',
      '/settings',
    ]);
  });
  it('adds all tickets for agents, without administration', () => {
    const paths = navigationFor('agent').map((n) => n.to);
    expect(paths).toContain('/tickets');
    expect(paths).not.toContain('/team');
    expect(paths).not.toContain('/reports');
  });
  it('includes team and reports for administrators', () => {
    const paths = navigationFor('admin').map((n) => n.to);
    expect(paths).toContain('/team');
    expect(paths).toContain('/reports');
  });
});
