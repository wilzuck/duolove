/** Envoie une erreur du site au suivi (Admin › Erreurs système). Jamais bloquant, jamais de données de formulaire :
 *  type, message, page (sans paramètres) et trace. Au plus 10 envois par page chargée, sans doublon. */
const sent = new Set<string>();

/** « Script error. » sans objet d'erreur : erreur levée par un script d'un autre domaine (Google, KKiaPay, GTM…). Le navigateur en masque
 *  le message, le fichier et la trace : rien d'exploitable, et ce n'est pas notre code. On ne la remonte pas. */
export const isOpaqueScriptError = (ev: { message?: string; error?: unknown }) => !ev.error && /^script error\.?$/i.test((ev.message ?? '').trim());

/** Erreur dont toute la trace est dans un script INJECTÉ par l'application qui affiche la page, pas dans le site : navigateur intégré de
 *  Facebook ou Instagram (`iabjs://`, ex. « Error invoking postMessage: Java object is gone » en quittant la page), extensions du
 *  navigateur (`chrome-extension://`…). Rien à corriger chez nous : on ne la remonte pas. Une trace sans emplacement est gardée. */
export function isInjectedScriptError(error: unknown): boolean {
  const stack = (error as { stack?: unknown } | null)?.stack;
  if (typeof stack !== 'string') return false;
  const schemes = [...stack.matchAll(/\b([a-z][a-z0-9+.-]*):\/\//gi)].map((m) => m[1]!.toLowerCase());
  return schemes.length > 0 && schemes.every((sc) => sc !== 'http' && sc !== 'https' && sc !== 'webpack' && sc !== 'file');
}

export function reportError(error: unknown, extra?: { digest?: string }) {
  if (typeof window === 'undefined' || sent.size >= 10 || isInjectedScriptError(error)) return;
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
