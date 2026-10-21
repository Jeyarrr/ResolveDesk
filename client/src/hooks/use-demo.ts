import { useSyncExternalStore } from 'react';
import { demoStore } from '../services/demo-store';
export function useDemo() {
  return useSyncExternalStore(demoStore.subscribe, demoStore.getSnapshot);
}
