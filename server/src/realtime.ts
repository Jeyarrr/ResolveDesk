import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';
import type { Database } from './db/connection.js';
import type { Config } from './config/env.js';
import type { operationEvents } from './db/schema.js';
import { authService } from './services/auth.js';
import { permittedTicket } from './repositories/tickets.js';
import { processEvents } from './services/notifications.js';
import { monitorSla } from './services/sla.js';

export function startOperations(server: HttpServer, db: Database, config: Config) {
  const auth = authService(db, config);
  const io = new Server(server, {
    transports: ['websocket'],
    cors: { origin: config.CLIENT_ORIGIN, credentials: true },
    allowRequest: (req, done) => done(null, req.headers.origin === config.CLIENT_ORIGIN),
    maxHttpBufferSize: 2048,
  });
  const tokens = new Map<string, string>();
  async function identity(socket: Socket) {
    const row = await auth.authenticate(tokens.get(socket.id));
    if (row.user.id !== socket.data.userId || row.user.role !== socket.data.role)
      throw new Error('Session changed');
    return row.user;
  }
  io.use(async (socket, next) => {
    try {
      if (socket.handshake.headers.origin !== config.CLIENT_ORIGIN)
        throw new Error('Origin denied');
      const name = config.NODE_ENV === 'production' ? '__Host-resolvedesk' : 'resolvedesk';
      const token = socket.handshake.headers.cookie
        ?.split(';')
        .map((v) => v.trim())
        .find((v) => v.startsWith(name + '='))
        ?.slice(name.length + 1);
      const row = await auth.authenticate(token);
      const csrf = socket.handshake.auth.csrf;
      if (typeof csrf !== 'string' || !auth.matches(auth.csrf(token!), csrf))
        throw new Error('Invalid token');
      socket.data.userId = row.user.id;
      socket.data.role = row.user.role;
      tokens.set(socket.id, token!);
      next();
    } catch {
      next(new Error('Authentication required'));
    }
  });
  io.on('connection', (socket) => {
    void socket.join('user:' + socket.data.userId);
    let last = 0;
    socket.on('subscribe-ticket', async (raw: unknown, ack: unknown) => {
      if (typeof ack !== 'function') return;
      try {
        if (Date.now() - last < 200) throw new Error('Subscription busy');
        last = Date.now();
        const id = z.uuid().parse(raw);
        const user = await identity(socket);
        await permittedTicket(db, user, id);
        for (const room of socket.rooms) if (room.startsWith('ticket:')) void socket.leave(room);
        await socket.join('ticket:' + id);
        ack({ ok: true });
      } catch {
        ack({ ok: false });
      }
    });
    socket.on('disconnect', () => tokens.delete(socket.id));
  });
  async function broadcast(event: typeof operationEvents.$inferSelect) {
    for (const socket of io.sockets.sockets.values()) {
      try {
        const user = await identity(socket);
        if (!event.audience.includes(user.id)) continue;
        try {
          await permittedTicket(db, user, event.ticketId);
        } catch {
          socket.emit('sync');
          continue;
        }
        if (event.internal && user.role === 'employee') continue;
        socket.emit('operation', { id: event.id, type: event.type, ticketId: event.ticketId });
      } catch {
        socket.disconnect(true);
      }
    }
  }
  let running: Promise<void> | null = null,
    stopped = false,
    lastSla = 0;
  const tick = () => {
    if (running || stopped) return running ?? Promise.resolve();
    running = (async () => {
      try {
        // Revalidate idle connections as well as every subscription and event delivery.
        for (const socket of io.sockets.sockets.values())
          try {
            await identity(socket);
          } catch {
            socket.disconnect(true);
          }
        if (Date.now() - lastSla >= config.SLA_CHECK_INTERVAL_MS) {
          await monitorSla(db);
          lastSla = Date.now();
        }
        await processEvents(db, broadcast);
      } catch {
        console.error('Operations worker unavailable; durable work will retry');
      } finally {
        running = null;
      }
    })();
    return running;
  };
  const timer = setInterval(() => void tick(), config.EVENT_POLL_INTERVAL_MS);
  timer.unref();
  void tick();
  return {
    io,
    tick,
    async stop() {
      stopped = true;
      clearInterval(timer);
      await running;
      await new Promise<void>((resolve) => io.close(() => resolve()));
      tokens.clear();
    },
  };
}
