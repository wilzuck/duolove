/** Envoie une erreur du site au suivi (Admin › Erreurs système). Jamais bloquant, jamais de données de formulaire :
 *  type, message, page (sans paramètres) et trace. Au plus 10 envois par page chargée, sans doublon. */
const sent = new Set<string>();

/** « Script error. » sans objet d'erreur : erreur levée par un script d'un autre domaine (Google, KKiaPay, GTM…). Le navigateur en masque
 *  le message, le fichier et la trace : rien d'exploitable, et ce n'est pas notre code. On ne la remonte pas. */
export const isOpaqueScriptError = (ev: { message?: string; error?: unknown }) => !ev.error && /^script error\.?$/i.test((ev.message ?? '').trim());

export function reportError(error: unknown, extra?: { digest?: string }) {
  if (typeof window === 'undefined' || sent.size >= 10) return;
  const e = error as { name?: string; message?: string; stack?: string } | null;
  const message = (e?.message || String(error) || 'Erreur inconnue').slice(0, 2000);
  const key = `${e?.name}|${message}`;
  if (sent.has(key)) return;
  sent.add(key);
  try {
    void fetch('/api/errors/report', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ source: 'web', kind: (e?.name || 'Error').slice(0, 120), message, path: window.location.pathname, stack: e?.stack?.slice(0, 20000), digest: extra?.digest }),
    }).catch(() => undefined);
  } catch { /* le suivi ne doit jamais casser la page */ }
}
