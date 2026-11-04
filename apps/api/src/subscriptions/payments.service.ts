import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { PlanCode } from '@duomatch/types';
import type { Prisma } from '../generated/prisma/client.js';
import { CreditsService } from './credits.service.js';
import { PlanConfigService } from './plan-config.service.js';
import { PromoService } from './promo.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EntitlementsService } from './entitlements.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AppError, badRequest, notFound, unauthorized } from '../common/errors.js';
import { hmacHex, randomToken, safeEqualHex, safeEqualStr } from '../common/crypto.js';
import { getEnv, isProd } from '../config/env.js';
import { KkiapayProvider, verifyKkiapayTransaction } from './kkiapay.js';

/** Contrat d'un fournisseur de paiement. Les adaptateurs Stripe / KKiaPay / Mobile Money l'implémentent. */
export interface PaymentProvider {
  readonly name: string;
  /** `checkoutUrl` = redirection hébergée ; `widget` = paiement dans la page (le navigateur ouvre le widget du fournisseur). */
  /** Remboursement intégral chez le fournisseur (absent = non supporté : remboursement manuel). Lève une erreur en cas d'échec. */
  refund?(p: { providerRef: string; amountXof: number }): Promise<{ providerRef?: string }>;
  createCheckout(args: { paymentId: string; amountXof: number; plan?: PlanCode }): Promise<{ providerRef: string; checkoutUrl?: string; widget?: Record<string, unknown> }>;
}

/** Fournisseur de simulation (dev/CI) : même chemin de webhook signé qu'un vrai fournisseur. */
export class MockProvider implements PaymentProvider {
  readonly name = 'mock';
  async refund() { return { providerRef: `mock_refund_${randomToken(6)}` }; }
  async createCheckout() {
    const providerRef = `mock_${randomToken(12)}`;
    return { providerRef, checkoutUrl: `${getEnv().APP_URL}/checkout/mock?ref=${providerRef}` };
  }
}

export interface WebhookPayload { id: string; type: 'payment.succeeded' | 'payment.failed'; providerRef: string; reason?: string }

const DAY = 86_400_000;
const FULL = { subscription: { include: { plan: true } }, product: true } as const;
type PaymentFull = Prisma.PaymentGetPayload<{ include: typeof FULL }>;

function addMonths(d: Date, n: number) {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + n);
  return r;
}
const PAST_DUE_GRACE_DAYS = 7;

