import { recordOperation } from './operations.js';
import { createHash, randomUUID } from 'node:crypto';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database, Executor } from '../db/connection.js';
import { attachments, comments, submissions, users, tickets, type Actor } from '../db/schema.js';
import { permittedTicket, scope } from '../repositories/tickets.js';
import { AppError } from '../middleware/errors.js';
import { commentInput, ticketInput, uuid } from '../validation/schemas.js';
import { ticketService } from './tickets.js';
import type { PrivateStorage } from './storage.js';
import type { UploadFile } from './upload.js';

const attachmentInput = z
  .object({ isInternal: z.boolean().default(false), commentId: uuid.nullable().default(null) })
  .strict();
export async function visibleAttachments(db: Executor, actor: Actor, ticketId: string) {
  await permittedTicket(db, actor, ticketId);
  return db
    .select({
      id: attachments.id,
      ticketId: attachments.ticketId,
      commentId: attachments.commentId,
      originalFilename: attachments.originalFilename,
      mimeType: attachments.mimeType,
      fileSize: attachments.fileSize,
      uploadedBy: attachments.uploadedBy,
      uploaderName: users.fullName,
      isInternal: attachments.isInternal,
      createdAt: attachments.createdAt,
      canDelete: sql<boolean>`${actor.role === 'admin'} OR ${attachments.uploadedBy} = ${actor.id}`,
    })
    .from(attachments)
    .innerJoin(tickets, eq(tickets.id, attachments.ticketId))
    .innerJoin(users, eq(users.id, attachments.uploadedBy))
    .leftJoin(comments, eq(comments.id, attachments.commentId))
    .where(
      and(
        eq(attachments.ticketId, ticketId),
        scope(actor),
        isNull(attachments.deletedAt),
        actor.role === 'employee'
          ? sql`${attachments.isInternal} = false AND (${comments.id} IS NULL OR ${comments.isInternal} = false)`
          : undefined,
      ),
    )
    .orderBy(asc(attachments.createdAt), asc(attachments.id));
}
export function attachmentService(db: Database, storage: PrivateStorage) {
  async function accessible(actor: Actor, id: string, executor: Executor = db) {
    const [row] = await executor
      .select({ attachment: attachments })
      .from(attachments)
      .innerJoin(tickets, eq(tickets.id, attachments.ticketId))
      .leftJoin(comments, eq(comments.id, attachments.commentId))
      .where(
        and(
          eq(attachments.id, id),
          isNull(attachments.deletedAt),
          scope(actor),
          actor.role === 'employee'
            ? sql`${attachments.isInternal} = false AND (${comments.id} IS NULL OR ${comments.isInternal} = false)`
            : undefined,
        ),
      );
    if (!row) throw new AppError(404, 'Attachment not found');
    return row.attachment;
  }
  return {
    async submit(
      actor: Actor,
      kind: 'ticket' | 'comment' | 'attachment',
      ticketId: string | undefined,
      raw: Record<string, unknown>,
      files: UploadFile[],
      aborted: () => boolean = () => false,
    ) {
      const { submissionId: rawId, ...body } = raw;
      const submissionId = rawId === undefined && !files.length ? randomUUID() : uuid.parse(rawId);
      const input =
        kind === 'ticket'
          ? ticketInput.parse(body)
          : kind === 'comment'
            ? commentInput.parse(body)
            : attachmentInput.parse(body);
      if (kind === 'ticket' && actor.role === 'agent')
        throw new AppError(403, 'Agents manage assigned tickets');
      if ('isInternal' in input && input.isInternal && actor.role === 'employee')
        throw new AppError(403, 'Employees cannot create internal content');
      if (kind === 'attachment' && !files.length)
        throw new AppError(400, 'Select at least one file');
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify({
            kind,
            ticketId,
            input,
            files: files.map((f) => ({
              name: f.name,
              mime: f.mime,
              hash: createHash('sha256').update(f.contents).digest('hex'),
            })),
          }),
        )
        .digest('hex');
      const written: string[] = [];
      const savedIds: string[] = [];
      try {
        return await db.transaction(async (tx) => {
          if (ticketId) await permittedTicket(tx, actor, ticketId, true);
          const [reserved] = await tx
            .insert(submissions)
            .values({ id: submissionId, actorId: actor.id, kind, fingerprint })
            .onConflictDoNothing()
            .returning();
          if (!reserved) {
            const [prior] = await tx
              .select()
              .from(submissions)
              .where(eq(submissions.id, submissionId));
            if (!prior || prior.actorId !== actor.id || prior.fingerprint !== fingerprint)
              throw new AppError(
                409,
                'This submission identifier was already used for different content',
              );
            if (prior.ticketId) await permittedTicket(tx, actor, prior.ticketId, true);
            return prior.result;
          }
          let target = ticketId!,
            commentId: string | null = null;
          let result: unknown;
          let internal = 'isInternal' in input ? input.isInternal : false;
          if (kind === 'ticket') {
            const saved = await ticketService(tx).create(actor, ticketInput.parse(input));
            target = saved.id;
            result = saved;
          } else if (kind === 'comment') {
            const saved = await ticketService(tx).comment(actor, target, commentInput.parse(input));
            commentId = saved.id;
            result = saved;
          } else {
            const data = attachmentInput.parse(input);
            commentId = data.commentId;
            if (commentId) {
              const [comment] = await tx
                .select()
                .from(comments)
                .where(and(eq(comments.id, commentId), eq(comments.ticketId, target)));
              if (!comment || (actor.role === 'employee' && comment.isInternal))
                throw new AppError(404, 'Comment not found');
              if (comment.authorId !== actor.id && actor.role !== 'admin')
                throw new AppError(403, 'Attach files to your own messages');
              if (data.isInternal !== comment.isInternal)
                throw new AppError(400, 'Attachment visibility must match its message');
              internal = comment.isInternal;
            }
          }
          for (const file of files) {
            if (aborted()) throw new AppError(400, 'Upload interrupted');
            const key = randomUUID();
            written.push(key); // Include a partially written object in rollback cleanup.
            await storage.put(key, file.contents);
            const [saved] = await tx
              .insert(attachments)
              .values({
                ticketId: target,
                commentId,
                uploadedBy: actor.id,
                submissionId,
                storageKey: key,
                originalFilename: file.name,
                mimeType: file.mime,
                fileSize: file.contents.length,
                isInternal: internal,
              })
              .returning({ id: attachments.id });
            savedIds.push(saved!.id);
          }
          if (files.length)
            await recordOperation(tx, {
              ticketId: target,
              actorId: actor.id,
              action: 'Attachments uploaded',
              newValue: String(files.length),
              isInternal: internal,
            });
          if (kind === 'attachment')
            result = (await visibleAttachments(tx, actor, target)).filter((a) =>
              savedIds.includes(a.id),
            );
          if (aborted()) throw new AppError(400, 'Upload interrupted');
          await tx
            .update(submissions)
            .set({ ticketId: target, result })
            .where(eq(submissions.id, submissionId));
          return result;
        });
      } catch (error) {
        const cleanup = await Promise.allSettled(written.map((key) => storage.remove(key)));
        if (cleanup.some((r) => r.status === 'rejected'))
          console.error('Attachment cleanup requires storage audit');
        throw error;
      }
    },
    async download(actor: Actor, id: string) {
      const row = await accessible(actor, id);
      const contents = await storage.get(row.storageKey);
      // Recheck after disk I/O, including deletions and assignment changes.
      await accessible(actor, id);
      return { filename: row.originalFilename, mime: row.mimeType, contents };
    },
    async remove(actor: Actor, id: string) {
      const row = await accessible(actor, id);
      await db.transaction(async (tx) => {
        await permittedTicket(tx, actor, row.ticketId, true);
        const current = await accessible(actor, id, tx);
        if (actor.role !== 'admin' && current.uploadedBy !== actor.id)
          throw new AppError(
            403,
            'Only the uploader or an administrator can delete this attachment',
          );
        await tx.update(attachments).set({ deletedAt: new Date() }).where(eq(attachments.id, id));
        await recordOperation(tx, {
          ticketId: row.ticketId,
          actorId: actor.id,
          action: 'Attachment deleted',
          isInternal: row.isInternal,
        });
      });
      // The committed tombstone revokes downloads even if disk cleanup needs retrying.
      try {
        await storage.remove(row.storageKey);
      } catch {
        console.error('Deleted attachment requires storage cleanup');
      }
      return { id, deleted: true };
    },
  };
}
