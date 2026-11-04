import { Injectable } from '@nestjs/common';
import { REFERRAL } from '@duomatch/types';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { FlagsService } from '../common/flags.js';

/** Alphabet sans caractères ambigus (0/O, 1/I/L) : le code se dicte facilement par téléphone ou WhatsApp. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: REFERRAL.CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

@Injectable()
export class ReferralService {
  constructor(private readonly prisma: PrismaService, private readonly flags: FlagsService) {}

  /** Code du membre, créé à la première demande (unicité garantie par la base, nouvel essai en cas de collision). */
  async codeFor(userId: string): Promise<string> {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { referralCode: true } });
    if (u.referralCode) return u.referralCode;
    for (let i = 0; i < 5; i++) {
      try {
        const code = makeCode();
        const r = await this.prisma.user.updateMany({ where: { id: userId, referralCode: null }, data: { referralCode: code } });
        if (r.count === 0) return (await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { referralCode: true } })).referralCode!;
        return code;
      } catch { /* collision d'unicité : nouveau tirage */ }
    }
    throw new Error('REFERRAL_CODE_GENERATION_FAILED');
  }

  /** Rattache un nouveau compte à son parrain. Code inconnu ou parrain inactif : ignoré sans erreur (pas d'énumération). */
  async attach(refereeId: string, rawCode: string | undefined): Promise<boolean> {
    const code = rawCode?.trim().toUpperCase();
    if (!code || !(await this.flags.isOn('referral_program'))) return false;
    const referrer = await this.prisma.user.findUnique({ where: { referralCode: code }, select: { id: true, status: true } });
    if (!referrer || referrer.status !== 'ACTIVE' || referrer.id === refereeId) return false;
    await this.prisma.referral.create({ data: { referrerId: referrer.id, refereeId } }).catch(() => undefined);
    return true;
  }

  async summary(userId: string) {
    const [code, rows, earned, mine] = await Promise.all([
      this.codeFor(userId),
      this.prisma.referral.groupBy({ by: ['status'], where: { referrerId: userId }, _count: true }),
      this.prisma.creditTransaction.aggregate({ where: { userId, reason: 'REFERRAL', refId: { startsWith: 'referral:' } }, _sum: { delta: true } }),
      this.prisma.referral.findUnique({ where: { refereeId: userId }, select: { status: true } }),
    ]);
    const n = (s: string) => rows.find((r) => r.status === s)?._count ?? 0;
    return {
      enabled: await this.flags.isOn('referral_program'), code, invited: n('PENDING') + n('REWARDED'), pending: n('PENDING'), rewarded: n('REWARDED'), tokensEarned: earned._sum.delta ?? 0,
      limits: { referrerTokens: REFERRAL.REFERRER_TOKENS, refereeTokens: REFERRAL.REFEREE_TOKENS, maxRewarded: REFERRAL.MAX_REWARDED_PER_REFERRER },
      referredBy: mine ? { status: mine.status } : null,
    };
  }
}
