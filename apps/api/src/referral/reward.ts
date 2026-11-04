import { REFERRAL } from '@duomatch/types';
import type { CreditsService } from '../subscriptions/credits.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * Verse la récompense de parrainage UNE seule fois, quand le filleul est qualifié : profil 100 % + e-mail vérifié + compte actif.
 *  - le filleul reçoit REFEREE_TOKENS, le parrain REFERRER_TOKENS (dans la limite MAX_REWARDED_PER_REFERRER filleuls récompensés) ;
 *  - idempotent : la ligne `Referral` est « réclamée » (PENDING → REWARDED) de façon atomique, et le journal des crédits est unique.
 * @returns l'identifiant du parrain si une récompense vient d'être versée, sinon null.
 */
export async function rewardReferralIfEligible(prisma: PrismaService, credits: CreditsService, refereeId: string): Promise<string | null> {
  const ref = await prisma.referral.findUnique({ where: { refereeId } });
  if (!ref || ref.status !== 'PENDING') return null;
  const p = await prisma.profile.findUnique({ where: { userId: refereeId }, select: { completeness: true, user: { select: { emailVerifiedAt: true, status: true } } } });
  if (!p || p.completeness < 100 || !p.user.emailVerifiedAt || p.user.status !== 'ACTIVE') return null;

  const rewardedParrain = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`referral:${ref.referrerId}`}, 0))`;
    const claimed = await tx.referral.updateMany({ where: { id: ref.id, status: 'PENDING' }, data: { status: 'REWARDED', rewardedAt: new Date() } });
    if (claimed.count === 0) return null; // déjà versée par une autre requête
    await credits.grant(tx, refereeId, 'MATCH_TOKEN', REFERRAL.REFEREE_TOKENS, 'REFERRAL', 'referral-bonus');
    const done = await tx.referral.count({ where: { referrerId: ref.referrerId, status: 'REWARDED' } });
    const referrer = await tx.user.findUnique({ where: { id: ref.referrerId }, select: { status: true } });
    if (done > REFERRAL.MAX_REWARDED_PER_REFERRER || referrer?.status !== 'ACTIVE') return false; // plafond atteint ou parrain inactif : pas de jetons pour lui
    await credits.grant(tx, ref.referrerId, 'MATCH_TOKEN', REFERRAL.REFERRER_TOKENS, 'REFERRAL', `referral:${refereeId}`);
    return true;
  });
  if (rewardedParrain) await prisma.notification.create({ data: { userId: ref.referrerId, type: 'REFERRAL_REWARD', data: { tokens: REFERRAL.REFERRER_TOKENS } } });
  return rewardedParrain ? ref.referrerId : null;
}
