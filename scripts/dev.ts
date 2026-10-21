import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { readConfig } from '../server/src/config/env.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const children: ChildProcess[] = [];
const windows = process.platform === 'win32';
let stopping = false;

try {
  const config = readConfig();
  const database = new URL(config.DATABASE_URL);
  if (
    database.password === 'YOUR_LOCAL_POSTGRES_PASSWORD' ||
    database.password === 'PASSWORD' ||
    database.hostname.includes('YOUR-ENDPOINT')
  ) {
    throw new Error('Replace the DATABASE_URL placeholder in server/.env with your database details.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Invalid server configuration.');
  console.error('Complete server/.env before running npm run dev. See README.md for database setup.');
  process.exit(1);
}

async function stop(code: number) {
  if (stopping) return;
  stopping = true;
  await Promise.all(
    children.map(async (child) => {
      if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
      if (windows) {
        // Stop only this launcher's process trees, including Vite/esbuild and tsx's watcher.
        // Calling the executable directly avoids cmd.exe and its batch termination prompt.
        try {
          await promisify(execFile)(
            join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'),
            ['/PID', String(child.pid), '/T', '/F'],
            { windowsHide: true },
          );
        } catch {
          // Ctrl+C may already have stopped the child before taskkill reaches it.
          if (child.exitCode === null && child.signalCode === null) child.kill();
        }
      } else {
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {
          // The child may have already exited.
        }
      }
    }),
  );
  process.exitCode = code;
}

process.on('SIGINT', () => void stop(0));
process.on('SIGTERM', () => void stop(0));

function start(name: string, entry: string, args: string[]) {
  const child = spawn(process.execPath, [join(root, 'node_modules', entry), ...args], {
    cwd: join(root, name),
    stdio: 'inherit',
    shell: false,
    detached: !windows,
    windowsHide: true,
  });
  children.push(child);
  child.on('error', (error) => {
    console.error(`Could not start ${name}: ${error.message}`);
    void stop(1);
  });
  child.on('exit', (code, signal) => {
    if (stopping) return;
    console.error(`${name} stopped (${signal ?? code ?? 'unknown'}); stopping development servers.`);
    void stop(code ?? 1);
  });
}

start('server', 'tsx/dist/cli.mjs', ['watch', 'src/index.ts']);
start('client', 'vite/bin/vite.js', ['--host', '127.0.0.1']);
