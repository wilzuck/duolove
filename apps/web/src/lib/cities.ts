export const MAX_CITIES = 10;
const fold = (s: string) => s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().replace(/[-']/g, ' ').trim();

/** Ajoute une ville à la liste : espaces retirés, doublons (sans accents ni casse) ignorés, au plus `MAX_CITIES`. */
export function addCity(list: string[], raw: string): string[] {
  const city = raw.split(/\s+/).filter(Boolean).join(' ');
  if (city.length < 2 || list.length >= MAX_CITIES || list.some((c) => fold(c) === fold(city))) return list;
  return [...list, city];
}
