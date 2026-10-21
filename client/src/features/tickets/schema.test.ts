import { describe, expect, it } from 'vitest';
import { createTicketSchema, replySchema } from './schema';
import { loginSchema, recoverySchema } from '../auth/schema';
const valid = {
  subject: 'Office printer is offline',
  description: 'The printer is not responding after a restart.',
  category: 'Hardware',
  priority: 'Medium',
};
describe('ticket validation', () => {
  it('accepts and trims a well-described request', () => {
    expect(createTicketSchema.parse({ ...valid, subject: ` ${valid.subject} ` }).subject).toBe(
      valid.subject,
    );
  });
  it.each([
    { subject: '   ' },
    { description: 'Too short' },
    { category: '' },
    { priority: 'Invalid' },
    { subject: 'x'.repeat(121) },
    { description: 'x'.repeat(5001) },
  ])('rejects invalid ticket fields: %o', (patch) => {
    expect(createTicketSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
  it('rejects empty or oversized replies', () => {
    expect(replySchema.safeParse('  ').success).toBe(false);
    expect(replySchema.safeParse('x'.repeat(2001)).success).toBe(false);
  });
});
describe('authentication form validation', () => {
  it('accepts a valid email and password', () => {
    expect(
      loginSchema.safeParse({
        email: 'admin@resolvedesk.example',
        password: 'demo-only',
        remember: true,
      }).success,
    ).toBe(true);
  });
  it('rejects malformed email and short password', () => {
    expect(
      loginSchema.safeParse({ email: 'invalid', password: 'short', remember: false }).success,
    ).toBe(false);
  });
  it('validates recovery email', () => {
    expect(recoverySchema.safeParse({ email: 'invalid' }).success).toBe(false);
    expect(recoverySchema.safeParse({ email: 'employee@resolvedesk.example' }).success).toBe(true);
  });
});
