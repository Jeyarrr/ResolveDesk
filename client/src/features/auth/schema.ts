import { z } from 'zod';
export const loginSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(8, 'Enter at least 8 characters.'),
  remember: z.boolean(),
});
export type LoginInput = z.infer<typeof loginSchema>;
export const recoverySchema = z.object({ email: z.email('Enter a valid email address.') });
