import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { z } from 'zod';
import type { Config } from '../config/env.js';
import type { Database } from '../db/connection.js';
import type { Actor } from '../db/schema.js';
import { permittedTicket } from '../repositories/tickets.js';
import { AppError } from '../middleware/errors.js';
import { validateFile, type UploadFile } from './upload.js';
import { readPrivateBlob } from './blob-storage.js';
import { takeQuota } from './runtime.js';

const kindSchema = z.enum(['ticket', 'comment', 'attachment']);
const metadata = z
  .object({
    name: z.string().min(1).max(180),
    size: z.number().int().min(1).max(10485760),
    mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain']),
  })
  .strict();
const manifestSchema = metadata
  .extend({
    actorId: z.uuid(),
    id: z.uuid(),
    submissionId: z.uuid(),
    kind: kindSchema,
    ticketId: z.uuid().optional(),
    expires: z.number(),
  })
  .strict();
type Manifest = z.infer<typeof manifestSchema>;
const stagingPath = (m: Manifest) => `resolvedesk/staging/${m.actorId}/${m.id}`;
const sign = (value: string, config: Config) =>
  createHmac('sha256', config.SESSION_SECRET)
    .update('resolvedesk-upload:' + value)
    .digest('base64url');

export async function prepareUploads(db: Database, config: Config, actor: Actor, raw: unknown) {
  if (config.STORAGE_DRIVER !== 'blob') throw new AppError(404, 'Direct uploads are unavailable');
  const input = z
    .object({
      kind: kindSchema,
      ticketId: z.uuid().optional(),
      submissionId: z.uuid(),
      files: z.array(metadata).min(1).max(config.UPLOAD_MAX_FILES),
    })
    .strict()
    .parse(raw);
  if (input.kind === 'ticket') {
    if (actor.role === 'agent' || input.ticketId)
      throw new AppError(403, 'Ticket creation is unavailable');
  } else {
    if (!input.ticketId) throw new AppError(400, 'A ticket is required');
    await permittedTicket(db, actor, input.ticketId);
  }
  if (
    input.files.some((f) => f.size > config.UPLOAD_MAX_FILE_BYTES) ||
    input.files.reduce((n, f) => n + f.size, 0) > config.UPLOAD_MAX_REQUEST_BYTES
  )
    throw new AppError(413, 'Upload exceeds the configured limits');
  if (!(await takeQuota(db, 'upload-grants:' + actor.id, 30, 3600)))
    throw new AppError(429, 'Upload limit reached. Try again later.');
  return Promise.all(
    input.files.map(async (file) => {
      const manifest: Manifest = {
        ...file,
        actorId: actor.id,
        id: randomUUID(),
        submissionId: input.submissionId,
        kind: input.kind,
        ticketId: input.ticketId,
        expires: Date.now() + 86400000,
      };
      const encoded = Buffer.from(JSON.stringify(manifest)).toString('base64url');
      return {
        pathname: stagingPath(manifest),
        receipt: encoded + '.' + sign(encoded, config),
        token: await generateClientTokenFromReadWriteToken({
          token: config.BLOB_READ_WRITE_TOKEN,
          pathname: stagingPath(manifest),
          maximumSizeInBytes: file.size,
          allowedContentTypes: [file.mime],
          validUntil: Date.now() + 15 * 60000,
          addRandomSuffix: false,
          allowOverwrite: false,
        }),
      };
    }),
  );
}

export async function loadUploads(
  config: Config,
  actor: Actor,
  kind: string,
  ticketId: string | undefined,
  submissionId: unknown,
  raw: unknown,
): Promise<UploadFile[]> {
  if (config.STORAGE_DRIVER !== 'blob') throw new AppError(400, 'Direct uploads are unavailable');
  const receipts = z.array(z.string().max(2000)).min(1).max(config.UPLOAD_MAX_FILES).parse(raw);
  if (new Set(receipts).size !== receipts.length) throw new AppError(400, 'Duplicate attachment');
  const files: UploadFile[] = [];
  let total = 0;
  for (const receipt of receipts) {
    const [encoded, signature, extra] = receipt.split('.');
    const expected = sign(encoded ?? '', config);
    if (
      !encoded ||
      !signature ||
      extra ||
      Buffer.byteLength(signature) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      throw new AppError(400, 'Invalid upload receipt');
    let decoded: unknown;
    try {
      decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    } catch {
      throw new AppError(400, 'Invalid upload receipt');
    }
    const m = manifestSchema.parse(decoded);
    if (
      m.actorId !== actor.id ||
      m.kind !== kind ||
      m.ticketId !== ticketId ||
      m.submissionId !== submissionId ||
      m.expires <= Date.now()
    )
      throw new AppError(403, 'Upload receipt has expired or belongs to another submission');
    if (m.size > config.UPLOAD_MAX_FILE_BYTES) throw new AppError(413, 'Attachment is too large');
    const contents = await readPrivateBlob(stagingPath(m), config, m.size);
    if (contents.length !== m.size) throw new AppError(400, 'Incomplete file upload');
    total += contents.length;
    if (total > config.UPLOAD_MAX_REQUEST_BYTES) throw new AppError(413, 'Upload is too large');
    // The browser's MIME claim is never trusted; inspect the downloaded bytes before persistence.
    files.push(await validateFile(m.name, m.mime, contents));
  }
  return files;
}
