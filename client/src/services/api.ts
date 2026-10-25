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
export type RuntimeSettings = { realtime: 'polling' | 'websocket'; directUpload: boolean };
export const getRuntime = () => api<RuntimeSettings>('/runtime');

async function directUpload<T>(
  path: string,
  body: FormData,
  progress?: (percent: number) => void,
  signal?: AbortSignal,
) {
  const match = /^\/tickets(?:\/([0-9a-f-]+)\/(comments|attachments))?$/.exec(path);
  if (!match) throw new Error('Unsupported upload destination');
  const files = body.getAll('files').filter((f): f is File => f instanceof File);
  const fields: Record<string, unknown> = {};
  for (const [key, value] of body.entries()) {
    if (key !== 'files') fields[key] = key === 'isInternal' ? value === 'true' : value;
  }
  const types: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    pdf: 'application/pdf',
    txt: 'text/plain',
  };
  if (files.length) {
    const { put } = await import('@vercel/blob/client');
    const grants = await api<{ pathname: string; receipt: string; token: string }[]>(
      '/uploads/prepare',
      {
        method: 'POST',
        signal,
        body: {
          kind: !match[1] ? 'ticket' : match[2] === 'comments' ? 'comment' : 'attachment',
          ticketId: match[1],
          submissionId: fields.submissionId,
          files: files.map((file) => ({
            name: file.name,
            size: file.size,
            mime: types[file.name.split('.').pop()!.toLowerCase()] ?? file.type,
          })),
        },
      },
    );
    const total = files.reduce((n, file) => n + file.size, 0);
    let completed = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!,
        grant = grants[i]!;
      await put(grant.pathname, file, {
        access: 'private',
        token: grant.token,
        contentType: types[file.name.split('.').pop()!.toLowerCase()] ?? file.type,
        abortSignal: signal,
        onUploadProgress: ({ loaded }) =>
          progress?.(Math.min(95, Math.round(((completed + loaded) / total) * 95))),
      });
      completed += file.size;
    }
    fields.stagedUploads = grants.map((g) => g.receipt);
  }
  // Finalization validates content server-side and retains the existing submission idempotency key.
  const result = await api<T>(path, {
    method: 'POST',
    body: fields,
    signal: signal ?? AbortSignal.timeout(60000),
  });
  progress?.(100);
  return result;
}

export async function upload<T>(
  path: string,
  body: FormData,
  progress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  if ((await getRuntime()).directUpload) return directUpload<T>(path, body, progress, signal);
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
  const chunks: Blob[] = [];
  let total = 0,
    received = 0;
  for (let chunk = 0; chunk < 5; chunk++) {
    const response = await fetch(`${apiUrl}/attachments/${id}/download?chunk=${chunk}`, {
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
    const part = await response.blob();
    total = Number(response.headers.get('X-Attachment-Bytes')) || part.size;
    received += part.size;
    chunks.push(part);
    if (received >= total) break;
  }
  if (received !== total) throw new Error('Attachment download was incomplete');
  const url = URL.createObjectURL(new Blob(chunks, { type: chunks[0]?.type }));
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

export async function downloadReport(query: string, filename: string) {
  const response = await fetch(apiUrl + '/reports/export?' + query, {
    credentials: 'include',
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    if (response.status === 401) onUnauthorized();
    throw new ApiError(response.status, data?.error?.message ?? 'Report export failed');
  }
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
