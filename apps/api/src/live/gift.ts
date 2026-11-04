import { LIVE } from '@duomatch/types';
import type { CreditsService } from '../subscriptions/credits.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { rewardReferralIfEligible } from '../referral/reward.js';

/** Référence fixe → le journal des crédits (userId, reason, refId unique) garantit un cadeau UNIQUE par compte. */
export const PROFILE_GIFT_REF = 'profile100';

/**
 * Offre les jetons Match une seule fois : profil complété à 100 % ET e-mail vérifié (limite les comptes jetables).
 * Idempotent : peut être appelé à chaque mise à jour du profil ou à chaque consultation.
 * @returns true si les jetons viennent d'être crédités.
 */
export async function giftTokensIfEligible(prisma: PrismaService, credits: CreditsService, userId: string): Promise<boolean> {
  const p = await prisma.profile.findUnique({ where: { userId }, select: { completeness: true, user: { select: { emailVerifiedAt: true, status: true } } } });
  if (!p || p.completeness < 100 || !p.user.emailVerifiedAt || p.user.status !== 'ACTIVE') return false;
  await rewardReferralIfEligible(prisma, credits, userId); // même condition de qualification que le cadeau de profil
  return prisma.$transaction((tx) => credits.grant(tx, userId, 'MATCH_TOKEN', LIVE.PROFILE_GIFT_TOKENS, 'GRANT_PROFILE', PROFILE_GIFT_REF));
}
