import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AppError, badRequest, forbidden, notFound } from '../common/errors.js';
import { CreditsService } from './credits.service.js';
import { PaymentsService } from './payments.service.js';
import { PlanConfigService } from './plan-config.service.js';

const ACTIVE = ['REQUESTED', 'PROCESSING', 'COMPLETED'] as const;
const FULL = { subscription: { include: { plan: true } }, product: true } as const;

/**
 * Remboursements intégraux.
 *  - Demande d'un membre (dans le délai, 7 jours par défaut) : UN administrateur approuve.
 *  - Demande d'un administrateur : DOUBLE VALIDATION — l'approbateur doit être une autre personne.
 * Exécution : fournisseur d'abord (ou « manuel » si remboursé hors système), puis effets atomiques (paiement REFUNDED,
 * droits retirés, crédits restants repris). Une approbation rejouée ne rembourse jamais deux fois.
 */
@Injectable()
export class RefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly credits: CreditsService,
    private readonly config: PlanConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  private async windowDays() {
    const s = await this.prisma.systemSetting.findUnique({ where: { key: 'refund_window_days' } });
    return typeof s?.value === 'number' ? s.value : 7;
  }

  private async create(requesterId: string, paymentId: string, reason: string, source: 'USER' | 'ADMIN', enforceOwnerAndWindow: boolean) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || (enforceOwnerAndWindow && payment.userId !== requesterId)) throw notFound('PAYMENT_NOT_FOUND');
    if (payment.status !== 'SUCCEEDED') throw badRequest('NOT_REFUNDABLE', 'Seul un paiement réussi peut être remboursé');
    if (enforceOwnerAndWindow && payment.paidAt && Date.now() - payment.paidAt.getTime() > (await this.windowDays()) * 86_400_000) {
      throw badRequest('REFUND_WINDOW_EXPIRED', 'Délai de demande dépassé');
    }
    // Verrou sur le paiement : deux demandes simultanées ne créent qu'un seul remboursement actif.
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`refund:${paymentId}`}, 0))`;
      if (await tx.refund.findFirst({ where: { paymentId, status: { in: [...ACTIVE] } } })) throw new AppError(409, 'REFUND_EXISTS', 'Un remboursement existe déjà pour ce paiement');
      return tx.refund.create({ data: { paymentId, amountXof: payment.amountXof, reason, source, requestedById: requesterId } });
    });
  }

  requestByUser(userId: string, paymentId: string, reason: string) { return this.create(userId, paymentId, reason, 'USER', true); }
  requestByAdmin(adminId: string, paymentId: string, reason: string) { return this.create(adminId, paymentId, reason, 'ADMIN', false); }

  async list(status: string | undefined, cursor: string | undefined, take: number) {
    const rows = await this.prisma.refund.findMany({
      where: status ? { status: status as 'REQUESTED' } : {}, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: take + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { payment: { select: { id: true, provider: true, kind: true, userId: true, user: { select: { profile: { select: { displayName: true } } } }, product: { select: { name: true } }, subscription: { select: { plan: { select: { code: true } } } } } } },
    });
    return {
      items: rows.slice(0, take).map((r) => ({
        id: r.id, paymentId: r.paymentId, amountXof: r.amountXof, reason: r.reason, source: r.source, status: r.status, requestedById: r.requestedById, decidedById: r.decidedById,
        decisionNote: r.decisionNote, failureReason: r.failureReason, creditsReversed: r.creditsReversed, createdAt: r.createdAt, decidedAt: r.decidedAt,
        provider: r.payment.provider, product: r.payment.product?.name ?? r.payment.subscription?.plan.code ?? null, displayName: r.payment.user.profile?.displayName ?? '—',
      })),
      nextCursor: rows.length > take ? rows[take - 1]!.id : null,
    };
  }

  async reject(adminId: string, refundId: string, note: string) {
    const r = await this.prisma.refund.updateMany({ where: { id: refundId, status: 'REQUESTED' }, data: { status: 'REJECTED', decidedById: adminId, decisionNote: note, decidedAt: new Date() } });
    if (!r.count) throw new AppError(409, 'REFUND_NOT_PENDING', 'Demande déjà traitée');
    const refund = await this.prisma.refund.findUniqueOrThrow({ where: { id: refundId }, include: { payment: { select: { userId: true } } } });
    await this.notifications.create(refund.payment.userId, 'REFUND_UPDATE', { status: 'REJECTED' });
    return { status: 'REJECTED' as const };
  }

  async approve(adminId: string, refundId: string, opts: { note?: string; manual?: boolean }) {
    const refund = await this.prisma.refund.findUnique({ where: { id: refundId } });
    if (!refund) throw notFound('REFUND_NOT_FOUND');
    if (refund.status === 'COMPLETED' || refund.status === 'PROCESSING') return { status: refund.status }; // rejeu : jamais deux remboursements
    if (refund.status !== 'REQUESTED') throw new AppError(409, 'REFUND_NOT_PENDING', 'Demande déjà traitée');
    // Double validation : pour une demande d'administrateur, l'approbateur est une autre personne.
    if (refund.source === 'ADMIN' && refund.requestedById === adminId) throw forbidden('SELF_APPROVAL', 'La demande doit être approuvée par un autre administrateur');

    // Prise en charge atomique : un seul approbateur peut lancer l'exécution.
    const claim = await this.prisma.refund.updateMany({ where: { id: refundId, status: 'REQUESTED' }, data: { status: 'PROCESSING', decidedById: adminId, decisionNote: opts.note } });
    if (!claim.count) return { status: 'PROCESSING' as const };

    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: refund.paymentId }, include: FULL });
    let providerRef: string | undefined = 'manual';
    if (!opts.manual) {
      try {
        providerRef = (await this.payments.providerRefund({ providerRef: payment.providerRef, amountXof: payment.amountXof })).providerRef;
      } catch (e) {
        const reason = (e instanceof Error ? e.message : 'échec').slice(0, 300);
        await this.prisma.refund.update({ where: { id: refundId }, data: { status: 'FAILED', failureReason: reason, decidedAt: new Date() } });
        await this.notifications.create(payment.userId, 'REFUND_UPDATE', { status: 'FAILED' });
        return { status: 'FAILED' as const, failureReason: reason };
      }
    }
    const reversed = await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED' } });
      const n = await this.applyEffects(tx, payment, refundId);
      await tx.refund.update({ where: { id: refundId }, data: { status: 'COMPLETED', providerRef, decidedAt: new Date(), creditsReversed: n } });
      return n;
    });
    await this.payments.syncEntitlement(payment.userId, new Date());
    await this.notifications.create(payment.userId, 'REFUND_UPDATE', { status: 'COMPLETED', amountXof: payment.amountXof });
    return { status: 'COMPLETED' as const, creditsReversed: reversed };
  }

  /** Retire ce que le paiement avait accordé : abonnement résilié, crédits restants repris (le déjà consommé ne se reprend pas). */
  private async applyEffects(tx: Prisma.TransactionClient, payment: Prisma.PaymentGetPayload<{ include: typeof FULL }>, refundId: string): Promise<number> {
    let reversed = 0;
    if (payment.kind === 'PRODUCT' && payment.product) {
      reversed += await this.credits.reverse(tx, payment.userId, payment.product.creditType, payment.product.quantity, refundId);
    } else if (payment.subscription) {
      await tx.subscription.update({ where: { id: payment.subscription.id }, data: { status: 'CANCELED', cancelAtPeriodEnd: true, currentPeriodEnd: new Date() } });
      const monthly = (await this.config.featuresOf(payment.subscription.plan.code)).boosts_monthly;
      if (monthly > 0) reversed += await this.credits.reverse(tx, payment.userId, 'BOOST_120', monthly * payment.subscription.months, `${refundId}:plan`);
      const tokens = (await this.config.featuresOf(payment.subscription.plan.code)).match_tokens_monthly;
      if (tokens > 0) reversed += await this.credits.reverse(tx, payment.userId, 'MATCH_TOKEN', tokens * payment.subscription.months, `${refundId}:plan-tokens`);
    }
    return reversed;
  }
}
