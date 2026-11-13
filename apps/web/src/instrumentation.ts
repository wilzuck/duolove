/** Erreurs du rendu serveur du site (pages, actions) : remontées au suivi de l'API (Admin › Erreurs système). Jamais bloquant. */
export function register() {}

export async function onRequestError(error: unknown, request: { path: string; method: string }) {
  const e = error as { name?: string; message?: string; stack?: string; digest?: string } | null;
  const api = (process.env.API_URL ?? 'http://localhost:4000').trim();
  try {
    await fetch(`${api}/api/errors/report`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'web-server', kind: (e?.name || 'Error').slice(0, 120), message: (e?.message || 'Erreur serveur').slice(0, 2000),
        path: request.path, stack: e?.stack?.slice(0, 20000), digest: e?.digest }),
      signal: AbortSignal.timeout(3000),
    });
  } catch { /* API injoignable : rien à faire */ }
}
