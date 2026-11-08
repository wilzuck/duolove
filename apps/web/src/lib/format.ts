export const formatXof = (n: number, locale: string) =>
  new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'fr-FR', { maximumFractionDigits: 0 }).format(n) + ' FCFA';

export const formatDate = (iso: string | Date, locale: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }) =>
  new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', opts).format(new Date(iso));

export const formatTime = (iso: string | Date, locale: string) =>
  new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/** « 12 min », « 3 h », « hier »… via Intl.RelativeTimeFormat. */
export function timeAgo(iso: string | Date, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale === 'en' ? 'en' : 'fr', { numeric: 'auto' });
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

/** Taille en mètres, plus parlante partout que des centimètres : 165 → « 1,65 m » (fr) / « 1.65 m » (en). */
export const formatHeight = (cm: number, locale: string) =>
  `${new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cm / 100)} m`;
