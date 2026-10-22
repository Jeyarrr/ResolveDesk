import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, upload, ApiError } from '../services/api';
export function useApi<T>(path: string, enabled = true, preservePage = false) {
  return useQuery({
    queryKey: ['protected', path],
    queryFn: ({ signal }) => api<T>(path, { signal }),
    enabled,
    placeholderData: preservePage ? keepPreviousData : undefined,
  });
}
export function useApiMutation<T = unknown>() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      path,
      body,
      method = 'POST',
      onProgress,
      signal,
    }: {
      path: string;
      body: unknown;
      method?: string;
      onProgress?: (percent: number) => void;
      signal?: AbortSignal;
    }) =>
      body instanceof FormData
        ? upload<T>(path, body, onProgress, signal)
        : api<T>(path, { method, body, signal }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['protected'] });
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 409)
        await client.invalidateQueries({ queryKey: ['protected'] });
    },
  });
}
