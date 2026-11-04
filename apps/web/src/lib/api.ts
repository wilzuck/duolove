/** Client HTTP : même origine (/api → réécrit vers le backend), cookie de session httpOnly. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

interface Opts { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal }

export async function api<T>(path: string, { method = 'GET', body, form, signal }: Opts = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method, signal, credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiError(res.status, e?.code ?? 'ERROR', e?.message ?? res.statusText, e?.details);
  }
  return data as T;
}

export const post = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body ?? {} });
export const put = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body: body ?? {} });
export const patch = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body: body ?? {} });
export const del = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'DELETE', body });
export const upload = <T,>(path: string, file: Blob, name = 'photo.jpg') => {
  const form = new FormData();
  form.append('file', file, name);
  return api<T>(path, { method: 'POST', form });
};