@Injectable()
export class PaymentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Payments');
  private readonly provider: PaymentProvider = getEnv().PAYMENT_PROVIDER === 'kkiapay' ? new KkiapayProvider() : new MockProvider();
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ent: EntitlementsService,
    private readonly notifications: NotificationsService,
    private readonly config: PlanConfigService,
    private readonly credits: CreditsService,
    private readonly promos: PromoService,
  ) {}

  /** Accès base pour les aperçus en lecture seule (contrôleur). */
  get db() { return this.prisma; }

  async onModuleInit() {
    // Job d'expiration horaire (instance unique). En multi-instances : le déléguer à BullMQ/cron avec verrou.
    if (getEnv().NODE_ENV !== 'test') {
      this.timer = setInterval(() => void this.runExpiryJob().catch((e) => this.logger.error(String(e))), 3_600_000);
      this.timer.unref();
    }
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  /** Catalogue public : offres (avec prix par durée calculés) + produits ponctuels. */
  async catalog() {
    const [plans, products] = await Promise.all([this.config.catalog(), this.config.products()]);
    return { plans, products: products.map((p) => ({ code: p.code, kind: p.kind, creditType: p.creditType, name: p.name, quantity: p.quantity, priceXof: p.priceXof, currency: p.currency })) };
  }

  async current(userId: string) {
    const [e, sub] = await Promise.all([
      this.ent.get(userId),
      this.prisma.subscription.findFirst({ where: { userId, status: { in: ['ACTIVE', 'PAST_DUE'] } }, orderBy: { createdAt: 'desc' }, include: { plan: true } }),
    ]);
    return {
      plan: e.plan, validUntil: e.validUntil, limits: e.limits, credits: await this.credits.balances(userId),
      subscription: sub ? { id: sub.id, plan: sub.plan.code, status: sub.status, cancelAtPeriodEnd: sub.cancelAtPeriodEnd, currentPeriodEnd: sub.currentPeriodEnd } : null,
    };
  }

  /**
   * Abonnement : le montant est CALCULÉ ICI (tarif configuré × durée − remise), jamais lu depuis le client.
   * Rien n'est activé tant que le fournisseur n'a pas confirmé (webhook signé ou vérification serveur).
   */
  async checkout(userId: string, code: PlanCode, months = 1, promoCode?: string) {
    const { plan, price } = await this.config.quote(code, months);
    const row = await this.prisma.subscriptionPlan.findUniqueOrThrow({ where: { code } });
    // Abonnement + paiement (+ remise) dans une transaction : le verrou du code promo garantit qu'il ne dépasse jamais son plafond.
    const { sub, payment, amountXof } = await this.prisma.$transaction(async (tx) => {
      const q = promoCode ? await this.promos.evaluate(tx, userId, promoCode, price.totalXof, true) : null;
      const amount = q?.finalXof ?? price.totalXof;
      const sub = await tx.subscription.create({ data: { userId, planId: row.id, provider: this.provider.name, months } });
      const payment = await tx.payment.create({ data: { userId, subscriptionId: sub.id, kind: 'SUBSCRIPTION', months, amountXof: amount, promoCodeId: q?.promoId, discountXof: q?.discountXof ?? 0, provider: this.provider.name, providerRef: `pending_${randomToken(8)}` } });
      return { sub, payment, amountXof: amount };
    });
    const { providerRef, checkoutUrl, widget } = await this.provider.createCheckout({ paymentId: payment.id, amountXof, plan: plan.code });
    await this.prisma.payment.update({ where: { id: payment.id }, data: { providerRef } });
    await this.prisma.subscription.update({ where: { id: sub.id }, data: { providerRef } });
    return { checkoutUrl, widget, paymentId: payment.id, providerRef, provider: this.provider.name, amountXof, discountXof: payment.discountXof };
  }

  /** Achat ponctuel (boost, pack de Super Likes) : prix lu en base, jamais envoyé par le client. */
  async checkoutProduct(userId: string, code: string, promoCode?: string) {
    const product = await this.prisma.product.findFirst({ where: { code, active: true } });
    if (!product) throw notFound('PRODUCT_NOT_FOUND');
    const payment = await this.prisma.$transaction(async (tx) => {
      const q = promoCode ? await this.promos.evaluate(tx, userId, promoCode, product.priceXof, true) : null;
      return tx.payment.create({ data: { userId, kind: 'PRODUCT', productId: product.id, quantity: product.quantity, amountXof: q?.finalXof ?? product.priceXof, promoCodeId: q?.promoId, discountXof: q?.discountXof ?? 0, provider: this.provider.name, providerRef: `pending_${randomToken(8)}` } });
    });
    const { providerRef, checkoutUrl, widget } = await this.provider.createCheckout({ paymentId: payment.id, amountXof: payment.amountXof });
    await this.prisma.payment.update({ where: { id: payment.id }, data: { providerRef } });
    return { checkoutUrl, widget, paymentId: payment.id, providerRef, provider: this.provider.name, amountXof: payment.amountXof, discountXof: payment.discountXof };
  }

  /** Authentifie (HMAC-SHA256 du corps brut), dédoublonne (WebhookEvent) puis applique. Idempotent. */
  async handleWebhook(provider: string, raw: Buffer, signature: string | undefined) {
    if (provider !== 'mock') throw notFound('UNKNOWN_PROVIDER');
    const expected = hmacHex(getEnv().PAYMENT_WEBHOOK_SECRET, raw);
    if (!signature || !safeEqualHex(expected, signature)) throw unauthorized('INVALID_SIGNATURE');
    let payload: WebhookPayload;
    try { payload = JSON.parse(raw.toString('utf8')) as WebhookPayload; } catch { throw badRequest('INVALID_PAYLOAD'); }
    if (!payload.id || !payload.providerRef || !['payment.succeeded', 'payment.failed'].includes(payload.type)) throw badRequest('INVALID_PAYLOAD');

    try {
      await this.prisma.webhookEvent.create({ data: { provider, eventId: payload.id, type: payload.type } });
    } catch {
      return { duplicate: true }; // Silence assumé : violation d'unicité = événement déjà reçu (rejeu).
    }
    const payment = await this.prisma.payment.findUnique({ where: { provider_providerRef: { provider, providerRef: payload.providerRef } }, include: FULL });
    if (!payment) throw notFound('PAYMENT_NOT_FOUND');
    if (payment.status === 'PENDING') {
      if (payload.type === 'payment.succeeded') await this.applySuccess(payment);
      else await this.applyFailure(payment, payload.reason);
    }
    await this.prisma.webhookEvent.update({ where: { provider_eventId: { provider, eventId: payload.id } }, data: { processedAt: new Date() } });
    return { ok: true };
  }

  private async applySuccess(payment: PaymentFull) {
    const sub = payment.subscription;
    const now = new Date();
    let validUntil: Date | null = null;
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'SUCCEEDED', paidAt: now } });
      await tx.invoice.create({ data: { paymentId: payment.id, amountXof: payment.amountXof, number: `DM-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${payment.id.slice(-6).toUpperCase()}` } });
      if (payment.kind === 'PRODUCT' && payment.product) {
        // Crédits ajoutés une seule fois (journal unique par paiement) : un webhook rejoué n'ajoute rien.
        await this.credits.grant(tx, payment.userId, payment.product.creditType, payment.product.quantity, 'PURCHASE', payment.id);
        return;
      }
      if (!sub) return;
      // Un seul abonnement actif à la fois : les autres sont clôturés (changement de formule immédiat).
      await tx.subscription.updateMany({ where: { userId: payment.userId, id: { not: sub.id }, status: { in: ['ACTIVE', 'PAST_DUE', 'PENDING'] } }, data: { status: 'CANCELED' } });
      const base = sub.status === 'ACTIVE' && sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
      validUntil = addMonths(base, sub.months);
      await tx.subscription.update({ where: { id: sub.id }, data: { status: 'ACTIVE', currentPeriodEnd: validUntil, cancelAtPeriodEnd: false } });
      await tx.entitlement.upsert({ where: { userId: payment.userId }, create: { userId: payment.userId, plan: sub.plan.code, validUntil }, update: { plan: sub.plan.code, validUntil } });
      // Boosts inclus dans la formule (configurable) : crédités pour chaque mois acheté.
      const monthly = (await this.config.featuresOf(sub.plan.code)).boosts_monthly;
      if (monthly > 0) await this.credits.grant(tx, payment.userId, 'BOOST_120', monthly * sub.months, 'GRANT_PLAN', payment.id);
      // Jetons Match inclus (configurable) : référence distincte, car l'unicité du journal ne tient pas compte du type.
      const tokens = (await this.config.featuresOf(sub.plan.code)).match_tokens_monthly;
      if (tokens > 0) await this.credits.grant(tx, payment.userId, 'MATCH_TOKEN', tokens * sub.months, 'GRANT_PLAN', `${payment.id}:tokens`);
    });
    if (payment.kind === 'PRODUCT') await this.notifications.create(payment.userId, 'SUBSCRIPTION_ACTIVATED', { product: payment.product?.name ?? '' });
    else if (sub) await this.notifications.create(payment.userId, 'SUBSCRIPTION_ACTIVATED', { plan: sub.plan.code, validUntil: (validUntil as Date | null)?.toISOString() ?? null });
  }

  private async applyFailure(payment: { id: string; userId: string; subscription: { id: string; status: string } | null }, reason?: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', failureReason: reason?.slice(0, 200) } });
      if (payment.subscription) {
        await tx.subscription.update({ where: { id: payment.subscription.id }, data: { status: payment.subscription.status === 'ACTIVE' ? 'PAST_DUE' : 'CANCELED' } });
      }
    });
    await this.notifications.create(payment.userId, 'SUBSCRIPTION_EXPIRING', { reason: 'payment_failed' });
  }

  // ───────── KKiaPay ─────────

  /**
   * Confirmation après le widget : le navigateur ne fournit que `reference` + `transactionId` ;
   * le statut et le montant viennent de l'API KKiaPay (clés privées). Idempotent.
   */
  async confirmKkiapay(userId: string, reference: string, transactionId: string) {
    if (this.provider.name !== 'kkiapay') throw new AppError(404, 'NOT_FOUND');
    // Par référence d'abord (paiement en attente) ; en repli par transaction = rejeu d'une confirmation déjà traitée.
    const payment =
      (await this.prisma.payment.findFirst({ where: { provider: 'kkiapay', providerRef: reference, userId } })) ??
      (await this.prisma.payment.findFirst({ where: { provider: 'kkiapay', providerRef: `tx_${transactionId}`, userId } }));
    if (!payment) throw notFound('PAYMENT_NOT_FOUND');
    return this.settleKkiapay(payment.id, transactionId);
  }

  /** Webhook KKiaPay : secret authentifié, puis RE-VÉRIFICATION de la transaction auprès de KKiaPay (le corps n'est jamais cru). */
  async handleKkiapayWebhook(raw: Buffer, secretHeader: string | undefined) {
    const secret = getEnv().KKIAPAY_WEBHOOK_SECRET;
    if (this.provider.name !== 'kkiapay' || !secret) throw notFound('UNKNOWN_PROVIDER');
    const given = secretHeader ?? '';
    // KKiaPay renvoie tel quel le « hash secret » du tableau de bord dans x-kkiapay-secret (comme sur WaMarcket).
    if (!safeEqualStr(given, secret)) throw unauthorized('INVALID_SIGNATURE');
    let body: { transactionId?: string; event?: string };
    try { body = JSON.parse(raw.toString('utf8')) as typeof body; } catch { throw badRequest('INVALID_PAYLOAD'); }
    const txId = typeof body.transactionId === 'string' ? body.transactionId : '';
    if (!/^[A-Za-z0-9_-]{4,64}$/.test(txId)) throw badRequest('INVALID_PAYLOAD');
    try {
      await this.prisma.webhookEvent.create({ data: { provider: 'kkiapay', eventId: `${txId}:${body.event ?? 'event'}`, type: body.event ?? 'event' } });
    } catch {
      return { duplicate: true }; // Silence assumé : violation d'unicité = événement déjà reçu (rejeu).
    }
    const tx = await verifyKkiapayTransaction(txId);
    const payment = await this.prisma.payment.findFirst({ where: { provider: 'kkiapay', providerRef: { in: [`tx_${txId}`, ...(tx?.reference ? [tx.reference] : [])] } } });
    if (!payment) return { ok: true, unmatched: true }; // la confirmation navigateur (confirmKkiapay) rattrapera
    await this.settleKkiapay(payment.id, txId);
    return { ok: true };
  }

  private async settleKkiapay(paymentId: string, transactionId: string) {
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: FULL });
    if (payment.status !== 'PENDING') return { status: payment.status };
    let tx;
    try { tx = await verifyKkiapayTransaction(transactionId); } catch { throw new AppError(502, 'PROVIDER_UNAVAILABLE', 'Fournisseur de paiement injoignable'); }
    if (!tx) throw badRequest('TRANSACTION_NOT_FOUND');
    if (tx.status === 'FAILED') {
      await this.applyFailure(payment, tx.status.toLowerCase());
      return { status: 'FAILED' };
    }
    if (tx.status !== 'SUCCESS') return { status: 'PENDING' };
    // Montant exact exigé : un paiement partiel (ou celui d'un autre plan) n'active rien.
    if (tx.amount !== payment.amountXof) {
      await this.applyFailure(payment, 'amount_mismatch');
      return { status: 'FAILED' };
    }
    // Une transaction ne sert qu'une fois : providerRef (unique) est remplacé par l'identifiant de transaction.
    try {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { providerRef: `tx_${transactionId}` } });
    } catch {
      throw new AppError(409, 'TRANSACTION_ALREADY_USED', 'Transaction déjà utilisée');
    }
    await this.applySuccess(payment);
    return { status: 'SUCCEEDED' };
  }

  /** Simulation côté serveur du retour fournisseur (dev uniquement) : passe par le vrai chemin de webhook signé. */
  async simulateProvider(userId: string, providerRef: string, outcome: 'success' | 'fail') {
    if (isProd()) throw new AppError(404, 'NOT_FOUND');
    const payment = await this.prisma.payment.findUnique({ where: { provider_providerRef: { provider: 'mock', providerRef } } });
    if (!payment || payment.userId !== userId) throw notFound('PAYMENT_NOT_FOUND');
    const payload: WebhookPayload = { id: `evt_${randomToken(10)}`, type: outcome === 'success' ? 'payment.succeeded' : 'payment.failed', providerRef, reason: outcome === 'fail' ? 'declined' : undefined };
    const raw = Buffer.from(JSON.stringify(payload));
    return this.handleWebhook('mock', raw, hmacHex(getEnv().PAYMENT_WEBHOOK_SECRET, raw));
  }

  async providerRefund(payment: { providerRef: string; amountXof: number }) {
    if (!this.provider.refund) throw new Error('Le fournisseur ne gère pas le remboursement automatique');
    return this.provider.refund(payment);
  }

  async cancel(userId: string, resume = false) {
    const r = await this.prisma.subscription.updateMany({ where: { userId, status: 'ACTIVE' }, data: { cancelAtPeriodEnd: !resume } });
    if (!r.count) throw notFound('NO_ACTIVE_SUBSCRIPTION');
    return this.current(userId);
  }

  async history(userId: string) {
    const win = await this.prisma.systemSetting.findUnique({ where: { key: 'refund_window_days' } });
    const days = typeof win?.value === 'number' ? win.value : 7;
    return this.prisma.payment.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100, include: { invoice: { select: { number: true } }, subscription: { include: { plan: { select: { code: true } } } }, product: { select: { name: true } }, refunds: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } } } })
      .then((rows) => rows.map((p) => ({ refundable: p.status === 'SUCCEEDED' && !!p.paidAt && Date.now() - p.paidAt.getTime() < days * 86_400_000 && !p.refunds.some((r) => ['REQUESTED', 'PROCESSING', 'COMPLETED'].includes(r.status)), refund: p.refunds[0]?.status ?? null, id: p.id, kind: p.kind, months: p.months, product: p.product?.name ?? null, amountXof: p.amountXof, currency: p.currency, status: p.status, provider: p.provider, plan: p.subscription?.plan.code ?? null, createdAt: p.createdAt, paidAt: p.paidAt, invoiceNumber: p.invoice?.number ?? null })));
  }

  async invoice(userId: string, paymentId: string) {
    const p = await this.prisma.payment.findFirst({ where: { id: paymentId, userId, status: 'SUCCEEDED' }, include: { invoice: true, product: true, user: { include: { profile: { select: { displayName: true } } } }, subscription: { include: { plan: true } } } });
    if (!p?.invoice) throw notFound('INVOICE_NOT_FOUND');
    return { number: p.invoice.number, issuedAt: p.invoice.issuedAt, customer: { name: p.user.profile?.displayName ?? '', email: p.user.email }, description: p.kind === 'PRODUCT' ? `${getEnv().SITE_NAME} — ${p.product?.name ?? ''}` : `Abonnement ${getEnv().SITE_NAME} ${p.subscription?.plan.name ?? ''} — ${p.months} mois`, amountXof: p.invoice.amountXof, currency: p.currency, provider: p.provider };
  }

  /** Expire les abonnements échus (ou les passe « impayé »), rappelle les échéances à J-3. Appelable manuellement (admin/tests). */
  async runExpiryJob(now = new Date()) {
    const due = await this.prisma.subscription.findMany({ where: { status: 'ACTIVE', currentPeriodEnd: { lt: now } } });
    for (const s of due) {
      await this.prisma.subscription.update({ where: { id: s.id }, data: { status: s.cancelAtPeriodEnd ? 'EXPIRED' : 'PAST_DUE' } });
      await this.syncEntitlement(s.userId, now);
      await this.notifications.create(s.userId, 'SUBSCRIPTION_EXPIRING', { expired: true });
    }
    const stale = await this.prisma.subscription.updateMany({ where: { status: 'PAST_DUE', currentPeriodEnd: { lt: new Date(now.getTime() - PAST_DUE_GRACE_DAYS * DAY) } }, data: { status: 'EXPIRED' } });
    const soon = await this.prisma.subscription.findMany({ where: { status: 'ACTIVE', cancelAtPeriodEnd: false, currentPeriodEnd: { gte: now, lt: new Date(now.getTime() + 3 * DAY) } } });
    let reminded = 0;
    for (const s of soon) {
      const already = await this.prisma.notification.findFirst({ where: { userId: s.userId, type: 'SUBSCRIPTION_EXPIRING', createdAt: { gt: new Date(now.getTime() - 4 * DAY) } } });
      if (!already) { await this.notifications.create(s.userId, 'SUBSCRIPTION_EXPIRING', { endsAt: s.currentPeriodEnd?.toISOString() ?? null }); reminded++; }
    }
    return { expired: due.length, expiredStale: stale.count, reminded };
  }

  /** Recalcule les droits d'un membre à partir de ses abonnements réellement actifs. */
  async syncEntitlement(userId: string, now: Date) {
    const live = await this.prisma.subscription.findFirst({ where: { userId, status: 'ACTIVE', currentPeriodEnd: { gt: now } }, include: { plan: true }, orderBy: { currentPeriodEnd: 'desc' } });
    if (live) await this.ent.set(userId, live.plan.code, live.currentPeriodEnd);
    else await this.ent.set(userId, 'FREE', null);
  }
}
