import { readdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { readConfig } from '../config/env.js';
import { connectDatabase } from './connection.js';
import { attachments } from './schema.js';
import { localStorage, storageRoot } from '../services/storage.js';

// Explicit local maintenance only; dry-run by default. Never deletes database records.
const config = readConfig();
if (config.NODE_ENV !== 'development')
  throw new Error('Storage audit is available only for local development');
const cleanup = process.argv.includes('--cleanup');
const { db, pool } = connectDatabase(config);
try {
  const root = storageRoot(config),
    storage = localStorage(config);
  const rows = await db
    .select({ key: attachments.storageKey, deletedAt: attachments.deletedAt })
    .from(attachments);
  const names: string[] = await readdir(root).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [] as string[];
    throw error;
  });
  let orphaned = 0,
    tombstoned = 0,
    removed = 0;
  for (const key of names) {
    if (!/^[0-9a-f-]{36}$/.test(key)) continue;
    const info = await lstat(join(root, key));
    if (!info.isFile() || info.isSymbolicLink() || Date.now() - info.mtimeMs < 86400000) continue;
    const row = rows.find((r) => r.key === key);
    if (!row) orphaned++;
    else if (row.deletedAt && Date.now() - row.deletedAt.getTime() >= 86400000) tombstoned++;
    else continue;
    if (cleanup) {
      await storage.remove(key);
      removed++;
    }
  }
  const missing = rows.filter((row) => !row.deletedAt && !names.includes(row.key)).length;
  console.log({
    mode: cleanup ? 'cleanup' : 'dry-run',
    orphanedOlderThan24h: orphaned,
    deletedObjectsOlderThan24h: tombstoned,
    missingActiveObjects: missing,
    removed,
  });
} finally {
  await pool.end();
}
