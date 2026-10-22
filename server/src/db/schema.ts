import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  bigint,
  check,
  integer,
  jsonb,
  primaryKey,
  foreignKey,
} from 'drizzle-orm/pg-core';
export const role = pgEnum('role', ['employee', 'agent', 'admin']);
export const accountStatus = pgEnum('account_status', ['active', 'inactive', 'suspended']);
export const priority = pgEnum('priority', ['low', 'medium', 'high', 'critical']);
export const ticketStatus = pgEnum('ticket_status', [
  'open',
  'in_progress',
  'pending',
  'resolved',
  'closed',
]);
const id = () => uuid('id').defaultRandom().primaryKey();
const times = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
export const departments = pgTable(
  'departments',
  {
    id: id(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    active: boolean('active').notNull().default(true),
    ...times(),
  },
  (t) => [uniqueIndex('departments_name_unique').on(sql`lower(${t.name})`)],
);
export const categories = pgTable(
  'ticket_categories',
  {
    id: id(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    active: boolean('active').notNull().default(true),
    ...times(),
  },
  (t) => [uniqueIndex('categories_name_unique').on(sql`lower(${t.name})`)],
);
export const users = pgTable(
  'users',
  {
    id: id(),
    fullName: text('full_name').notNull(),
    email: text('email').notNull(),
    username: text('username'),
    passwordHash: text('password_hash'),
    role: role('role').notNull().default('employee'),
    accountStatus: accountStatus('account_status').notNull().default('inactive'),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'restrict' }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    ...times(),
  },
  (t) => [
    uniqueIndex('users_email_unique').on(sql`lower(${t.email})`),
    uniqueIndex('users_username_unique').on(sql`lower(${t.username})`),
    check(
      'users_username_format',
      sql`${t.username} IS NULL OR ${t.username} ~ '^[a-z0-9_][a-z0-9_.-]{2,31}$'`,
    ),
    index('users_department_idx').on(t.departmentId),
    index('users_role_status_idx').on(t.role, t.accountStatus),
  ],
);
export const tickets = pgTable(
  'tickets',
  {
    id: id(),
    ticketNumber: bigint('ticket_number', { mode: 'number' })
      .generatedAlwaysAsIdentity()
      .notNull()
      .unique(),
    subject: text('subject').notNull(),
    description: text('description').notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    priority: priority('priority').notNull().default('medium'),
    status: ticketStatus('status').notNull().default('open'),
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    assignedAgentId: uuid('assigned_agent_id').references(() => users.id, { onDelete: 'restrict' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'restrict' }),
    resolutionSummary: text('resolution_summary'),
    closedBy: uuid('closed_by').references(() => users.id, { onDelete: 'restrict' }),
    lifecycleVersion: integer('lifecycle_version').notNull().default(0),
    assignmentVersion: integer('assignment_version').notNull().default(0),
    ...times(),
  },
  (t) => [
    index('tickets_requester_updated_idx').on(t.requesterId, t.updatedAt),
    index('tickets_agent_updated_idx').on(t.assignedAgentId, t.updatedAt),
    index('tickets_status_priority_idx').on(t.status, t.priority),
    index('tickets_category_idx').on(t.categoryId),
    index('tickets_created_idx').on(t.createdAt),
    check('ticket_lifecycle_version_nonnegative', sql`${t.lifecycleVersion} >= 0`),
    check('ticket_assignment_version_nonnegative', sql`${t.assignmentVersion} >= 0`),
    check(
      'ticket_resolution_details_consistency',
      sql`((${t.resolvedBy} IS NULL) = (${t.resolutionSummary} IS NULL)) AND (${t.resolvedBy} IS NULL OR (${t.status} IN ('resolved','closed') AND length(trim(${t.resolutionSummary})) BETWEEN 20 AND 5000)) AND (${t.closedBy} IS NULL OR ${t.status} = 'closed')`,
    ),
    check(
      'ticket_resolution_consistency',
      sql`((${t.status} IN ('resolved','closed')) = (${t.resolvedAt} IS NOT NULL)) AND ((${t.status} = 'closed') = (${t.closedAt} IS NOT NULL))`,
    ),
  ],
);
export const comments = pgTable(
  'ticket_comments',
  {
    id: id(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'restrict' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    message: text('message').notNull(),
    isInternal: boolean('is_internal').notNull().default(false),
    position: bigint('position', { mode: 'number' }).generatedAlwaysAsIdentity().notNull().unique(),
    ...times(),
  },
  (t) => [
    index('comments_ticket_created_idx').on(t.ticketId, t.createdAt),
    uniqueIndex('comments_ticket_id_unique').on(t.ticketId, t.id),
    index('comments_ticket_position_idx').on(t.ticketId, t.position),
  ],
);
export const activity = pgTable(
  'ticket_activity',
  {
    id: id(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'restrict' }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    action: text('action').notNull(),
    oldValue: text('old_value'),
    newValue: text('new_value'),
    explanation: text('explanation'),
    lifecycleVersion: integer('lifecycle_version'),
    isInternal: boolean('is_internal').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('activity_ticket_created_idx').on(t.ticketId, t.createdAt),
    uniqueIndex('activity_ticket_lifecycle_version_unique').on(t.ticketId, t.lifecycleVersion),
  ],
);
export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expiry_idx').on(t.expiresAt)],
);
export const escalations = pgTable(
  'ticket_escalations',
  {
    id: id(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'restrict' }),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    reason: text('reason').notNull(),
    status: text('status', { enum: ['open', 'acknowledged', 'resolved'] })
      .notNull()
      .default('open'),
    acknowledgedBy: uuid('acknowledged_by').references(() => users.id, { onDelete: 'restrict' }),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('escalations_one_active_per_ticket')
      .on(t.ticketId)
      .where(sql`${t.status} IN ('open', 'acknowledged')`),
    index('escalations_status_created_idx').on(t.status, t.createdAt),
    index('escalations_ticket_created_idx').on(t.ticketId, t.createdAt),
    check('escalation_reason_length', sql`length(trim(${t.reason})) BETWEEN 10 AND 2000`),
    check(
      'escalation_state_consistency',
      sql`${t.status} IN ('open', 'acknowledged', 'resolved') AND ((${t.acknowledgedBy} IS NULL) = (${t.acknowledgedAt} IS NULL)) AND ((${t.resolvedBy} IS NULL) = (${t.resolvedAt} IS NULL)) AND ((${t.status} = 'resolved') = (${t.resolvedAt} IS NOT NULL)) AND (${t.status} <> 'acknowledged' OR ${t.acknowledgedAt} IS NOT NULL) AND (${t.status} <> 'open' OR ${t.acknowledgedAt} IS NULL)`,
    ),
  ],
);
export type Actor = typeof users.$inferSelect;
export const submissions = pgTable('ticket_submissions', {
  id: uuid('id').primaryKey(),
  actorId: uuid('actor_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  ticketId: uuid('ticket_id').references(() => tickets.id, { onDelete: 'restrict' }),
  kind: text('kind').notNull(),
  fingerprint: text('fingerprint').notNull(),
  result: jsonb('result').$type<unknown>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
export const attachments = pgTable(
  'ticket_attachments',
  {
    id: id(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'restrict' }),
    commentId: uuid('comment_id'),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => submissions.id, { onDelete: 'restrict' }),
    originalFilename: text('original_filename').notNull(),
    storageKey: uuid('storage_key').notNull().unique(),
    mimeType: text('mime_type').notNull(),
    fileSize: integer('file_size').notNull(),
    isInternal: boolean('is_internal').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      columns: [t.ticketId, t.commentId],
      foreignColumns: [comments.ticketId, comments.id],
      name: 'attachments_comment_ticket_fk',
    }).onDelete('restrict'),
    index('attachments_ticket_created_idx').on(t.ticketId, t.createdAt),
    index('attachments_comment_idx').on(t.commentId),
    check('attachment_size_valid', sql`${t.fileSize} > 0 AND ${t.fileSize} <= 10485760`),
    check(
      'attachment_mime_valid',
      sql`${t.mimeType} IN ('image/png','image/jpeg','image/webp','application/pdf','text/plain')`,
    ),
  ],
);
export const conversationReads = pgTable(
  'conversation_reads',
  {
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    lastPosition: bigint('last_position', { mode: 'number' }).notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.ticketId, t.userId] }),
    check('read_position_nonnegative', sql`${t.lastPosition} >= 0`),
  ],
);
export const responseTemplates = pgTable(
  'response_templates',
  {
    id: id(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    active: boolean('active').notNull().default(true),
    ...times(),
  },
  (t) => [
    index('templates_active_title_idx').on(t.active, t.title),
    check(
      'template_lengths',
      sql`length(trim(${t.title})) BETWEEN 2 AND 100 AND length(trim(${t.body})) BETWEEN 1 AND 5000`,
    ),
  ],
);
