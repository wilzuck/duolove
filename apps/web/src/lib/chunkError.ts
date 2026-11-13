/** Erreur de chargement de code après un nouveau déploiement : l'onglet ouvert réclame un fichier qui n'existe plus. Un rechargement suffit. */
export function isChunkError(error: unknown): boolean {
  const e = error as { name?: string; message?: string } | null;
  const msg = e?.message ?? '';
  return e?.name === 'ChunkLoadError' || /Loading (CSS )?chunk|dynamically imported module|Importing a module script failed|Failed to load chunk|module script/i.test(msg);
}

const KEY = 'crushduo.chunkReloadAt';

/** Recharge la page une seule fois par minute (évite une boucle si l'erreur persiste). Renvoie true si un rechargement est lancé. */
export function reloadOnceForChunkError(error: unknown): boolean {
  if (typeof window === 'undefined' || !isChunkError(error)) return false;
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch { /* stockage indisponible : on recharge quand même une fois */ }
  window.location.reload();
  return true;
}
