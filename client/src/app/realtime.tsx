import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import type { ApiUser } from '../services/contracts';
import { api, getRuntime } from '../services/api';
export function RealtimeConnection({
  session,
}: {
  session: { user: ApiUser; csrfToken: string } | null | undefined;
}) {
  const client = useQueryClient(),
    [offline, setOffline] = useState(false);
  const id = session?.user.id,
    role = session?.user.role,
    csrf = session?.csrfToken;
  useEffect(() => {
    if (!id || !csrf) return;
    let disposed = false;
    let stop = () => {};
    let startup: ReturnType<typeof setTimeout> | undefined;
    const abort = new AbortController();
    const start = async () => {
      try {
        const runtime = await getRuntime();
        if (disposed) return;
        if (runtime.realtime === 'polling') {
          let timer: ReturnType<typeof setTimeout> | undefined;
          let busy = false;
          const poll = async () => {
            if (disposed || busy) return;
            clearTimeout(timer);
            busy = true;
            try {
              if (document.visibilityState !== 'hidden') {
                await api('/events/sync', {
                  signal: AbortSignal.any([abort.signal, AbortSignal.timeout(55000)]),
                });
                if (disposed) return;
                setOffline(false);
                await Promise.all([
                  client.invalidateQueries({ queryKey: ['protected'] }),
                  client.invalidateQueries({ queryKey: ['session'] }),
                ]);
              }
            } catch {
              if (!disposed) setOffline(true);
            } finally {
              busy = false;
              if (!disposed) timer = setTimeout(() => void poll(), 5000);
            }
          };
          const visible = () => {
            if (document.visibilityState === 'visible') void poll();
          };
          document.addEventListener('visibilitychange', visible);
          stop = () => {
            clearTimeout(timer);
            document.removeEventListener('visibilitychange', visible);
          };
          void poll();
          return;
        }
        const base = import.meta.env.VITE_API_URL
          ? new URL(import.meta.env.VITE_API_URL, location.origin).origin
          : location.origin;
        const socket = io(base, {
          // Browser WebSocket handshakes include Origin; same-origin polling GETs may omit it.
          transports: ['websocket'],
          withCredentials: true,
          auth: { csrf },
          reconnectionDelay: 1000,
          reconnectionDelayMax: 10000,
        });
        let timer: ReturnType<typeof setTimeout> | undefined;
        let reconnect: ReturnType<typeof setTimeout> | undefined;
        const retry = () => {
          clearTimeout(reconnect);
          reconnect = setTimeout(() => socket.connect(), 3000);
        };
        const seen = new Set<string>();
        const refresh = () => {
          if (timer) return;
          timer = setTimeout(() => {
            timer = undefined;
            void client.invalidateQueries({ queryKey: ['protected'] });
          }, 150);
        };
        socket.on('connect', () => {
          clearTimeout(reconnect);
          setOffline(false);
          refresh();
        });
        socket.on('operation', (event: { id?: unknown }) => {
          if (typeof event.id !== 'string' || seen.has(event.id)) return;
          seen.add(event.id);
          if (seen.size > 500) seen.clear();
          refresh();
        });
        socket.on('sync', () => {
          void client.resetQueries({ queryKey: ['protected'] });
        });
        socket.on('disconnect', (reason) => {
          setOffline(true);
          if (reason === 'io server disconnect') {
            client.removeQueries({ queryKey: ['protected'] });
            void client.invalidateQueries({ queryKey: ['session'] });
            retry();
          }
        });
        socket.on('connect_error', () => {
          setOffline(true);
          void client.invalidateQueries({ queryKey: ['session'] });
          retry();
        });
        stop = () => {
          clearTimeout(timer);
          clearTimeout(reconnect);
          socket.removeAllListeners();
          socket.disconnect();
        };
      } catch {
        if (!disposed) {
          setOffline(true);
          startup = setTimeout(() => void start(), 3000);
        }
      }
    };
    void start();
    return () => {
      disposed = true;
      abort.abort();
      clearTimeout(startup);
      stop();
    };
  }, [id, role, csrf, client]);
  return id && offline ? (
    <div
      role="status"
      className="fixed bottom-3 right-3 z-50 max-w-[calc(100%-1.5rem)] rounded-lg border border-border bg-card p-3 text-xs"
    >
      Live updates unavailable. Reconnecting; refresh still works.
    </div>
  ) : null;
}
