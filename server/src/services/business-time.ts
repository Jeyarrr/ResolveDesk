import { z } from 'zod';
import type { BusinessCalendar } from '../db/schema.js';

export const calendarInput = z
  .object({
    timezone: z.literal('Asia/Manila'),
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(1).max(24),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    holidays: z
      .array(
        z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .refine(
            (v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
          ),
      )
      .max(366),
  })
  .strict()
  .refine(
    (c) => c.endHour > c.startHour && new Set(c.weekdays).size === c.weekdays.length,
    'Use increasing business hours and distinct weekdays',
  );
const offset = 8 * 3600000; // Supported calendar is Asia/Manila, which has no DST.
function day(date: Date, calendar: BusinessCalendar) {
  const local = new Date(date.getTime() + offset);
  const midnight =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offset;
  return {
    start: midnight + calendar.startHour * 3600000,
    end: midnight + calendar.endHour * 3600000,
    next: midnight + 86400000,
    working:
      calendar.weekdays.includes(local.getUTCDay()) &&
      !calendar.holidays.includes(local.toISOString().slice(0, 10)),
  };
}
export function addBusinessMinutes(start: Date, minutes: number, calendar: BusinessCalendar): Date {
  let cursor = start.getTime(),
    remaining = minutes * 60000;
  for (let i = 0; i < 10000; i++) {
    const d = day(new Date(cursor), calendar);
    if (d.working) {
      cursor = Math.max(cursor, d.start);
      if (cursor < d.end) {
        const available = d.end - cursor;
        if (remaining <= available) return new Date(cursor + remaining);
        remaining -= available;
      }
    }
    cursor = d.next;
  }
  throw new Error('Business calendar exceeded supported horizon');
}
export function businessMinutesBetween(start: Date, end: Date, calendar: BusinessCalendar): number {
  let cursor = start.getTime(),
    total = 0;
  for (let i = 0; cursor < end.getTime() && i < 10000; i++) {
    const d = day(new Date(cursor), calendar);
    if (d.working) total += Math.max(0, Math.min(end.getTime(), d.end) - Math.max(cursor, d.start));
    cursor = d.next;
  }
  return Math.round(total / 60000);
}
