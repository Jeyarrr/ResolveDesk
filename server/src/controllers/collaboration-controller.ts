import type { RequestHandler } from 'express';
import type { Database } from '../db/connection.js';
import type { Config } from '../config/env.js';
import { localStorage, type PrivateStorage } from '../services/storage.js';
import { parseUpload } from '../services/upload.js';
import { attachmentService, visibleAttachments } from '../services/attachments.js';
import { permittedTicket } from '../repositories/tickets.js';
import { uuid } from '../validation/schemas.js';
import { AppError } from '../middleware/errors.js';

export function collaborationController(
  db: Database,
  config: Config,
  storage: PrivateStorage = localStorage(config),
) {
  const service = attachmentService(db, storage);
  let inflight = 0;
  const submit =
    (kind: 'ticket' | 'comment' | 'attachment'): RequestHandler =>
    async (req, res) => {
      const ticketId = kind === 'ticket' ? undefined : uuid.parse(req.params.id);
      if (ticketId) await permittedTicket(db, req.actor, ticketId);
      const multipart = !!req.is('multipart/form-data');
      if (multipart && inflight >= 2)
        throw new AppError(429, 'Uploads are busy. Please retry shortly.');
      if (multipart) inflight++;
      try {
        const parsed = multipart
          ? await parseUpload(req, config)
          : { fields: req.body as Record<string, unknown>, files: [] };
        const fields: Record<string, unknown> = { ...parsed.fields };
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
        if (multipart) inflight--;
      }
    };
  const list: RequestHandler = async (req, res) =>
    res.json({
      success: true,
      data: await visibleAttachments(db, req.actor, uuid.parse(req.params.id)),
    });
  const download: RequestHandler = async (req, res) => {
    const file = await service.download(req.actor, uuid.parse(req.params.id));
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
