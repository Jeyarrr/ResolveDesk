import { z } from 'zod';
export const uuid = z.uuid();
export const roles = z.enum(['employee', 'agent', 'admin']);
export const statuses = z.enum(['open', 'in_progress', 'pending', 'resolved', 'closed']);
export const lifecycleVersion = z.number().int().min(0).max(2147483646);
export const statusInput = z
  .object({ status: statuses, expectedVersion: lifecycleVersion.optional() })
  .strict();
export const resolutionInput = z
  .object({
    expectedVersion: lifecycleVersion,
    summary: z
      .string()
      .trim()
      .min(20, 'Describe the resolution in at least 20 characters.')
      .max(5000),
  })
  .strict();
export const confirmationInput = z.object({ expectedVersion: lifecycleVersion }).strict();
export const reasonInput = z
  .object({
    expectedVersion: lifecycleVersion,
    reason: z.string().trim().min(10, 'Give a reason of at least 10 characters.').max(2000),
  })
  .strict();
export const priorities = z.enum(['low', 'medium', 'high', 'critical']);
export const email = z
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
export const password = z.string().min(12).max(128);
export const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9_][a-z0-9_.-]{2,31}$/,
    'Use a username of 3-32 letters, numbers, dots, hyphens, or underscores',
  );
export const loginInput = z
  .object({
    email: z.union([email, username]),
    password: z.string().min(1).max(128),
    remember: z.boolean().default(false),
  })
  .strict();
export const pagination = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).default(''),
});
export const ticketQuery = pagination
  .extend({
    status: statuses.optional(),
    priority: priorities.optional(),
    category: uuid.optional(),
    sort: z.enum(['recent', 'oldest', 'priority', 'subject']).default('recent'),
    mine: z.enum(['true', 'false']).default('false'),
  })
  .strict();
export const ticketInput = z
  .object({
    subject: z.string().trim().min(5).max(120),
    description: z.string().trim().min(20).max(5000),
    categoryId: uuid,
    priority: priorities.default('medium'),
  })
  .strict();
export const ticketPatch = ticketInput
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'No editable fields provided');
export const commentInput = z
  .object({ message: z.string().trim().min(1).max(5000), isInternal: z.boolean().default(false) })
  .strict();
export const userInput = z
  .object({
    fullName: z.string().trim().min(2).max(100),
    email,
    username: username.nullable().optional(),
    role: roles.default('employee'),
    accountStatus: z.enum(['active', 'inactive', 'suspended']).default('inactive'),
    departmentId: uuid.nullable(),
  })
  .strict();
export const userPatch = userInput
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'No editable fields provided');
export const userQuery = pagination
  .extend({
    role: roles.optional(),
    accountStatus: z.enum(['active', 'inactive', 'suspended']).optional(),
  })
  .strict();
export const referenceInput = z
  .object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(1000).default(''),
    active: z.boolean().default(true),
  })
  .strict();
export const referencePatch = referenceInput
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'No editable fields provided');
