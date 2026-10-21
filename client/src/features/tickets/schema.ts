import { z } from 'zod';
import { priorities } from '../../types/domain';
export const createTicketSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(5, 'Use at least 5 characters.')
    .max(120, 'Keep the subject under 120 characters.'),
  description: z
    .string()
    .trim()
    .min(20, 'Add at least 20 characters so we can help.')
    .max(5000, 'Keep the description under 5,000 characters.'),
  category: z.string().min(1, 'Select a category.'),
  priority: z.enum(priorities),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export const replySchema = z
  .string()
  .trim()
  .min(1, 'Write a reply first.')
  .max(2000, 'Keep replies under 2,000 characters.');
