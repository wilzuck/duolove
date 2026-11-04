import type { Intent } from '@duomatch/types';

export interface ScoreSubject {
  intent: Intent | string;
  interests: string[];
  languages: string[];
  city: string;
  country: string;
  lastActiveAt: Date;
  completeness: number;
  verified: boolean;
  boostedUntil: Date | null;
}

/**
 * Compatibilité d'intention (0–25). Documenté dans docs/PRD.md.
 * Seuls des critères choisis par l'utilisateur interviennent : aucun classement fondé sur l'origine,
 * la couleur de peau, la religion ou toute autre caractéristique protégée.
 */
export function intentScore(a: string, b: string): number {
  if (a === b) return 25;
  const pair = new Set([a, b]);
  if (pair.has('SERIOUS') && pair.has('MARRIAGE')) return 20;
  if (pair.has('UNSURE')) return 12;
  if (pair.has('DATING') && (pair.has('SERIOUS') || pair.has('MARRIAGE'))) return 10;
  if (pair.has('DATING') && pair.has('FRIENDSHIP')) return 8;
  return 0;
}

export interface ScoreResult {
  /** 0–100, affiché à l'utilisateur. */
  compatibility: number;
  /** compatibilité + bonus de boost : sert uniquement à l'ordre. */
  rank: number;
  breakdown: Record<string, number>;
}

const MAX_RAW = 25 + 25 + 10 + 20 + 10 + 10 + 5 + 5;

export function scoreCandidate(viewer: ScoreSubject, cand: ScoreSubject, distanceKm: number | null, now = new Date()): ScoreResult {
  const mine = new Set(viewer.interests);
  const shared = cand.interests.filter((i) => mine.has(i)).length;
  const sharedLang = cand.languages.some((l) => viewer.languages.includes(l));
  const ageDays = (now.getTime() - cand.lastActiveAt.getTime()) / 86_400_000;

  const breakdown: Record<string, number> = {
    intent: intentScore(viewer.intent as string, cand.intent as string),
    interests: Math.min(shared, 5) * 5,
    languages: sharedLang ? 10 : 0,
    location: cand.city.toLowerCase() === viewer.city.toLowerCase() ? 20 : cand.country === viewer.country ? 10 : 0,
    distance: distanceKm == null ? 0 : Math.max(0, 10 - Math.floor(distanceKm / 25)),
    activity: ageDays <= 1 ? 10 : ageDays <= 7 ? 5 : ageDays <= 30 ? 2 : 0,
    completeness: Math.round((cand.completeness / 100) * 5),
    verified: cand.verified ? 5 : 0,
  };
  const raw = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const compatibility = Math.min(100, Math.round((raw / MAX_RAW) * 100));
  const boost = cand.boostedUntil && cand.boostedUntil > now ? 20 : 0;
  return { compatibility, rank: compatibility + boost, breakdown };
}
