import type { RequestHandler } from 'express';
import type { Database } from '../db/connection.js';
import type { Config } from '../config/env.js';
import { type PrivateStorage } from '../services/storage.js';
import { privateStorage } from '../services/blob-storage.js';
import { loadUploads } from '../services/direct-upload.js';
import { z } from 'zod';
import { parseUpload } from '../services/upload.js';
import { attachmentService, visibleAttachments } from '../services/attachments.js';
import { permittedTicket } from '../repositories/tickets.js';
import { uuid } from '../validation/schemas.js';
import { AppError } from '../middleware/errors.js';

export function collaborationController(
  db: Database,
  config: Config,
  storage: PrivateStorage = privateStorage(config),
) {
  const service = attachmentService(db, storage);
  let inflight = 0;
  const submit =
    (kind: 'ticket' | 'comment' | 'attachment'): RequestHandler =>
    async (req, res) => {
      const ticketId = kind === 'ticket' ? undefined : uuid.parse(req.params.id);
      if (ticketId) await permittedTicket(db, req.actor, ticketId);
      const multipart = !!req.is('multipart/form-data');
      if (multipart && config.STORAGE_DRIVER === 'blob')
        throw new AppError(415, 'Use direct uploads for cloud attachments');
      const fileRequest = multipart || req.body?.stagedUploads !== undefined;
      if (fileRequest && inflight >= 2)
        throw new AppError(429, 'Uploads are busy. Please retry shortly.');
      if (fileRequest) inflight++;
      try {
        const parsed = multipart
          ? await parseUpload(req, config)
          : { fields: req.body as Record<string, unknown>, files: [] };
        const fields: Record<string, unknown> = { ...parsed.fields };
        if (fields.stagedUploads !== undefined) {
          parsed.files = await loadUploads(
            config,
            req.actor,
            kind,
            ticketId,
            fields.submissionId,
            fields.stagedUploads,
          );
          delete fields.stagedUploads;
        }
        if (multipart && typeof fields.isInternal === 'string')
          fields.isInternal =
            fields.isInternal === 'true'
              ? true
              : fields.isInternal === 'false'
                ? false
                : fields.isInternal;
        const result = await service.submit(
          req.actor,
          kind,
          ticketId,
          fields,
          parsed.files,
          () => req.aborted || res.destroyed,
        );
        res.status(201).json({ success: true, data: result });
      } finally {
        if (fileRequest) inflight--;
      }
    };
  const list: RequestHandler = async (req, res) =>
    res.json({
      success: true,
      data: await visibleAttachments(db, req.actor, uuid.parse(req.params.id)),
    });
  const download: RequestHandler = async (req, res) => {
    const file = await service.download(req.actor, uuid.parse(req.params.id));
    // Each authenticated chunk stays below Vercel's response payload limit.
    const chunkSize = 2 * 1024 * 1024;
    if (req.query.chunk !== undefined) {
      const chunk = z.coerce.number().int().min(0).max(4).parse(req.query.chunk);
      const start = chunk * chunkSize;
      if (start >= file.contents.length) throw new AppError(416, 'Invalid attachment chunk');
      res.set('X-Attachment-Bytes', String(file.contents.length));
      file.contents = file.contents.subarray(start, start + chunkSize);
    } else if (config.STORAGE_DRIVER === 'blob' && file.contents.length > chunkSize) {
      throw new AppError(400, 'Use chunked download for this attachment');
    }
    res
      .attachment(file.filename)
      .type(file.mime)
      .set('X-Content-Type-Options', 'nosniff')
      .set('Content-Security-Policy', "sandbox; default-src 'none'")
      .send(file.contents);
  };
  const remove: RequestHandler = async (req, res) =>
    res.json({ success: true, data: await service.remove(req.actor, uuid.parse(req.params.id)) });
  const limits: RequestHandler = (_req, res) =>
    res.json({
      success: true,
      data: {
        maxFiles: config.UPLOAD_MAX_FILES,
        maxFileBytes: config.UPLOAD_MAX_FILE_BYTES,
        maxRequestBytes: config.UPLOAD_MAX_REQUEST_BYTES,
      },
    });
  return { submit, list, download, remove, limits };
}
