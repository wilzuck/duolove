import { Injectable } from '@nestjs/common';
import type { Prisma, PromoCode } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreditsService } from './credits.service.js';
import { AppError, badRequest, conflict } from '../common/errors.js';

type Db = PrismaService | Prisma.TransactionClient;

/** Un paiement en attente depuis moins d'une heure « réserve » le code ; au-delà il est considéré abandonné. */
const PENDING_HOLD_MS = 3_600_000;

export interface PromoQuote { promoId: string; code: string; percent: number; discountXof: number; finalXof: number }

/**
 * Codes promotionnels. Deux types :
 *  - PERCENT : remise sur un paiement (abonnement ou achat). Le montant est TOUJOURS recalculé ici, jamais lu du client.
 *  - TOKENS  : jetons Match offerts, une seule fois par membre (journal des crédits unique par code).
 * Un code ne s'utilise qu'une fois par membre ; le plafond global est vérifié sous verrou (aucun dépassement en concurrence).
 */
@Injectable()
export class PromoService {
  constructor(private readonly prisma: PrismaService, private readonly credits: CreditsService) {}

  private async load(db: Db, code: string): Promise<PromoCode> {
    const promo = await db.promoCode.findUnique({ where: { code } });
    const now = new Date();
    // Même réponse pour « inconnu », « désactivé » et « hors période » : pas d'énumération des codes.
    if (!promo || !promo.active || (promo.startsAt && promo.startsAt > now) || (promo.expiresAt && promo.expiresAt < now)) throw badRequest('PROMO_INVALID');
    return promo;
  }

  private lock(db: Db, promoId: string) {
    return (db as Prisma.TransactionClient).$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`promo:${promoId}`}, 0))`;
  }

  /** Paiements qui comptent pour ce code : réussis (ou remboursés) et en attente récents. */
  private usageWhere(promoId: string): Prisma.PaymentWhereInput {
    return { promoCodeId: promoId, OR: [{ status: { in: ['SUCCEEDED', 'REFUNDED'] } }, { status: 'PENDING', createdAt: { gt: new Date(Date.now() - PENDING_HOLD_MS) } }] };
  }

  /** Vérifie un code PERCENT pour ce membre et ce montant. Si `db` est une transaction, prend le verrou du code. */
  async evaluate(db: Db, userId: string, rawCode: string, amountXof: number, locked = false): Promise<PromoQuote> {
    const promo = await this.load(db, rawCode);
    if (promo.kind !== 'PERCENT' || !promo.percent) throw badRequest('PROMO_NOT_APPLICABLE');
    if (locked) await this.lock(db, promo.id);
    if (await db.payment.count({ where: { ...this.usageWhere(promo.id), userId } })) throw conflict('PROMO_ALREADY_USED');
    if (promo.maxRedemptions != null && (await db.payment.count({ where: this.usageWhere(promo.id) })) >= promo.maxRedemptions) throw conflict('PROMO_EXHAUSTED');
    const discountXof = Math.min(amountXof, Math.round((amountXof * promo.percent) / 100));
    return { promoId: promo.id, code: promo.code, percent: promo.percent, discountXof, finalXof: amountXof - discountXof };
  }

  /** Code TOUJOURS en jetons : crédite une seule fois par membre, dans une transaction verrouillée par code. */
  async redeemTokens(userId: string, rawCode: string): Promise<{ tokens: number }> {
    return this.prisma.$transaction(async (tx) => {
      const promo = await this.load(tx, rawCode);
      if (promo.kind !== 'TOKENS' || !promo.tokens) throw badRequest('PROMO_NOT_APPLICABLE');
      await this.lock(tx, promo.id);
      const ref = `promo:${promo.id}`;
      if (await tx.creditTransaction.count({ where: { userId, reason: 'PROMO', refId: ref } })) throw conflict('PROMO_ALREADY_USED');
      if (promo.maxRedemptions != null && (await tx.creditTransaction.count({ where: { reason: 'PROMO', refId: ref } })) >= promo.maxRedemptions) throw conflict('PROMO_EXHAUSTED');
      const ok = await this.credits.grant(tx, userId, 'MATCH_TOKEN', promo.tokens, 'PROMO', ref);
      if (!ok) throw new AppError(409, 'PROMO_ALREADY_USED');
      return { tokens: promo.tokens };
    });
  }

  /** Ce qu'un code offre à CE membre, sans rien réserver. Mêmes refus que l'utilisation réelle (invalide, déjà utilisé, épuisé). */
  async lookup(userId: string, rawCode: string): Promise<{ code: string; kind: 'PERCENT' | 'TOKENS'; percent?: number; tokens?: number }> {
    const promo = await this.load(this.prisma, rawCode);
    if (promo.kind === 'PERCENT') {
      await this.evaluate(this.prisma, userId, rawCode, 0);
      return { code: promo.code, kind: 'PERCENT', percent: promo.percent ?? 0 };
    }
    const ref = `promo:${promo.id}`;
    if (await this.prisma.creditTransaction.count({ where: { userId, reason: 'PROMO', refId: ref } })) throw conflict('PROMO_ALREADY_USED');
    if (promo.maxRedemptions != null && (await this.prisma.creditTransaction.count({ where: { reason: 'PROMO', refId: ref } })) >= promo.maxRedemptions) throw conflict('PROMO_EXHAUSTED');
    return { code: promo.code, kind: 'TOKENS', tokens: promo.tokens ?? 0 };
  }

  /** Utilisations d'un code (administration). */
  async usage(promo: PromoCode): Promise<number> {
    return promo.kind === 'TOKENS'
      ? this.prisma.creditTransaction.count({ where: { reason: 'PROMO', refId: `promo:${promo.id}` } })
      : this.prisma.payment.count({ where: this.usageWhere(promo.id) });
  }
}
