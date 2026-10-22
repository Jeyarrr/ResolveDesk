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
export function upload<T>(
  path: string,
  body: FormData,
  progress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${apiUrl}${path}`);
    xhr.withCredentials = true;
    xhr.timeout = 90000;
    xhr.setRequestHeader('X-CSRF-Token', csrfToken);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) progress?.(Math.round((e.loaded / e.total) * 100));
    };
    const abort = () => xhr.abort();
    xhr.onloadend = () => signal?.removeEventListener('abort', abort);
    xhr.onerror = () =>
      reject(new Error('Upload connection failed. Retry to confirm whether it was saved.'));
    xhr.ontimeout = () => reject(new Error('Upload timed out. Retry the same submission.'));
    xhr.onabort = () =>
      reject(new Error('Upload cancelled. Retry the same submission to check its result.'));
    xhr.onload = () => {
      let result: { data: T; error?: { message: string } };
      try {
        result = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error('Invalid upload response'));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        if (xhr.status === 401) onUnauthorized();
        reject(new ApiError(xhr.status, result.error?.message ?? 'Upload failed'));
      } else resolve(result.data);
    };
    if (signal?.aborted) {
      reject(new Error('Upload cancelled'));
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    xhr.send(body);
  });
}
export async function downloadAttachment(id: string, filename: string) {
  const response = await fetch(`${apiUrl}/attachments/${id}/download`, {
    credentials: 'include',
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    if (response.status === 401) onUnauthorized();
    const data = (await response.json().catch(() => null)) as {
      error?: { message: string };
    } | null;
    throw new ApiError(response.status, data?.error?.message ?? 'Attachment download failed');
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function queryString(values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  return params.toString();
}
