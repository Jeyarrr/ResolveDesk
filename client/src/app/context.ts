import { createContext, useContext } from 'react';
import type { User } from '../types/domain';
interface AppContextValue {
  user: User | null;
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  login: (email: string, password: string, remember: boolean) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
  authError: Error | null;
  retryAuth: () => void;
}
export const AppContext = createContext<AppContextValue | null>(null);
export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('AppProvider is required.');
  return context;
}
