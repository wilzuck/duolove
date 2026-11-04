import { Injectable } from '@nestjs/common';
import type { SwipeInput } from '@duomatch/types';
import { PrismaService } from '../prisma/prisma.service.js';
import { EntitlementsService } from '../subscriptions/entitlements.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RealtimeGateway } from '../chat/realtime.gateway.js';
import { cardInclude, toCard } from '../profiles/card.js';
import { AppError, forbidden, notFound } from '../common/errors.js';
import { CreditsService } from '../subscriptions/credits.service.js';

const startOfDayUtc = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};
/** Début de semaine ISO (lundi 00:00 UTC) : les Super Likes inclus se comptent par semaine. */
const startOfWeekUtc = () => {
  const d = startOfDayUtc();
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
};
export const orderPair = (a: string, b: string) => (a < b ? ([a, b] as const) : ([b, a] as const));

@Injectable()
export class SwipesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ent: EntitlementsService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly credits: CreditsService,
  ) {}

  async usage(userId: string) {
    const since = startOfDayUtc();
    const [likes, superLikesWeek] = await Promise.all([
      this.prisma.swipe.count({ where: { giverId: userId, action: 'LIKE', createdAt: { gte: since } } }),
      this.prisma.swipe.count({ where: { giverId: userId, action: 'SUPER_LIKE', createdAt: { gte: startOfWeekUtc() } } }),
    ]);
    return { likes, superLikesWeek };
  }

  /**
   * Décision (like / passer / super like). Idempotent : rejouer la même requête ne crée ni doublon ni second match.
   * La paire est verrouillée (advisory lock) pour que deux likes simultanés A→B et B→A produisent exactement un match.
   */
  async swipe(userId: string, input: SwipeInput) {
    const { targetId, action } = input;
    if (targetId === userId) throw new AppError(400, 'INVALID_TARGET');

    const target = await this.prisma.profile.findFirst({
      where: { userId: targetId, onboardedAt: { not: null }, user: { status: 'ACTIVE', blocksGiven: { none: { blockedId: userId } }, blocksReceived: { none: { blockerId: userId } } } },
      select: { userId: true },
    });
    if (!target) throw notFound('PROFILE_NOT_FOUND');

    const existing = await this.prisma.swipe.findUnique({ where: { giverId_targetId: { giverId: userId, targetId } } });
    const ent = await this.ent.get(userId);
    if (!existing) await this.assertQuota(userId, action);

    const [a, b] = orderPair(userId, targetId);
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${a}:${b}`}, 0))`;
      const prior = await tx.swipe.findUnique({ where: { giverId_targetId: { giverId: userId, targetId } } });
      const swipe = prior ?? (await tx.swipe.create({ data: { giverId: userId, targetId, action } }));
      // Super Like au-delà du quota hebdomadaire inclus : un crédit acheté est consommé DANS cette transaction
      // (si la suite échoue, le crédit n'est pas débité ; un rejeu ne le débite pas deux fois).
      if (!prior && action === 'SUPER_LIKE') {
        const usedThisWeek = await tx.swipe.count({ where: { giverId: userId, action: 'SUPER_LIKE', createdAt: { gte: startOfWeekUtc() }, id: { not: swipe.id } } });
        if (usedThisWeek >= ent.limits.superLikesWeekly) await this.credits.consume(tx, userId, 'SUPER_LIKE', 1, swipe.id);
      }
      let match = null;
      if (swipe.action !== 'PASS') {
        const reverse = await tx.swipe.findUnique({ where: { giverId_targetId: { giverId: targetId, targetId: userId } } });
        if (reverse && reverse.action !== 'PASS') {
          match = await tx.match.upsert({
            where: { userAId_userBId: { userAId: a, userBId: b } },
            create: { userAId: a, userBId: b, conversation: { create: {} } },
            update: {},
            include: { conversation: true },
          });
        }
      }
      return { swipe, match, created: !prior };
    });

    // Effets de bord uniquement à la première prise en compte (idempotence).
    if (result.created && action !== 'PASS') {
      if (result.match) {
        const matchData = { matchId: result.match.id, conversationId: result.match.conversation!.id };
        await Promise.all([
          this.notifications.create(userId, 'MATCH', { ...matchData, userId: targetId }),
          this.notifications.create(targetId, 'MATCH', { ...matchData, userId }),
        ]);
        this.realtime.emitToUser(userId, 'match:new', { ...matchData, userId: targetId });
        this.realtime.emitToUser(targetId, 'match:new', { ...matchData, userId });
      } else {
        await this.notifications.create(targetId, 'LIKE', { fromUserId: userId, superLike: action === 'SUPER_LIKE' });
      }
    }

    let matchedProfile = null;
    if (result.match) {
      const p = await this.prisma.profile.findUnique({ where: { userId: targetId }, include: cardInclude });
      matchedProfile = p ? toCard(p) : null;
    }
    return {
      action: result.swipe.action,
      matched: !!result.match,
      match: result.match ? { id: result.match.id, conversationId: result.match.conversation!.id, user: matchedProfile } : null,
    };
  }

  private async assertQuota(userId: string, action: SwipeInput['action']) {
    if (action === 'PASS') return;
    const { limits } = await this.ent.get(userId);
    const used = await this.usage(userId);
    if (action === 'SUPER_LIKE') {
      if (used.superLikesWeek >= limits.superLikesWeekly && (await this.credits.balances(userId)).SUPER_LIKE < 1) {
        throw forbidden('NO_SUPER_LIKES', 'Plus de Super Likes : achetez un pack ou passez Premium');
      }
    } else if (used.likes >= limits.dailyLikes) {
      throw forbidden('DAILY_LIMIT', 'Limite quotidienne de likes atteinte');
    }
  }

  /** Premium : annule le dernier « passer » (moins de 24 h) et renvoie le profil. */
  async rewind(userId: string) {
    const { limits } = await this.ent.get(userId);
    if (!limits.rewind) throw forbidden('PLAN_REQUIRED', 'Retour arrière réservé à Premium');
    const last = await this.prisma.swipe.findFirst({ where: { giverId: userId }, orderBy: { createdAt: 'desc' } });
    if (!last || last.action !== 'PASS' || Date.now() - last.createdAt.getTime() > 86_400_000) {
      throw new AppError(409, 'NOTHING_TO_REWIND', 'Aucune décision à annuler');
    }
    await this.prisma.swipe.delete({ where: { id: last.id } });
    const p = await this.prisma.profile.findFirst({
      where: { userId: last.targetId, user: { status: 'ACTIVE', blocksGiven: { none: { blockedId: userId } }, blocksReceived: { none: { blockerId: userId } } } },
      include: cardInclude,
    });
    return { profile: p ? toCard(p) : null };
  }

  /** Personnes que J'AI likées (likes envoyés), avec l'état du match. */
  async sent(userId: string, cursor?: string, limit = 20) {
    const rows = await this.prisma.swipe.findMany({
      where: { giverId: userId, action: { in: ['LIKE', 'SUPER_LIKE'] }, target: { status: 'ACTIVE', blocksGiven: { none: { blockedId: userId } }, blocksReceived: { none: { blockerId: userId } } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    const ids = page.map((r) => r.targetId);
    const [profiles, matches] = await Promise.all([
      this.prisma.profile.findMany({ where: { userId: { in: ids } }, include: cardInclude }),
      this.prisma.match.findMany({ where: { status: 'ACTIVE', OR: [{ userAId: userId, userBId: { in: ids } }, { userBId: userId, userAId: { in: ids } }] }, include: { conversation: { select: { id: true } } } }),
    ]);
    const byId = new Map(profiles.map((p) => [p.userId, p]));
    const matchOf = new Map(matches.map((m) => [m.userAId === userId ? m.userBId : m.userAId, m.conversation?.id ?? null]));
    return {
      items: page.flatMap((r) => { const p = byId.get(r.targetId); return p ? [{ ...toCard(p), superLike: r.action === 'SUPER_LIKE', likedAt: r.createdAt, matched: matchOf.has(r.targetId), conversationId: matchOf.get(r.targetId) ?? null }] : []; }),
      nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
    };
  }

  /** Personnes qui m'ont liké. Gratuit : compteur seulement (les Super Likes restent visibles). Premium : liste complète. */
  async received(userId: string, cursor?: string, limit = 20) {
    const { limits } = await this.ent.get(userId);
    const base = {
      targetId: userId, action: { in: ['LIKE', 'SUPER_LIKE'] as Array<'LIKE' | 'SUPER_LIKE'> },
      giver: { status: 'ACTIVE' as const, swipesReceived: { none: { giverId: userId } }, blocksGiven: { none: { blockedId: userId } }, blocksReceived: { none: { blockerId: userId } } },
    };
    const count = await this.prisma.swipe.count({ where: base });
    const rows = await this.prisma.swipe.findMany({
      where: limits.seeLikers ? base : { ...base, action: 'SUPER_LIKE' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    const profiles = await this.prisma.profile.findMany({ where: { userId: { in: page.map((r) => r.giverId) } }, include: cardInclude });
    const byId = new Map(profiles.map((p) => [p.userId, p]));
    return {
      locked: !limits.seeLikers, count,
      items: page.flatMap((r) => { const p = byId.get(r.giverId); return p ? [{ ...toCard(p), superLike: r.action === 'SUPER_LIKE', likedAt: r.createdAt }] : []; }),
      nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
    };
  }
}
