import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { AppContext } from './context';
import { readStorage, writeStorage } from '../lib/storage';
import { api, ApiError, setCsrf, setUnauthorizedHandler } from '../services/api';
import type { ApiUser } from '../services/contracts';
interface Session {
  user: ApiUser;
  csrfToken: string;
}
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: (n, e) => !(e instanceof ApiError) && n < 1 },
    mutations: { retry: false },
  },
});
function SessionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    readStorage('resolvedesk.theme') === 'light' ? 'light' : 'dark',
  );
  const session = useQuery({
    queryKey: ['session'],
    retry: false,
    queryFn: async ({ signal }) => {
      try {
        const data = await api<Session>('/auth/me', { signal });
        setCsrf(data.csrfToken);
        return data;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          setCsrf('');
          client.removeQueries({ queryKey: ['protected'] });
          return null;
        }
        throw error;
      }
    },
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    writeStorage('resolvedesk.theme', theme);
  }, [theme]);
  useEffect(() => {
    const expire = () => {
      setCsrf('');
      void client.cancelQueries({ queryKey: ['protected'] });
      client.removeQueries({ queryKey: ['protected'] });
      client.setQueryData(['session'], null);
    };
    setUnauthorizedHandler(expire);
    return () => setUnauthorizedHandler(() => {});
  }, [client]);
  const login = async (email: string, password: string, remember: boolean) => {
    const preauth = await api<{ csrfToken: string }>('/auth/csrf');
    setCsrf(preauth.csrfToken);
    const result = await api<Session>('/auth/login', {
      method: 'POST',
      body: { email, password, remember },
    });
    await client.cancelQueries();
    client.removeQueries({ queryKey: ['protected'] });
    setCsrf(result.csrfToken);
    client.setQueryData(['session'], result);
  };
  const logout = async () => {
    await api('/auth/logout', { method: 'POST', body: {} });
    await client.cancelQueries();
    client.removeQueries({ queryKey: ['protected'] });
    setCsrf('');
    client.setQueryData(['session'], null);
  };
  return (
    <AppContext.Provider
      value={{
        user: session.data?.user ?? null,
        isLoading: session.isPending,
        authError: session.error,
        retryAuth: () => void session.refetch(),
        theme,
        setTheme,
        login,
        logout,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <Tooltip.Provider delayDuration={150}>
          <SessionProvider>{children}</SessionProvider>
        </Tooltip.Provider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
