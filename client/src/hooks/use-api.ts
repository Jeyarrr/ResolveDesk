import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
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
    }: {
      path: string;
      body: unknown;
      method?: string;
    }) => api<T>(path, { method, body }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['protected'] });
    },
  });
}
