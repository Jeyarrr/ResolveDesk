import dotenv from 'dotenv';
import { z } from 'zod';
dotenv.config({ path: new URL('../../.env', import.meta.url), quiet: true });
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    HOST: z.string().default('127.0.0.1'),
    DATABASE_URL: z.url().refine((v) => /^postgres(ql)?:/.test(v)),
    SESSION_SECRET: z
      .string()
      .min(32)
      .refine((v) => !v.includes('replace') && !v.includes('placeholder'), 'Use a random secret'),
    CLIENT_ORIGIN: z
      .url()
      .default('http://127.0.0.1:5173')
      .refine((v) => new URL(v).origin === v, 'Use an exact origin without a trailing slash'),
    DB_SSL: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
    COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  })
  .superRefine((v, ctx) => {
    if (v.NODE_ENV === 'production' && (!v.DB_SSL || !v.CLIENT_ORIGIN.startsWith('https://')))
      ctx.addIssue({
        code: 'custom',
        message: 'Production requires database TLS and an HTTPS client origin',
      });
    if (v.COOKIE_SAME_SITE === 'none' && v.NODE_ENV !== 'production')
      ctx.addIssue({ code: 'custom', message: 'SameSite=None requires production HTTPS cookies' });
  });
export type Config = z.infer<typeof schema>;
export function readConfig(input = process.env): Config {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new Error(
      `Invalid server configuration: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  return result.data;
}
