/** Signes du zodiaque : même découpage que le serveur (`backend/app/core/lifestyle.py`). `︎` impose le glyphe texte (jamais l'emoji coloré d'iOS). */
export const ZODIAC: Record<string, { glyph: string; start: [number, number]; end: [number, number] }> = {
  capricorn: { glyph: '♑︎', start: [12, 22], end: [1, 19] }, aquarius: { glyph: '♒︎', start: [1, 20], end: [2, 18] }, pisces: { glyph: '♓︎', start: [2, 19], end: [3, 20] },
  aries: { glyph: '♈︎', start: [3, 21], end: [4, 19] }, taurus: { glyph: '♉︎', start: [4, 20], end: [5, 20] }, gemini: { glyph: '♊︎', start: [5, 21], end: [6, 20] },
  cancer: { glyph: '♋︎', start: [6, 21], end: [7, 22] }, leo: { glyph: '♌︎', start: [7, 23], end: [8, 22] }, virgo: { glyph: '♍︎', start: [8, 23], end: [9, 22] },
  libra: { glyph: '♎︎', start: [9, 23], end: [10, 22] }, scorpio: { glyph: '♏︎', start: [10, 23], end: [11, 21] }, sagittarius: { glyph: '♐︎', start: [11, 22], end: [12, 21] },
};
/** « 22 nov. – 21 déc. » dans la langue de la page. */
export function zodiacRange(sign: string, locale: string): string | null {
  const z = ZODIAC[sign];
  if (!z) return null;
  const f = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const d = ([m, day]: [number, number]) => f.format(new Date(Date.UTC(2001, m - 1, day)));
  return `${d(z.start)} – ${d(z.end)}`;
}
