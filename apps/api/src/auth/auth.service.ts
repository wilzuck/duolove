import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import type { LoginInput, RegisterInput } from '@duomatch/types';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { badRequest, conflict, AppError, unauthorized } from '../common/errors.js';
import { hashIp, randomToken, sha256 } from '../common/crypto.js';
import { getEnv } from '../config/env.js';
import { computeCompleteness } from '../profiles/completeness.js';
import { CreditsService } from '../subscriptions/credits.service.js';
import { ReferralService } from '../referral/referral.service.js';
import { giftTokensIfEligible } from '../live/gift.js';

export interface ReqCtx { ip?: string; userAgent?: string }

const ARGON = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
// Hash factice : on vérifie toujours un mot de passe, même pour un e-mail inconnu (temps de réponse constant).
let dummyHash: Promise<string> | undefined;
const getDummy = () => (dummyHash ??= argon2.hash('dummy-password-for-timing', ARGON));

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly credits: CreditsService,
    private readonly referral: ReferralService,
  ) {}

  hashPassword(pw: string) {
    return argon2.hash(pw, ARGON);
  }

  async createSession(userId: string, ctx: ReqCtx) {
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + getEnv().SESSION_TTL_DAYS * 86_400_000);
    await this.prisma.session.create({
      data: { userId, tokenHash: sha256(token), expiresAt, userAgent: ctx.userAgent?.slice(0, 255), ipHash: hashIp(ctx.ip) },
    });
    return { token, expiresAt };
  }

  private async issueToken(userId: string, type: 'EMAIL_VERIFY' | 'PASSWORD_RESET', ttlMs: number) {
    await this.prisma.verificationToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } });
    const token = randomToken(32);
    await this.prisma.verificationToken.create({
      data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) },
    });
    return token;
  }

  async register(input: RegisterInput, ctx: ReqCtx) {
    const exists = await this.prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (exists) throw conflict('EMAIL_TAKEN', 'Cette adresse e-mail est déjà utilisée');
    const passwordHash = await this.hashPassword(input.password);
    const completeness = computeCompleteness({ bio: '', occupation: null, interestCount: 0, photoCount: 0, intent: 'UNSURE' });
    const user = await this.prisma.user.create({
      data: {
        email: input.email, passwordHash, acceptedTermsAt: new Date(),
        profile: { create: { displayName: input.displayName, birthDate: input.birthDate, gender: input.gender, country: input.country, city: input.city, completeness } },
        preference: { create: {} },
        notificationPref: { create: {} },
        entitlement: { create: {} },
      },
    });
    await this.referral.attach(user.id, input.referralCode);
    const token = await this.issueToken(user.id, 'EMAIL_VERIFY', 24 * 3_600_000);
    await this.mail.sendVerification(user.email, input.displayName, token);
    return { user, session: await this.createSession(user.id, ctx) };
  }

  async login(input: LoginInput, ctx: ReqCtx) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(429, 'ACCOUNT_LOCKED', 'Trop de tentatives. Réessayez dans quelques minutes.');
    }
    const hash = user?.passwordHash ?? (await getDummy());
    const ok = await argon2.verify(hash, input.password).catch(() => false);
    if (!user || !user.passwordHash || !ok || user.status === 'DELETED' || user.status === 'BANNED') {
      if (user && user.passwordHash) {
        const failed = user.failedLogins + 1;
        await this.prisma.user.update({
          where: { id: user.id },
          data: failed >= MAX_FAILED
            ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) }
            : { failedLogins: failed },
        });
      }
      throw unauthorized('INVALID_CREDENTIALS', 'E-mail ou mot de passe incorrect');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastActiveAt: new Date() } });
    return { user, session: await this.createSession(user.id, ctx) };
  }

  logout(sessionId: string) {
    return this.prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  }

  async verifyEmail(token: string) {
    const t = await this.prisma.verificationToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!t || t.type !== 'EMAIL_VERIFY' || t.usedAt || t.expiresAt < new Date()) {
      throw badRequest('INVALID_TOKEN', 'Lien invalide ou expiré');
    }
    await this.prisma.$transaction([
      this.prisma.verificationToken.update({ where: { id: t.id }, data: { usedAt: new Date() } }),
      this.prisma.user.update({ where: { id: t.userId }, data: { emailVerifiedAt: new Date() } }),
    ]);
    // Le profil peut déjà être complet : cadeau de profil et récompense de parrainage dépendent aussi de la vérification.
    await giftTokensIfEligible(this.prisma, this.credits, t.userId).catch(() => undefined);
  }

  async resendVerification(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
    if (!u || u.emailVerifiedAt) return;
    const token = await this.issueToken(u.id, 'EMAIL_VERIFY', 24 * 3_600_000);
    await this.mail.sendVerification(u.email, u.profile?.displayName ?? '', token);
  }

  /** Réponse identique que l'adresse existe ou non (pas d'énumération de comptes). */
  async forgotPassword(email: string) {
    const u = await this.prisma.user.findUnique({ where: { email }, include: { profile: true } });
    if (!u || u.status === 'DELETED' || u.status === 'BANNED') return;
    const token = await this.issueToken(u.id, 'PASSWORD_RESET', 3_600_000);
    await this.mail.sendPasswordReset(u.email, u.profile?.displayName ?? '', token);
  }

  async resetPassword(token: string, password: string) {
    const t = await this.prisma.verificationToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!t || t.type !== 'PASSWORD_RESET' || t.usedAt || t.expiresAt < new Date()) {
      throw badRequest('INVALID_TOKEN', 'Lien invalide ou expiré');
    }
    const passwordHash = await this.hashPassword(password);
    await this.prisma.$transaction([
      this.prisma.verificationToken.update({ where: { id: t.id }, data: { usedAt: new Date() } }),
      this.prisma.user.update({ where: { id: t.userId }, data: { passwordHash, failedLogins: 0, lockedUntil: null, emailVerifiedAt: new Date() } }),
      this.prisma.session.updateMany({ where: { userId: t.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.notifications.create(t.userId, 'SECURITY_ALERT', { event: 'password_reset' });
  }

  async changePassword(userId: string, current: string, next: string, keepSessionId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u?.passwordHash || !(await argon2.verify(u.passwordHash, current).catch(() => false))) {
      throw unauthorized('INVALID_CREDENTIALS', 'Mot de passe actuel incorrect');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await this.hashPassword(next) } }),
      this.prisma.session.updateMany({ where: { userId, revokedAt: null, id: { not: keepSessionId } }, data: { revokedAt: new Date() } }),
    ]);
    await this.notifications.create(userId, 'SECURITY_ALERT', { event: 'password_changed' });
  }

  /** Connexion Google : le jeton d'identité est vérifié auprès de Google (audience = notre client ID). */
  async google(
    idToken: string,
    extra: Partial<Pick<RegisterInput, 'birthDate' | 'gender' | 'country' | 'city'>> & { acceptTerms?: boolean },
    ctx: ReqCtx,
  ) {
    const clientId = getEnv().GOOGLE_CLIENT_ID;
    if (!clientId) throw new AppError(501, 'OAUTH_NOT_CONFIGURED', 'Connexion Google non configurée');
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!r.ok) throw unauthorized('INVALID_OAUTH_TOKEN');
    const p = (await r.json()) as { aud?: string; sub?: string; email?: string; email_verified?: string | boolean; name?: string };
    if (p.aud !== clientId || !p.sub || !p.email || String(p.email_verified) !== 'true') throw unauthorized('INVALID_OAUTH_TOKEN');
    const email = p.email.toLowerCase();

    const linked = await this.prisma.account.findUnique({
      where: { provider_providerAccountId: { provider: 'google', providerAccountId: p.sub } },
      include: { user: true },
    });
    let user = linked?.user ?? (await this.prisma.user.findUnique({ where: { email } })) ?? null;
    if (user && !linked) {
      await this.prisma.account.create({ data: { userId: user.id, provider: 'google', providerAccountId: p.sub } });
      if (!user.emailVerifiedAt) user = await this.prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    }
    if (!user) {
      if (!extra.birthDate || !extra.gender || !extra.country || !extra.city || !extra.acceptTerms) {
        throw new AppError(409, 'PROFILE_DETAILS_REQUIRED', 'Informations complémentaires requises');
      }
      const created = await this.prisma.user.create({
        data: {
          email, emailVerifiedAt: new Date(), acceptedTermsAt: new Date(),
          accounts: { create: { provider: 'google', providerAccountId: p.sub } },
          profile: { create: { displayName: (p.name ?? email.split('@')[0]!).slice(0, 40), birthDate: extra.birthDate, gender: extra.gender, country: extra.country, city: extra.city } },
          preference: { create: {} }, notificationPref: { create: {} }, entitlement: { create: {} },
        },
      });
      user = created;
    }
    if (user.status === 'DELETED' || user.status === 'BANNED') throw unauthorized('INVALID_CREDENTIALS');
    return { user, session: await this.createSession(user.id, ctx) };
  }
}
