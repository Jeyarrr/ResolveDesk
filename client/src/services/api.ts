const apiUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
let csrfToken = '';
let onUnauthorized = () => {};
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const setCsrf = (value: string) => {
  csrfToken = value;
};
export const setUnauthorizedHandler = (handler: () => void) => {
  onUnauthorized = handler;
};
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers:
      options.body !== undefined
        ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }
        : {},
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal ?? AbortSignal.timeout(15000),
  });
  const result = (await response.json().catch(() => null)) as {
    data: T;
    error?: { message: string };
  } | null;
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) onUnauthorized();
    throw new ApiError(
      response.status,
      result?.error?.message ?? 'The server could not complete this request',
    );
  }
  if (!result) throw new Error('Invalid API response. Check the API URL.');
  return result.data;
}
export const getHealth = async () => ({
  data: await api<{ status: string; service: string }>('/health'),
});
export function queryString(values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  return params.toString();
}
