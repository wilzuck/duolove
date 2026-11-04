import { ageFromBirthDate } from '@duomatch/types';
import type { Prisma } from '../generated/prisma/client.js';
import { photoUrl, thumbKey } from './profiles.service.js';

export const cardInclude = {
  photos: { where: { moderationStatus: { not: 'REJECTED' } }, orderBy: { position: 'asc' } },
  user: { select: { id: true, lastActiveAt: true, interests: { select: { interest: { select: { slug: true } } } } } },
} satisfies Prisma.ProfileInclude;

export type CardProfile = Prisma.ProfileGetPayload<{ include: typeof cardInclude }>;

/** Distance arrondie à 5 km : on n'expose jamais de position précise. */
export function approxDistanceKm(a: { approxLat: number | null; approxLng: number | null }, b: { approxLat: number | null; approxLng: number | null }): number | null {
  if (a.approxLat == null || a.approxLng == null || b.approxLat == null || b.approxLng == null) return null;
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.approxLat - a.approxLat);
  const dLng = rad(b.approxLng - a.approxLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.approxLat)) * Math.cos(rad(b.approxLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round((2 * R * Math.asin(Math.sqrt(h))) / 5) * 5;
}

export function toCard(p: CardProfile, opts: { viewerInterests?: string[]; distanceKm?: number | null; score?: number } = {}) {
  const interests = p.user.interests.map((i) => i.interest.slug);
  const mine = new Set(opts.viewerInterests ?? []);
  return {
    id: p.userId,
    displayName: p.displayName,
    age: ageFromBirthDate(p.birthDate),
    city: p.city,
    country: p.country,
    bio: p.bio,
    occupation: p.occupation,
    intent: p.intent,
    verified: p.verified,
    languages: p.languages,
    hasChildren: p.hasChildren,
    likesPets: p.likesPets,
    living: p.living,
    heightCm: p.heightCm,
    originCountry: p.originCountry,
    interests,
    commonInterests: interests.filter((i) => mine.has(i)),
    distanceKm: opts.distanceKm ?? null,
    compatibility: opts.score ?? null,
    photos: p.photos.map((x) => ({ id: x.id, url: photoUrl(x.key), thumbUrl: photoUrl(thumbKey(x.key)) })),
  };
}
