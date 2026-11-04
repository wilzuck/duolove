import { Injectable } from '@nestjs/common';
import { CREDIT_TYPES, type CreditType } from '@duomatch/types';
import type { CreditReason, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppError } from '../common/errors.js';

type Db = PrismaService | Prisma.TransactionClient;

/**
 * Portefeuille de crédits (Super Likes, boosts). Le journal `CreditTransaction` est la référence :
 * (userId, reason, refId) est unique → une même opération (paiement, swipe, boost) ne s'applique jamais deux fois.
 * Le journal est écrit EN PREMIER (ON CONFLICT DO NOTHING, sûr dans une transaction) ; le solde ne bouge que si l'écriture est nouvelle.
 * Appelé dans une transaction : si l'action échoue, le crédit n'est pas consommé (retour arrière).
 */
@Injectable()
export class CreditsService {
  constructor(private readonly prisma: PrismaService) {}

  async balances(userId: string, db: Db = this.prisma): Promise<Record<CreditType, number>> {
    const rows = await db.creditWallet.findMany({ where: { userId } });
    const out = Object.fromEntries(CREDIT_TYPES.map((t) => [t, 0])) as Record<CreditType, number>;
    for (const r of rows) out[r.type as CreditType] = r.balance;
    return out;
  }

  /** @returns true si le crédit a été ajouté, false si cette opération avait déjà été appliquée. */
  async grant(db: Db, userId: string, type: CreditType, qty: number, reason: CreditReason, refId: string): Promise<boolean> {
    const r = await db.creditTransaction.createMany({ data: [{ userId, type, delta: qty, reason, refId }], skipDuplicates: true });
    if (r.count === 0) return false;
    await db.creditWallet.upsert({ where: { userId_type: { userId, type } }, create: { userId, type, balance: qty }, update: { balance: { increment: qty } } });
    return true;
  }

  /** Consomme `qty` crédits ; lève NO_CREDITS si le solde est insuffisant. Idempotent par `refId`. */
  async consume(db: Db, userId: string, type: CreditType, qty: number, refId: string): Promise<boolean> {
    const r = await db.creditTransaction.createMany({ data: [{ userId, type, delta: -qty, reason: 'CONSUME', refId }], skipDuplicates: true });
    if (r.count === 0) return false;
    const upd = await db.creditWallet.updateMany({ where: { userId, type, balance: { gte: qty } }, data: { balance: { decrement: qty } } });
    if (!upd.count) throw new AppError(403, 'NO_CREDITS', 'Crédits insuffisants');
    return true;
  }

  /** Retire des crédits suite à un remboursement : au plus ce qui reste (le déjà utilisé ne se reprend pas). @returns quantité retirée. */
  async reverse(db: Db, userId: string, type: CreditType, qty: number, refId: string): Promise<number> {
    const bal = (await db.creditWallet.findUnique({ where: { userId_type: { userId, type } } }))?.balance ?? 0;
    const x = Math.min(bal, qty);
    if (x <= 0) return 0;
    const r = await db.creditTransaction.createMany({ data: [{ userId, type, delta: -x, reason: 'REFUND', refId }], skipDuplicates: true });
    if (r.count === 0) return 0;
    const upd = await db.creditWallet.updateMany({ where: { userId, type, balance: { gte: x } }, data: { balance: { decrement: x } } });
    if (!upd.count) throw new AppError(409, 'CREDITS_CHANGED', 'Solde modifié pendant le remboursement');
    return x;
  }

  history(userId: string, take = 50) {
    return this.prisma.creditTransaction.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take });
  }
}
