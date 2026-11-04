import { Injectable, Logger } from '@nestjs/common';
import { LIVE, liveCriteriaSchema, type LiveCriteria } from '@duomatch/types';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EntitlementsService } from '../subscriptions/entitlements.service.js';
import { CreditsService } from '../subscriptions/credits.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RealtimeGateway } from '../chat/realtime.gateway.js';
import { cardInclude, toCard } from '../profiles/card.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../common/errors.js';
import { orderPair } from '../swipes/swipes.service.js';
import { acceptsSeeker, matchesCriteria } from './criteria.js';
import { giftTokensIfEligible } from './gift.js';

const MIN = 60_000;

/** Profil minimal évalué pour savoir si une personne peut être invitée. */
const candidateSelect = {
  userId: true, gender: true, birthDate: true, country: true, intent: true, hasChildren: true, likesPets: true, living: true, heightCm: true, originCountry: true,
  user: { select: { lastActiveAt: true, preference: { select: { seeking: true, ageMin: true, ageMax: true } } } },
} satisfies Prisma.ProfileSelect;

@Injectable()
export class LiveService {
  private readonly logger = new Logger('Live');

  constructor(
    private readonly prisma: PrismaService,
    private readonly ent: EntitlementsService,
    private readonly credits: CreditsService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Nettoyage paresseux : invitations sans réponse et recherches arrivées à échéance. */
  private async expireStale() {
    const now = new Date();
    await this.prisma.liveInvite.updateMany({ where: { status: { in: ['PENDING', 'ACCEPTED'] }, expiresAt: { lt: now } }, data: { status: 'EXPIRED' } });
    await this.prisma.liveSearch.updateMany({ where: { status: 'ACTIVE', expiresAt: { lt: now } }, data: { status: 'EXPIRED' } });
  }

  private async access(userId: string) {
    const { limits } = await this.ent.get(userId);
    const used = await this.prisma.liveSearch.count({ where: { userId } });
    const unlimited = limits.liveMatch;
    const trialsLeft = unlimited ? null : Math.max(0, limits.liveMatchTrials - used);
    return { unlimited, trialsLeft, canStart: unlimited || (trialsLeft ?? 0) > 0 };
  }

  async state(userId: string) {
    await this.expireStale();
    await giftTokensIfEligible(this.prisma, this.credits, userId);
    const [access, balances, me, search, incomingCount, lastSearch] = await Promise.all([
      this.access(userId),
      this.credits.balances(userId),
      this.prisma.profile.findUnique({ where: { userId }, select: { liveOptIn: true, completeness: true, user: { select: { preference: true, emailVerifiedAt: true } } } }),
      this.prisma.liveSearch.findFirst({ where: { userId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } }),
      this.prisma.liveInvite.count({ where: { inviteeId: userId, status: 'PENDING', expiresAt: { gt: new Date() } } }),
      this.prisma.liveSearch.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    ]);
    if (!me) throw forbidden('PROFILE_INCOMPLETE');

    let accepted: Array<ReturnType<typeof toCard> & { inviteId: string; status: 'ACCEPTED' | 'CHOSEN'; conversationId: string | null; expiresAt: Date }> = [];
    let pending = 0;
    if (search) {
      const invites = await this.prisma.liveInvite.findMany({ where: { searchId: search.id }, orderBy: { respondedAt: 'asc' } });
      pending = invites.filter((i) => i.status === 'PENDING').length;
      const shown = invites.filter((i) => i.status === 'ACCEPTED' || i.status === 'CHOSEN');
      const profiles = await this.prisma.profile.findMany({ where: { userId: { in: shown.map((i) => i.inviteeId) } }, include: cardInclude });
      const byId = new Map(profiles.map((p) => [p.userId, p]));
      const matches = await this.prisma.match.findMany({
        where: { OR: shown.map((i) => { const [a, b] = orderPair(userId, i.inviteeId); return { userAId: a, userBId: b }; }) },
        include: { conversation: { select: { id: true } } },
      });
      const convOf = new Map(matches.map((m) => [m.userAId === userId ? m.userBId : m.userAId, m.conversation?.id ?? null]));
      accepted = shown.flatMap((i) => {
        const p = byId.get(i.inviteeId);
        return p ? [{ ...toCard(p), inviteId: i.id, status: i.status as 'ACCEPTED' | 'CHOSEN', conversationId: i.status === 'CHOSEN' ? (convOf.get(i.inviteeId) ?? null) : null, expiresAt: i.expiresAt }] : [];
      });
    }
    const chosen = accepted.filter((a) => a.status === 'CHOSEN').length;
    const pref = me.user.preference;
    return {
      access, tokens: balances.MATCH_TOKEN, optIn: me.liveOptIn,
      gift: { tokens: LIVE.PROFILE_GIFT_TOKENS, completeness: me.completeness, emailVerified: !!me.user.emailVerifiedAt },
      rules: { tokensPerChat: LIVE.TOKENS_PER_CHAT, maxChoices: LIVE.MAX_CHOICES, cooldownMinutes: LIVE.COOLDOWN_MINUTES, searchHours: LIVE.SEARCH_HOURS },
      defaults: { seeking: pref?.seeking ?? 'EVERYONE', ageMin: pref?.ageMin ?? 18, ageMax: pref?.ageMax ?? 60, country: pref?.country ?? null },
      nextLaunchAt: lastSearch ? new Date(lastSearch.createdAt.getTime() + LIVE.COOLDOWN_MINUTES * MIN) : null,
      incomingCount,
      search: search ? { id: search.id, criteria: search.criteria as unknown as LiveCriteria, createdAt: search.createdAt, expiresAt: search.expiresAt, pending, chosen, choicesLeft: Math.max(0, LIVE.MAX_CHOICES - chosen) } : null,
      accepted,
    };
  }

  /** Personnes réellement « en ligne » : socket connecté ou activité récente. */
  private onlineClause(): Prisma.UserWhereInput {
    const since = new Date(Date.now() - LIVE.ONLINE_MINUTES * MIN);
    const sockets = this.realtime.onlineIds();
    return { OR: [{ lastActiveAt: { gte: since } }, ...(sockets.length ? [{ id: { in: sockets } }] : [])] };
  }

  /** Lance une recherche : valide les critères, verrouille l'accès (formule ou essais) et le délai, invite les personnes en ligne. */
  async start(userId: string, input: unknown) {
    const parsed = liveCriteriaSchema.safeParse(input);
    if (!parsed.success) throw badRequest('VALIDATION_ERROR', 'Critères invalides', parsed.error.issues.map((i) => ({ path: i.path.join('.'), code: i.message })));
    const criteria = parsed.data;

    await this.expireStale();
    const me = await this.prisma.profile.findUnique({ where: { userId }, select: { userId: true, gender: true, birthDate: true, onboardedAt: true, displayName: true } });
    if (!me || !me.onboardedAt) throw forbidden('PROFILE_INCOMPLETE', 'Complétez votre profil');

    const searchId = await this.prisma.$transaction(async (tx) => {
      // Un lancement à la fois par membre : le contrôle du délai et la création forment une seule opération.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`live:${userId}`}, 0))`;
      const { limits } = await this.ent.get(userId);
      if (!limits.liveMatch) {
        const used = await tx.liveSearch.count({ where: { userId } });
        if (used >= limits.liveMatchTrials) throw new AppError(403, 'PLAN_REQUIRED', 'Essais gratuits épuisés : passez Premium pour continuer', { trials: limits.liveMatchTrials });
      }
      const last = await tx.liveSearch.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
      if (last) {
        const retryAt = new Date(last.createdAt.getTime() + LIVE.COOLDOWN_MINUTES * MIN);
        if (retryAt.getTime() > Date.now()) throw new AppError(429, 'LIVE_COOLDOWN', 'Patientez avant de relancer une recherche', { retryAt });
      }
      const active = await tx.liveSearch.findMany({ where: { userId, status: 'ACTIVE' }, select: { id: true } });
      if (active.length) {
        const ids = active.map((a) => a.id);
        await tx.liveInvite.updateMany({ where: { searchId: { in: ids }, status: 'PENDING' }, data: { status: 'EXPIRED' } });
        await tx.liveSearch.updateMany({ where: { id: { in: ids } }, data: { status: 'CLOSED' } });
      }
      const s = await tx.liveSearch.create({ data: { userId, criteria: criteria as unknown as Prisma.InputJsonObject, expiresAt: new Date(Date.now() + LIVE.SEARCH_HOURS * 60 * MIN) } });
      return s.id;
    });

    const invited = await this.invitePool(searchId, userId, me, criteria);
    return { ...(await this.state(userId)), invited };
  }

  /** Invite, parmi les personnes en ligne, celles qui répondent aux critères ET qui acceptent la personne qui cherche. */
  private async invitePool(searchId: string, seekerId: string, seeker: { gender: string; birthDate: Date }, criteria: LiveCriteria) {
    const pool = await this.prisma.profile.findMany({
      where: {
        userId: { not: seekerId }, onboardedAt: { not: null }, visibility: 'VISIBLE', incognito: false, liveOptIn: true,
        photos: { some: { moderationStatus: { not: 'REJECTED' } } },
        user: {
          AND: [this.onlineClause()],
          status: 'ACTIVE', emailVerifiedAt: { not: null },
          blocksGiven: { none: { blockedId: seekerId } }, blocksReceived: { none: { blockerId: seekerId } },
          // Déjà en relation (même ancienne) : jamais reproposé.
          matchesA: { none: { userBId: seekerId } }, matchesB: { none: { userAId: seekerId } },
        },
      },
      select: candidateSelect, orderBy: { user: { lastActiveAt: 'desc' } }, take: 300,
    });
    const eligible = pool.filter((c) => matchesCriteria(criteria, c) && acceptsSeeker(c.user.preference, seeker));
    let invited = 0;
    for (const c of eligible) {
      if (invited >= LIVE.MAX_INVITES) break;
      if (await this.sendInvite(searchId, seekerId, c.userId)) invited++;
    }
    return invited;
  }

  /** Crée UNE invitation (jamais deux pour la même recherche) en respectant le plafond d'invitations en attente par personne. */
  private async sendInvite(searchId: string, seekerId: string, inviteeId: string): Promise<boolean> {
    const pending = await this.prisma.liveInvite.count({ where: { inviteeId, status: 'PENDING', expiresAt: { gt: new Date() } } });
    if (pending >= LIVE.MAX_PENDING_PER_INVITEE) return false;
    const r = await this.prisma.liveInvite.createMany({
      data: [{ searchId, seekerId, inviteeId, expiresAt: new Date(Date.now() + LIVE.INVITE_MINUTES * MIN) }], skipDuplicates: true,
    });
    if (r.count === 0) return false;
    await this.notifications.create(inviteeId, 'LIVE_INVITE', {});
    this.realtime.emitToUser(inviteeId, 'live:invite', {});
    return true;
  }

  /**
   * Appelé quand quelqu'un se connecte : les recherches encore actives (24 h) qui lui correspondent lui sont proposées.
   * Les erreurs sont journalisées sans jamais faire échouer la connexion.
   */
  async onPresence(userId: string) {
    try {
      const me = await this.prisma.profile.findFirst({
        where: { userId, onboardedAt: { not: null }, visibility: 'VISIBLE', incognito: false, liveOptIn: true, user: { status: 'ACTIVE', emailVerifiedAt: { not: null } }, photos: { some: { moderationStatus: { not: 'REJECTED' } } } },
        select: candidateSelect,
      });
      if (!me) return;
      const searches = await this.prisma.liveSearch.findMany({
        where: {
          status: 'ACTIVE', expiresAt: { gt: new Date() }, userId: { not: userId },
          user: { blocksGiven: { none: { blockedId: userId } }, blocksReceived: { none: { blockerId: userId } }, matchesA: { none: { userBId: userId } }, matchesB: { none: { userAId: userId } } },
        },
        orderBy: { createdAt: 'desc' }, take: 200,
        include: { user: { select: { profile: { select: { gender: true, birthDate: true } } } }, _count: { select: { invites: true } } },
      });
      for (const s of searches) {
        const seeker = s.user.profile;
        if (!seeker || s._count.invites >= LIVE.MAX_INVITES) continue;
        const criteria = liveCriteriaSchema.safeParse(s.criteria);
        if (!criteria.success || !matchesCriteria(criteria.data, me) || !acceptsSeeker(me.user.preference, seeker)) continue;
        await this.sendInvite(s.id, s.userId, userId);
      }
    } catch (e) {
      this.logger.warn(`onPresence: ${(e as Error).message}`);
    }
  }

  /** Invitations que JE dois traiter (avec le profil de la personne qui cherche). */
  async incoming(userId: string) {
    await this.expireStale();
    const invites = await this.prisma.liveInvite.findMany({
      where: { inviteeId: userId, status: 'PENDING', expiresAt: { gt: new Date() }, search: { status: 'ACTIVE' }, seeker: { status: 'ACTIVE', blocksGiven: { none: { blockedId: userId } }, blocksReceived: { none: { blockerId: userId } } } },
      orderBy: { createdAt: 'desc' }, take: 20,
    });
    const profiles = await this.prisma.profile.findMany({ where: { userId: { in: invites.map((i) => i.seekerId) } }, include: cardInclude });
    const byId = new Map(profiles.map((p) => [p.userId, p]));
    return { items: invites.flatMap((i) => { const p = byId.get(i.seekerId); return p ? [{ ...toCard(p), inviteId: i.id, expiresAt: i.expiresAt }] : []; }) };
  }

  /** Accepter ou refuser. Une seule réponse possible (la réponse est « réclamée » atomiquement). */
  async respond(userId: string, inviteId: string, accept: boolean) {
    const inv = await this.prisma.liveInvite.findUnique({ where: { id: inviteId }, include: { search: true } });
    if (!inv || inv.inviteeId !== userId) throw notFound('INVITE_NOT_FOUND');
    if (inv.status !== 'PENDING' || inv.expiresAt < new Date() || inv.search.status !== 'ACTIVE') throw conflict('INVITE_CLOSED', 'Cette invitation n’est plus disponible');
    const now = new Date();
    // Accepté : reste choisissable jusqu'à 2 h (ou la fin de la recherche).
    const expiresAt = accept ? new Date(Math.min(inv.search.expiresAt.getTime(), now.getTime() + 120 * MIN)) : inv.expiresAt;
    const claimed = await this.prisma.liveInvite.updateMany({ where: { id: inviteId, status: 'PENDING' }, data: { status: accept ? 'ACCEPTED' : 'DECLINED', respondedAt: now, expiresAt } });
    if (!claimed.count) throw conflict('INVITE_CLOSED', 'Cette invitation n’est plus disponible');
    if (accept) {
      await this.notifications.create(inv.seekerId, 'LIVE_ACCEPTED', {});
      this.realtime.emitToUser(inv.seekerId, 'live:accepted', { inviteId });
    }
    return { status: accept ? 'ACCEPTED' : 'DECLINED' };
  }

  /**
   * Ouvre la conversation avec une personne qui a accepté : consomme les jetons DANS la même transaction.
   * Si le solde est insuffisant ou si quoi que ce soit échoue, rien n'est débité et l'invitation reste « acceptée ».
   */
  async choose(userId: string, inviteId: string) {
    const inv = await this.prisma.liveInvite.findUnique({ where: { id: inviteId } });
    if (!inv || inv.seekerId !== userId) throw notFound('INVITE_NOT_FOUND');
    const [a, b] = orderPair(userId, inv.inviteeId);

    const result = await this.prisma.$transaction(async (tx) => {
      // Deux verrous, toujours dans cet ordre : la recherche (plafond de choix) puis la paire (un seul match).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`live-search:${inv.searchId}`}, 0))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${a}:${b}`}, 0))`;
      const fresh = await tx.liveInvite.findUnique({ where: { id: inviteId } });
      if (!fresh || fresh.status !== 'ACCEPTED' || fresh.expiresAt < new Date()) throw conflict('INVITE_CLOSED', 'Cette personne n’est plus disponible');
      const chosen = await tx.liveInvite.count({ where: { searchId: fresh.searchId, status: 'CHOSEN' } });
      if (chosen >= LIVE.MAX_CHOICES) throw conflict('CHOICES_EXHAUSTED', `Vous pouvez parler à ${LIVE.MAX_CHOICES} personnes au plus`);
      const blocked = await tx.block.findFirst({ where: { OR: [{ blockerId: userId, blockedId: inv.inviteeId }, { blockerId: inv.inviteeId, blockedId: userId }] }, select: { id: true } });
      if (blocked) throw conflict('INVITE_CLOSED', 'Cette personne n’est plus disponible');

      const existing = await tx.match.findUnique({ where: { userAId_userBId: { userAId: a, userBId: b } }, include: { conversation: true } });
      // Une relation rompue n'est jamais rouverte par ce biais (la décision de l'autre personne prime).
      if (existing && existing.status !== 'ACTIVE') throw conflict('MATCH_CLOSED', 'Cette personne n’est plus joignable');

      const claimed = await tx.liveInvite.updateMany({ where: { id: inviteId, status: 'ACCEPTED' }, data: { status: 'CHOSEN' } });
      if (!claimed.count) throw conflict('INVITE_CLOSED', 'Cette personne n’est plus disponible');
      // Déjà en conversation : aucun jeton consommé.
      if (existing) return { match: existing, created: false };
      await this.credits.consume(tx, userId, 'MATCH_TOKEN', LIVE.TOKENS_PER_CHAT, inviteId);
      const match = await tx.match.create({ data: { userAId: a, userBId: b, conversation: { create: {} } }, include: { conversation: true } });
      return { match, created: true };
    }).catch((e) => {
      if (e instanceof AppError && e.code === 'NO_CREDITS') throw forbidden('NO_TOKENS', 'Jetons insuffisants : achetez un pack pour continuer');
      throw e;
    });

    const conversationId = result.match.conversation!.id;
    if (result.created) {
      const data = { matchId: result.match.id, conversationId };
      await Promise.all([
        this.notifications.create(userId, 'MATCH', { ...data, userId: inv.inviteeId }),
        this.notifications.create(inv.inviteeId, 'MATCH', { ...data, userId }),
      ]);
      this.realtime.emitToUser(userId, 'match:new', { ...data, userId: inv.inviteeId });
      this.realtime.emitToUser(inv.inviteeId, 'match:new', { ...data, userId });
    }
    return { conversationId, matchId: result.match.id, charged: result.created ? LIVE.TOKENS_PER_CHAT : 0, tokens: (await this.credits.balances(userId)).MATCH_TOKEN };
  }

  /** Arrête la recherche en cours (les invitations en attente tombent). */
  async cancel(userId: string) {
    const active = await this.prisma.liveSearch.findMany({ where: { userId, status: 'ACTIVE' }, select: { id: true } });
    const ids = active.map((s) => s.id);
    await this.prisma.liveInvite.updateMany({ where: { searchId: { in: ids }, status: 'PENDING' }, data: { status: 'EXPIRED' } });
    await this.prisma.liveSearch.updateMany({ where: { id: { in: ids } }, data: { status: 'CLOSED' } });
    return { ok: true };
  }

  async setOptIn(userId: string, enabled: boolean) {
    await this.prisma.profile.update({ where: { userId }, data: { liveOptIn: enabled } });
    if (!enabled) await this.prisma.liveInvite.updateMany({ where: { inviteeId: userId, status: 'PENDING' }, data: { status: 'EXPIRED' } });
    return { optIn: enabled };
  }
}
