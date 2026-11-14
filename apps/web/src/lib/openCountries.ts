import { COUNTRIES } from '@duomatch/types';

/**
 * Pays à proposer dans une liste : seulement les pays ouverts, plus la valeur déjà choisie si elle ne l'est plus
 * (un membre inscrit avant la fermeture d'un pays garde son choix au lieu de voir la liste changer toute seule).
 * Tant que la liste des pays ouverts n'est pas chargée, tous les pays connus.
 */
export function openCountries(open: string[] | undefined, keep: (string | null | undefined)[] = []): (typeof COUNTRIES)[number][] {
  if (!open) return [...COUNTRIES];
  const wanted = new Set([...open, ...keep.filter((c): c is string => !!c)]);
  return COUNTRIES.filter((c) => wanted.has(c.code));
}
