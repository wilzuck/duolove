import { ApiError } from './api';

type T = (key: string) => string;

/** Message utilisateur traduit pour une erreur API : `errors.<CODE>` sinon message générique. */
export function errorMessage(e: unknown, t: T, has: (k: string) => boolean): string {
  if (e instanceof ApiError) {
    const k = `errors.${e.code}`;
    if (has(k)) return t(k);
    if (e.status === 429) return t('errors.RATE_LIMITED');
    if (e.status >= 500) return t('errors.INTERNAL_ERROR');
  }
  return t('errors.GENERIC');
}
