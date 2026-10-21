import { describe, expect, it } from 'vitest';
import { errorMessage } from './utils';
import { replySchema } from '../features/tickets/schema';

describe('user-facing errors', () => {
  it('shows a readable message for a whitespace-only reply', () => {
    const result = replySchema.safeParse('   ');
    expect(result.success).toBe(false);
    if (!result.success) expect(errorMessage(result.error)).toBe('Write a reply first.');
  });
  it('preserves application errors and safely handles unknown failures', () => {
    expect(errorMessage(new Error('Select a valid support agent.'))).toBe(
      'Select a valid support agent.',
    );
    expect(errorMessage(null)).toBe('Something went wrong. Please try again.');
  });
});
