import { Injectable } from '@nestjs/common';
import { ageFromBirthDate } from '@duomatch/types';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EntitlementsService } from '../subscriptions/entitlements.service.js';
import { approxDistanceKm, cardInclude, toCard } from '../profiles/card.js';
import { scoreCandidate, type ScoreSubject } from './scoring.js';
import { forbidden } from '../common/errors.js';

const GENDERS_FOR: Record<string, Array<'MAN' | 'WOMAN' | 'NON_BINARY' | 'OTHER'>> = {
  MEN: ['MAN'], WOMEN: ['WOMAN'], EVERYONE: ['MAN', 'WOMAN', 'NON_BINARY', 'OTHER'],
};
// Quelles préférences « cherche » acceptent un profil de tel genre (réciprocité).
const SEEKING_THAT_ACCEPT: Record<string, Array<'MEN' | 'WOMEN' | 'EVERYONE'>> = {
  MAN: ['MEN', 'EVERYONE'], WOMAN: ['WOMEN', 'EVERYONE'], NON_BINARY: ['EVERYONE'], OTHER: ['EVERYONE'],
};

const yearsAgo = (n: number, now = new Date()) => {
  const d = new Date(now);
  d.setUTCFullYear(d.getUTCFullYear() - n);
  return d;
};

const subject = (p: { intent: string; city: string; country: string; languages: string[]; completeness: number; verified: boolean; boostedUntil: Date | null; user: { lastActiveAt: Date; interests: { interest: { slug: string } }[] } }): ScoreSubject => ({
  intent: p.intent, city: p.city, country: p.country, languages: p.languages, completeness: p.completeness, verified: p.verified,
  boostedUntil: p.boostedUntil, lastActiveAt: p.user.lastActiveAt, interests: p.user.interests.map((i) => i.interest.slug),
});

@Injectable()
export class DiscoveryService {
  constructor(private readonly prisma: PrismaService, private readonly ent: EntitlementsService) {}

  private async context(userId: string) {
    const me = await this.prisma.profile.findUnique({
      where: { userId },
      include: { user: { select: { id: true, lastActiveAt: true, preference: true, interests: { select: { interest: { select: { slug: true } } } } } } },
    });
    if (!me || !me.user.preference) throw forbidden('PROFILE_INCOMPLETE');
    const { limits } = await this.ent.get(userId);
    return { me, pref: me.user.preference, limits };
  }

  /** Filtres obligatoires + préférences mutuelles. Les filtres Premium ne s'appliquent que si la formule les inclut. */
  private async where(userId: string): Promise<{ where: Prisma.ProfileWhereInput; ctx: Awaited<ReturnType<DiscoveryService['context']>> }> {
    const ctx = await this.context(userId);
    const { me, pref, limits } = ctx;
    const now = new Date();
    const myAge = ageFromBirthDate(me.birthDate, now);
    const and: Prisma.ProfileWhereInput[] = [
      { visibility: 'VISIBLE', onboardedAt: { not: null }, gender: { in: GENDERS_FOR[pref.seeking]! } },
      { birthDate: { lte: yearsAgo(pref.ageMin, now), gt: yearsAgo(pref.ageMax + 1, now) } },
      { photos: { some: { moderationStatus: { not: 'REJECTED' } } } },
      // Mode discret (VIP) : visible uniquement des personnes qu'il/elle a likées.
      { OR: [{ incognito: false }, { user: { swipesGiven: { some: { targetId: userId, action: { in: ['LIKE', 'SUPER_LIKE'] } } } } }] },
      {
        user: {
          id: { not: userId }, status: 'ACTIVE',
          swipesReceived: { none: { giverId: userId } },
          blocksGiven: { none: { blockedId: userId } },
          blocksReceived: { none: { blockerId: userId } },
          // Réciprocité : l'autre personne doit aussi accepter mon genre et mon âge.
          preference: { is: { seeking: { in: SEEKING_THAT_ACCEPT[me.gender]! }, ageMin: { lte: myAge }, ageMax: { gte: myAge } } },
        },
      },
    ];
    if (pref.country) and.push({ country: pref.country });
    if (pref.city) and.push({ city: { equals: pref.city, mode: 'insensitive' } });
    if (pref.intents.length) and.push({ intent: { in: pref.intents } });
    if (limits.advancedFilters) {
      if (pref.languages.length) and.push({ languages: { hasSome: pref.languages } });
      if (pref.interests.length) and.push({ user: { interests: { some: { interest: { slug: { in: pref.interests } } } } } });
      if (pref.verifiedOnly) and.push({ verified: true });
      if (pref.activeRecently) and.push({ user: { lastActiveAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } } });
    }
    return { where: { AND: and }, ctx };
  }

  async count(userId: string) {
    const { where } = await this.where(userId);
    return { count: await this.prisma.profile.count({ where }) };
  }

  /** Recommandations classées par score ; pagination par décalage dans la liste classée (cursor = offset). */
  async feed(userId: string, limit: number, cursor?: string) {
    const { where, ctx } = await this.where(userId);
    const { me, pref, limits } = ctx;
    const pool = await this.prisma.profile.findMany({
      where, include: cardInclude, take: 200,
      orderBy: [{ boostedUntil: { sort: 'desc', nulls: 'last' } }, { user: { lastActiveAt: 'desc' } }],
    });
    const mySubject = subject(me);
    const scored = pool
      .map((p) => {
        const distance = approxDistanceKm(me, p);
        return { p, distance, ...scoreCandidate(mySubject, subject(p), distance) };
      })
      .filter((x) => !(limits.advancedFilters && pref.maxDistanceKm && x.distance != null && x.distance > pref.maxDistanceKm))
      .sort((a, b) => b.rank - a.rank);

    const start = Math.max(0, parseInt(cursor ?? '0', 10) || 0);
    const page = scored.slice(start, start + limit);
    return {
      items: page.map((x) => toCard(x.p, { viewerInterests: mySubject.interests, distanceKm: x.distance, score: x.compatibility })),
      nextCursor: start + limit < scored.length ? String(start + limit) : null,
      total: scored.length,
    };
  }
}
