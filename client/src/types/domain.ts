import { z } from 'zod';

export const roles = ['employee', 'agent', 'admin'] as const;
export type Role = (typeof roles)[number];
export const roleLabels: Record<Role, string> = {
  employee: 'Employee',
  agent: 'IT Support Agent',
  admin: 'Administrator',
};
export const statuses = ['Open', 'In progress', 'Pending', 'Resolved', 'Closed'] as const;
export const priorities = ['Low', 'Medium', 'High', 'Critical'] as const;
export const categories = ['Hardware', 'Software', 'Network', 'Access', 'Email'] as const;
export type Status = (typeof statuses)[number];
export type Priority = (typeof priorities)[number];
export type Category = (typeof categories)[number];

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  role: z.enum(roles),
  department: z.string(),
  status: z.enum(['Active', 'Away']),
  initials: z.string(),
});
export type User = z.infer<typeof userSchema>;
const commentSchema = z.object({
  id: z.string(),
  authorId: z.string(),
  body: z.string(),
  createdAt: z.iso.datetime(),
});
const activitySchema = z.object({
  id: z.string(),
  actorId: z.string(),
  text: z.string(),
  createdAt: z.iso.datetime(),
});
export const attachmentSchema = z.object({
  name: z.string().max(200),
  size: z.number().nonnegative(),
  type: z.string(),
});
export type Attachment = z.infer<typeof attachmentSchema>;
export const ticketSchema = z.object({
  id: z.string(),
  subject: z.string(),
  description: z.string(),
  category: z.string(),
  priority: z.enum(priorities),
  status: z.enum(statuses),
  requesterId: z.string(),
  assigneeId: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  dueAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
  attachments: z.array(attachmentSchema),
  comments: z.array(commentSchema),
  activity: z.array(activitySchema),
});
export type Ticket = z.infer<typeof ticketSchema>;
export const notificationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  body: z.string(),
  ticketId: z.string().nullable(),
  createdAt: z.iso.datetime(),
  read: z.boolean(),
});
export type Notification = z.infer<typeof notificationSchema>;
export interface Article {
  id: string;
  title: string;
  summary: string;
  category: Category;
  readMinutes: number;
  featured: boolean;
  updatedAt: string;
  sections: { title: string; body: string }[];
}
export const preferencesSchema = z.object({
  email: z.boolean(),
  desktop: z.boolean(),
  digest: z.boolean(),
});
export const demoStateSchema = z.object({
  version: z.literal(1),
  users: z.array(userSchema),
  tickets: z.array(ticketSchema),
  notifications: z.array(notificationSchema),
  preferences: z.record(z.string(), preferencesSchema),
});
export type DemoState = z.infer<typeof demoStateSchema>;
