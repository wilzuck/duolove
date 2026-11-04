import type { Intent } from '@duomatch/types';

export interface CompletenessInput {
  bio: string;
  occupation: string | null;
  interestCount: number;
  photoCount: number;
  intent: Intent | string;
}

/** Score 0–100 documenté dans docs/PRD.md : encourage une description, des photos et des centres d'intérêt. */
export function computeCompleteness(i: CompletenessInput): number {
  let s = 30; // identité de base (obligatoire à l'inscription)
  if (i.bio.trim().length >= 40) s += 15;
  if (i.occupation) s += 5;
  if (i.interestCount >= 3) s += 15;
  if (i.photoCount >= 1) s += 20;
  if (i.photoCount >= 3) s += 10;
  if (i.intent !== 'UNSURE') s += 5;
  return Math.min(100, s);
}

export function completenessLevel(score: number): 'INCOMPLETE' | 'IN_PROGRESS' | 'COMPLETE' {
  return score < 50 ? 'INCOMPLETE' : score < 80 ? 'IN_PROGRESS' : 'COMPLETE';
}
