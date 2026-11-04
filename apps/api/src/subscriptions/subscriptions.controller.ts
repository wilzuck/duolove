import { Body, Controller, Get, Headers, HttpCode, Module, Param, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { z } from 'zod';
import { checkoutSchema, promoPreviewSchema, promoRedeemSchema, type CheckoutInput } from '@duomatch/types';
import { CurrentUser, Public, RequireVerified, type AuthUser } from '../common/auth.js';
import { badRequest } from '../common/errors.js';
import { zod } from '../common/zod.pipe.js';
import { EntitlementsModule } from './entitlements.service.js';
import { PaymentsService } from './payments.service.js';
import { PromoService } from './promo.service.js';
import { PlanConfigService } from './plan-config.service.js';
import { RefundsService } from './refunds.service.js';

const legacyCheckout = z.object({ plan: z.enum(['PREMIUM', 'VIP']), months: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]).default(1) });
const confirmSchema = z.object({ reference: z.string().regex(/^kk_[A-Za-z0-9_-]{8,40}$/), transactionId: z.string().regex(/^[A-Za-z0-9_-]{4,64}$/) });
const refundRequestSchema = z.object({ reason: z.string().trim().min(5).max(500) });
const simulateSchema = z.object({ outcome: z.enum(['success', 'fail']) });

@ApiTags('subscriptions')
@Controller()
export class SubscriptionsController {
  constructor(private readonly payments: PaymentsService, private readonly refunds: RefundsService, private readonly promos: PromoService, private readonly config: PlanConfigService) {}

  @Public() @Get('subscriptions/plans')
  plans() { return this.payments.catalog(); }

  @Public() @Get('plans')
  plansAlias() { return this.payments.catalog(); }

  @Get('subscriptions/me')
  me(@CurrentUser() u: AuthUser) { return this.payments.current(u.id); }

  @RequireVerified() @Throttle({ default: { limit: 10, ttl: 60_000 } }) @Post('subscriptions/checkout')
  checkout(@CurrentUser() u: AuthUser, @Body(zod(legacyCheckout)) body: { plan: 'PREMIUM' | 'VIP'; months: 1 | 3 | 6 | 12 }) {
    return this.payments.checkout(u.id, body.plan, body.months);
  }

  /** Point d'entrée unique : abonnement (offre + durée) ou achat ponctuel (boost, pack). Le montant est toujours calculé serveur. */
  @RequireVerified() @Throttle({ default: { limit: 10, ttl: 60_000 } }) @Post('checkout')
  checkoutAny(@CurrentUser() u: AuthUser, @Body(zod(checkoutSchema)) body: CheckoutInput) {
    return body.type === 'subscription' ? this.payments.checkout(u.id, body.plan, body.months, body.promoCode) : this.payments.checkoutProduct(u.id, body.code, body.promoCode);
  }

  /** Que vaut ce code pour moi ? (remise ou jetons). Limité en fréquence : pas de recherche de codes par force brute. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) @HttpCode(200) @Post('promo/lookup')
  promoLookup(@CurrentUser() u: AuthUser, @Body(zod(promoRedeemSchema)) body: { code: string }) { return this.promos.lookup(u.id, body.code); }

  /** Aperçu de la remise (sans rien réserver) : le prix de base est lu en configuration, jamais fourni par le client. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } }) @HttpCode(200) @Post('promo/preview')
  async promoPreview(@CurrentUser() u: AuthUser, @Body(zod(promoPreviewSchema)) body: { code: string; target: CheckoutInput }) {
    const t = body.target;
    let base: number;
    if (t.type === 'subscription') base = (await this.config.quote(t.plan, t.months)).price.totalXof;
    else {
      const p = (await this.config.products()).find((x) => x.code === t.code);
      if (!p) throw badRequest('PRODUCT_NOT_FOUND');
      base = p.priceXof;
    }
    const q = await this.promos.evaluate(this.payments.db, u.id, body.code, base);
    return { code: q.code, percent: q.percent, baseXof: base, discountXof: q.discountXof, finalXof: q.finalXof };
  }

  /** Code « jetons offerts » : crédite une seule fois par membre. */
  @RequireVerified() @Throttle({ default: { limit: 10, ttl: 60_000 } }) @HttpCode(200) @Post('promo/redeem')
  promoRedeem(@CurrentUser() u: AuthUser, @Body(zod(promoRedeemSchema)) body: { code: string }) { return this.promos.redeemTokens(u.id, body.code); }

  @HttpCode(200) @Post('subscriptions/cancel')
  cancel(@CurrentUser() u: AuthUser) { return this.payments.cancel(u.id); }

  @HttpCode(200) @Post('subscriptions/resume')
  resume(@CurrentUser() u: AuthUser) { return this.payments.cancel(u.id, true); }

  @Get('payments')
  history(@CurrentUser() u: AuthUser) { return this.payments.history(u.id); }

  /** Demande de remboursement d'un membre (dans le délai) ; un administrateur la traite. */
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } }) @Post('payments/:id/refund-request')
  async refundRequest(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(zod(refundRequestSchema)) body: { reason: string }) {
    const r = await this.refunds.requestByUser(u.id, id, body.reason);
    return { id: r.id, status: r.status };
  }

  @Get('payments/:id/invoice')
  invoice(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.payments.invoice(u.id, id); }

  /** Webhook fournisseur : non authentifié par cookie, authentifié par signature HMAC du corps brut. */
  @Public() @SkipThrottle() @HttpCode(200) @Post('payments/webhook/:provider')
  webhook(@Param('provider') provider: string, @Req() req: Request & { rawBody?: Buffer }, @Headers('x-duomatch-signature') sig?: string, @Headers('x-kkiapay-secret') kk?: string) {
    if (!req.rawBody) throw badRequest('INVALID_PAYLOAD');
    if (provider === 'kkiapay') return this.payments.handleKkiapayWebhook(req.rawBody, kk);
    return this.payments.handleWebhook(provider, req.rawBody, sig);
  }

  /** Après le widget KKiaPay : le serveur re-vérifie la transaction auprès de KKiaPay avant d'activer quoi que ce soit. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } }) @HttpCode(200) @Post('payments/kkiapay/confirm')
  confirmKkiapay(@CurrentUser() u: AuthUser, @Body(zod(confirmSchema)) body: { reference: string; transactionId: string }) {
    return this.payments.confirmKkiapay(u.id, body.reference, body.transactionId);
  }

  /** Page de paiement simulée (dev uniquement, 404 en production) : le serveur envoie lui-même le webhook signé. */
  @HttpCode(200) @Post('payments/mock/:ref/complete')
  simulate(@CurrentUser() u: AuthUser, @Param('ref') ref: string, @Body(zod(simulateSchema)) body: { outcome: 'success' | 'fail' }) {
    return this.payments.simulateProvider(u.id, ref, body.outcome);
  }
}

@Module({ imports: [EntitlementsModule], controllers: [SubscriptionsController], providers: [PaymentsService, RefundsService, PromoService], exports: [PaymentsService, RefundsService, PromoService] })
export class SubscriptionsModule {}
