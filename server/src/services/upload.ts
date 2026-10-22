import Busboy from 'busboy';
import { fileTypeFromBuffer } from 'file-type';
import { extname } from 'node:path';
import type { Request } from 'express';
import type { Config } from '../config/env.js';
import { AppError } from '../middleware/errors.js';

export type UploadFile = { name: string; mime: string; contents: Buffer };
export async function validateFile(
  name: string,
  suppliedMime: string,
  contents: Buffer,
): Promise<UploadFile> {
  if (!contents.length) throw new AppError(400, 'Empty files are not supported');
  // Reject path components, alternate data streams, control and bidi characters in display names.
  if (
    !name ||
    name.length > 180 ||
    // eslint-disable-next-line no-control-regex -- Reject control characters in user filenames.
    /[\\/:\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/u.test(name) ||
    name.startsWith('.') ||
    name.endsWith('.') ||
    name.endsWith(' ')
  )
    throw new AppError(400, 'Use a plain filename of at most 180 characters');
  const extensions: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
  };
  const expected = extensions[extname(name).toLowerCase()];
  if (!expected) throw new AppError(400, 'Supported files: PNG, JPG, WEBP, PDF and plain text');
  let detected: string | undefined;
  try {
    detected = (await fileTypeFromBuffer(contents))?.mime;
  } catch {
    throw new AppError(400, 'Invalid or truncated file content');
  }
  if (expected === 'text/plain' && !detected) {
    let value: string;
    try {
      value = new TextDecoder('utf-8', { fatal: true }).decode(contents);
    } catch {
      throw new AppError(400, 'Text files must contain valid UTF-8');
    }
    // eslint-disable-next-line no-control-regex -- Reject binary control bytes in text uploads.
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value) || /<\s*[!/?a-z]|^#!|<\?php/i.test(value))
      throw new AppError(400, 'Text files must be plain text without markup or executable content');
    detected = 'text/plain';
  }
  if (
    detected !== expected ||
    (suppliedMime && suppliedMime !== 'application/octet-stream' && suppliedMime !== expected)
  )
    throw new AppError(400, 'File contents do not match the filename and media type');
  return { name: name.normalize('NFC'), mime: expected, contents };
}

export function parseUpload(
  req: Request,
  config: Config,
): Promise<{ fields: Record<string, string>; files: UploadFile[] }> {
  if (!req.is('multipart/form-data')) throw new AppError(415, 'Use multipart/form-data for files');
  if (Number(req.headers['content-length'] ?? 0) > config.UPLOAD_MAX_REQUEST_BYTES)
    throw new AppError(413, 'Upload request is too large');
  return new Promise((resolve, reject) => {
    let parser: ReturnType<typeof Busboy>;
    try {
      parser = Busboy({
        headers: req.headers,
        preservePath: true,
        defParamCharset: 'utf8',
        limits: {
          files: config.UPLOAD_MAX_FILES,
          // Busboy emits its limit event when this boundary is reached, not exceeded.
          fileSize: config.UPLOAD_MAX_FILE_BYTES + 1,
          fields: 8,
          fieldSize: 12000,
          parts: config.UPLOAD_MAX_FILES + 8,
          headerPairs: 30,
        },
      });
    } catch {
      reject(new AppError(400, 'Invalid multipart upload'));
      return;
    }
    let settled = false,
      bytes = 0;
    const fields: Record<string, string> = Object.create(null);
    const pending: Promise<UploadFile>[] = [];
    const cleanup = () => {
      clearTimeout(timer);
      req.off('aborted', aborted);
      req.off('error', aborted);
      req.off('data', count);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      req.unpipe(parser);
      parser.destroy();
      req.resume();
      reject(error);
    };
    const aborted = () =>
      fail(new AppError(400, 'Upload interrupted; retry with the same submission identifier'));
    const count = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > config.UPLOAD_MAX_REQUEST_BYTES)
        fail(new AppError(413, 'Upload request is too large'));
    };
    const timer = setTimeout(() => fail(new AppError(408, 'Upload timed out')), 60000);
    req.on('aborted', aborted).on('error', aborted).on('data', count);
    parser.on('field', (name, value, info) => {
      if (info.valueTruncated || info.nameTruncated || Object.hasOwn(fields, name))
        return fail(new AppError(400, 'Invalid or repeated upload field'));
      fields[name] = value;
    });
    parser.on('file', (field, stream, info) => {
      const chunks: Buffer[] = [];
      const task = new Promise<UploadFile>((done, failed) => {
        stream.on('error', () => failed(new AppError(400, 'Invalid upload stream')));
        stream.on('limit', () =>
          fail(
            new AppError(413, `Each file must be at most ${config.UPLOAD_MAX_FILE_BYTES} bytes`),
          ),
        );
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => {
          if (field !== 'files') failed(new AppError(400, 'Files must use the files field'));
          else
            validateFile(info.filename ?? '', info.mimeType, Buffer.concat(chunks)).then(
              done,
              failed,
            );
        });
      });
      task.catch((error) =>
        fail(error instanceof AppError ? error : new AppError(400, 'Invalid file')),
      );
      pending.push(task);
    });
    for (const event of ['filesLimit', 'fieldsLimit', 'partsLimit'] as const)
      parser.on(event, () =>
        fail(
          new AppError(
            413,
            `Too many files or fields; at most ${config.UPLOAD_MAX_FILES} files per upload`,
          ),
        ),
      );
    parser.on('error', () => fail(new AppError(400, 'Invalid or incomplete multipart upload')));
    parser.on('close', () => {
      void Promise.all(pending).then(
        (files) => {
          if (!settled) {
            settled = true;
            cleanup();
            resolve({ fields, files });
          }
        },
        (error) => fail(error),
      );
    });
    req.pipe(parser);
  });
}
