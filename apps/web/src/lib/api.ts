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
    // Accès payant : le serveur refuse tout sauf le profil et le paiement ; on ramène le membre sur la page d'abonnement (repli si son état était périmé).
    if (res.status === 402 && e?.code === 'ACCESS_PAYWALL' && typeof window !== 'undefined' && !/\/access$/.test(window.location.pathname)) window.location.assign(window.location.pathname.startsWith('/en') ? '/en/access' : '/access');
    throw new ApiError(res.status, e?.code ?? 'ERROR', e?.message ?? res.statusText, e?.details);
  }
  return data as T;
}

export const post = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body ?? {} });
export const put = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body: body ?? {} });
export const patch = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body: body ?? {} });
export const del = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'DELETE', body });
/** Envoi de fichier. Délai maximum (60 s par défaut) : un réseau qui bloque ne laisse jamais un chargement infini ; `signal` permet d'interrompre l'envoi à la demande de l'utilisateur. */
export async function upload<T>(path: string, file: Blob, name = 'photo.jpg', { signal, timeoutMs = 60_000 }: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T> {
  const form = new FormData();
  form.append('file', file, name);
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    return await api<T>(path, { method: 'POST', form, signal: ctrl.signal });
  } catch (e) {
    if (timedOut) throw new ApiError(408, 'UPLOAD_TIMEOUT', 'Upload timeout');
    throw e; // annulation volontaire : AbortError, à ignorer silencieusement par l'appelant
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Vrai si l'erreur vient d'une interruption voulue par l'utilisateur (pas d'alerte à afficher). */
export const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';
