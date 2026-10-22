import { mkdir, writeFile, readFile, unlink, lstat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Config } from '../config/env.js';
import { AppError } from '../middleware/errors.js';

export interface PrivateStorage {
  put(key: string, contents: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
export const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
export function storageRoot(config: Pick<Config, 'UPLOAD_DIR'>) {
  const root = resolve(projectRoot, config.UPLOAD_DIR);
  const comparable = (path: string) => (process.platform === 'win32' ? path.toLowerCase() : path);
  const inside = (parent: string) =>
    comparable(root) === comparable(parent) ||
    comparable(root).startsWith(comparable(parent) + sep);
  if (
    comparable(root) === comparable(resolve(projectRoot)) ||
    root
      .split(/[\\/]/)
      .some((p) => ['public', 'dist', 'build', '.git', 'node_modules'].includes(p.toLowerCase())) ||
    inside(resolve(projectRoot, 'client')) ||
    inside(resolve(projectRoot, 'server', 'src'))
  )
    throw new Error(
      'UPLOAD_DIR must be a dedicated private directory outside application source and public assets',
    );
  return root;
}
export function localStorage(config: Pick<Config, 'UPLOAD_DIR'>): PrivateStorage {
  const root = storageRoot(config);
  const path = (key: string) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(key))
      throw new AppError(400, 'Invalid storage identifier');
    return resolve(root, key);
  };
  async function ready() {
    await mkdir(root, { recursive: true, mode: 0o700 });
    if ((await lstat(root)).isSymbolicLink())
      throw new Error('Upload storage must not be a symbolic link');
  }
  return {
    async put(key, contents) {
      await ready();
      await writeFile(path(key), contents, { flag: 'wx', mode: 0o600 });
    },
    async get(key) {
      await ready();
      try {
        const info = await lstat(path(key));
        if (!info.isFile() || info.isSymbolicLink() || info.size > 10485760)
          throw new AppError(404, 'Attachment file is unavailable');
        return await readFile(path(key));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT')
          throw new AppError(404, 'Attachment file is unavailable');
        throw e;
      }
    },
    async remove(key) {
      try {
        await unlink(path(key));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
    },
  };
}
