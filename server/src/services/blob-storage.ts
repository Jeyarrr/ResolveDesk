import { get, put, del, list } from '@vercel/blob';
import { eq } from 'drizzle-orm';
import type { Config } from '../config/env.js';
import type { Database } from '../db/connection.js';
import { attachments } from '../db/schema.js';
import { AppError } from '../middleware/errors.js';
import { localStorage, type PrivateStorage } from './storage.js';

const prefix = 'resolvedesk/attachments/';
export async function readPrivateBlob(path: string, config: Config, maximum = 10485760) {
  const result = await get(path, {
    access: 'private',
    token: config.BLOB_READ_WRITE_TOKEN,
    useCache: false,
  });
  if (!result || result.statusCode !== 200)
    throw new AppError(404, 'Attachment file is unavailable');
  const reader = result.stream.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new AppError(413, 'Attachment exceeds the allowed size');
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}

export function privateStorage(config: Config): PrivateStorage {
  if (config.STORAGE_DRIVER !== 'blob') return localStorage(config);
  const path = (key: string) => {
    if (!/^[0-9a-f-]{36}$/.test(key)) throw new AppError(400, 'Invalid storage identifier');
    return prefix + key;
  };
  return {
    async put(key, contents) {
      await put(path(key), contents, {
        access: 'private',
        token: config.BLOB_READ_WRITE_TOKEN,
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: 'application/octet-stream',
      });
    },
    get: (key) => readPrivateBlob(path(key), config),
    remove: (key) => del(path(key), { token: config.BLOB_READ_WRITE_TOKEN }),
  };
}

export async function cleanupBlobs(db: Database, config: Config, cursor?: string) {
  if (config.STORAGE_DRIVER !== 'blob') return { cursor: null };
  // Bounded page per invocation. A returned cursor can be passed to the next maintenance request.
  const page = await list({
    prefix: 'resolvedesk/',
    limit: 100,
    cursor,
    token: config.BLOB_READ_WRITE_TOKEN,
  });
  for (const blob of page.blobs) {
    if (Date.now() - blob.uploadedAt.getTime() < 86400000) continue;
    if (blob.pathname.startsWith(prefix)) {
      const [row] = await db
        .select({ deletedAt: attachments.deletedAt })
        .from(attachments)
        .where(eq(attachments.storageKey, blob.pathname.slice(prefix.length)));
      if (row && (!row.deletedAt || Date.now() - row.deletedAt.getTime() < 86400000)) continue;
    } else if (!blob.pathname.startsWith('resolvedesk/staging/')) continue;
    await del(blob.url, { token: config.BLOB_READ_WRITE_TOKEN });
  }
  return { cursor: page.hasMore ? page.cursor : null };
}
