import { ageFromBirthDate, type LiveCriteria } from '@duomatch/types';

/** Données d'un profil nécessaires pour évaluer des critères (aucune requête : fonctions pures, testées). */
export interface Candidate {
  gender: string; birthDate: Date; country: string; intent: string;
  hasChildren: boolean | null; likesPets: boolean | null; living: string | null; heightCm: number | null; originCountry: string | null;
}

export const genderOk = (seeking: string, gender: string) =>
  seeking === 'EVERYONE' || (seeking === 'MEN' && gender === 'MAN') || (seeking === 'WOMEN' && gender === 'WOMAN');

const triOk = (want: 'ANY' | 'YES' | 'NO', has: boolean | null) => want === 'ANY' || (has !== null && (want === 'YES') === has);

/**
 * Les critères s'appliquent strictement : si le membre demande « avec enfants » et que le profil ne renseigne pas
 * l'information, le profil n'est pas proposé (on ne devine jamais une donnée absente).
 */
export function matchesCriteria(c: LiveCriteria, t: Candidate, now = new Date()): boolean {
  if (!genderOk(c.seeking, t.gender)) return false;
  const age = ageFromBirthDate(t.birthDate, now);
  if (age < c.ageMin || age > c.ageMax) return false;
  if (c.country && t.country !== c.country) return false;
  if (!triOk(c.hasChildren, t.hasChildren) || !triOk(c.likesPets, t.likesPets)) return false;
  if (c.living !== 'ANY' && t.living !== c.living) return false;
  if (c.heightMin != null && (t.heightCm == null || t.heightCm < c.heightMin)) return false;
  if (c.heightMax != null && (t.heightCm == null || t.heightCm > c.heightMax)) return false;
  if (c.originCountry && t.originCountry !== c.originCountry) return false;
  if (c.intents?.length && !c.intents.includes(t.intent as never)) return false;
  return true;
}

/** Réciprocité : la personne invitée doit, elle aussi, accepter le genre et l'âge de la personne qui cherche. */
export function acceptsSeeker(pref: { seeking: string; ageMin: number; ageMax: number } | null, seeker: { gender: string; birthDate: Date }, now = new Date()): boolean {
  if (!pref) return false;
  const age = ageFromBirthDate(seeker.birthDate, now);
  return genderOk(pref.seeking, seeker.gender) && age >= pref.ageMin && age <= pref.ageMax;
}
