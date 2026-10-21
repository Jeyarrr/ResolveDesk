import { z } from 'zod';
export const loginSchema = z.object({
  email: z.union([
    z.email('Enter a valid email address.'),
    z
      .string()
      .trim()
      .regex(/^[a-z0-9_][a-z0-9_.-]{2,31}$/i, 'Enter your username or email address.'),
  ]),
  password: z.string().min(1, 'Enter your password.').max(128),
  remember: z.boolean(),
});
export type LoginInput = z.infer<typeof loginSchema>;
export const recoverySchema = z.object({ email: z.email('Enter a valid email address.') });
