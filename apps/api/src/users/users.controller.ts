import { Body, Controller, Delete, Get, Header, HttpCode, Module, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import argon2 from 'argon2';
import { z } from 'zod';
import { AllowSuspended, CurrentUser, type AuthUser } from '../common/auth.js';
import { AppError, badRequest, unauthorized } from '../common/errors.js';
import { zod } from '../common/zod.pipe.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreditsService } from '../subscriptions/credits.service.js';
import { EntitlementsService } from '../subscriptions/entitlements.service.js';
import { StorageModule, StorageService } from '../storage/storage.service.js';
import { photoUrl, thumbKey } from '../profiles/profiles.service.js';

const deleteSchema = z.object({ password: z.string().max(128).optional(), confirm: z.literal('DELETE') });
const appealSchema = z.object({ text: z.string().trim().min(10).max(1000) });
const consentSchema = z.object({ marketingConsent: z.boolean() });

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService, private readonly ent: EntitlementsService, private readonly storage: StorageService, private readonly credits: CreditsService) {}

  @AllowSuspended() @Get('me')
  async me(@CurrentUser() u: AuthUser) {
    const [user, e, unread, moderation] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: u.id }, include: { profile: { include: { photos: { where: { moderationStatus: { not: 'REJECTED' } }, orderBy: { position: 'asc' }, take: 1 } } } } }),
      this.ent.get(u.id),
      this.prisma.notification.count({ where: { userId: u.id, readAt: null } }),
      this.prisma.moderationAction.findFirst({ where: { targetUserId: u.id, type: { in: ['SUSPEND', 'BAN'] } }, orderBy: { createdAt: 'desc' } }),
    ]);
    const photo = user.profile?.photos[0];
    return {
      id: user.id, email: user.email, emailVerified: !!user.emailVerifiedAt, role: user.role, status: user.status,
      suspendedUntil: user.suspendedUntil, marketingConsent: user.marketingConsent,
      profile: user.profile ? { displayName: user.profile.displayName, onboarded: !!user.profile.onboardedAt, completeness: user.profile.completeness, thumbUrl: photo ? photoUrl(thumbKey(photo.key)) : null } : null,
      entitlement: { plan: e.plan, validUntil: e.validUntil, limits: e.limits, credits: await this.credits.balances(u.id) },
      unreadNotifications: unread,
      moderation: user.status === 'SUSPENDED' && moderation ? { reason: moderation.reason, appealStatus: moderation.appealStatus, id: moderation.id } : null,
    };
  }

  @Post('me/consents') @HttpCode(200)
  async consents(@CurrentUser() u: AuthUser, @Body(zod(consentSchema)) body: { marketingConsent: boolean }) {
    await this.prisma.user.update({ where: { id: u.id }, data: body });
    return body;
  }

  /** Contestation d'une suspension : ouvre une demande de révision humaine. */
  @AllowSuspended() @Post('me/appeal') @HttpCode(200)
  async appeal(@CurrentUser() u: AuthUser, @Body(zod(appealSchema)) body: { text: string }) {
    const action = await this.prisma.moderationAction.findFirst({ where: { targetUserId: u.id, type: { in: ['SUSPEND', 'BAN'] } }, orderBy: { createdAt: 'desc' } });
    if (!action) throw badRequest('NO_SANCTION');
    if (action.appealStatus !== 'NONE') throw new AppError(409, 'APPEAL_ALREADY_SENT');
    await this.prisma.moderationAction.update({ where: { id: action.id }, data: { appealStatus: 'PENDING', appealText: body.text, appealedAt: new Date() } });
    return { ok: true };
  }

  /** Portabilité RGPD : toutes les données personnelles de l'utilisateur au format JSON. */
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @Get('me/export')
  @Header('Content-Disposition', 'attachment; filename="duomatch-export.json"')
  async export(@CurrentUser() u: AuthUser) {
    const [user, swipes, matches, messages, payments, notifications, sessions, blocks, reports] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: u.id }, include: { profile: true, preference: true, notificationPref: true, interests: { include: { interest: true } } } }),
      this.prisma.swipe.findMany({ where: { giverId: u.id } }),
      this.prisma.match.findMany({ where: { OR: [{ userAId: u.id }, { userBId: u.id }] } }),
      this.prisma.message.findMany({ where: { OR: [{ senderId: u.id }, { conversation: { match: { OR: [{ userAId: u.id }, { userBId: u.id }] } } }] }, orderBy: { createdAt: 'asc' }, select: { id: true, conversationId: true, senderId: true, body: true, createdAt: true, deletedAt: true } }),
      this.prisma.payment.findMany({ where: { userId: u.id }, include: { invoice: true } }),
      this.prisma.notification.findMany({ where: { userId: u.id } }),
      this.prisma.session.findMany({ where: { userId: u.id }, select: { id: true, userAgent: true, createdAt: true, lastUsedAt: true, revokedAt: true } }),
      this.prisma.block.findMany({ where: { blockerId: u.id } }),
      this.prisma.report.findMany({ where: { reporterId: u.id } }),
    ]);
    const { passwordHash: _p, ...account } = user;
    return { exportedAt: new Date().toISOString(), account, swipes, matches, messages, payments, notifications, sessions, blocks, reportsMade: reports };
  }

  /** Suppression du compte : anonymisation immédiate, sessions révoquées, photos effacées. */
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Delete('me')
  async remove(@CurrentUser() u: AuthUser, @Body(zod(deleteSchema)) body: { password?: string }) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id }, include: { profile: { include: { photos: true } } } });
    if (user.passwordHash && !(body.password && (await argon2.verify(user.passwordHash, body.password).catch(() => false)))) {
      throw unauthorized('INVALID_CREDENTIALS', 'Mot de passe incorrect');
    }
    const photos = user.profile?.photos ?? [];
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: u.id }, data: { status: 'DELETED', deletedAt: new Date(), email: `deleted+${u.id}@duomatch.invalid`, passwordHash: null, emailVerifiedAt: null, marketingConsent: false } }),
      this.prisma.account.deleteMany({ where: { userId: u.id } }),
      this.prisma.session.deleteMany({ where: { userId: u.id } }),
      this.prisma.verificationToken.deleteMany({ where: { userId: u.id } }),
      this.prisma.profilePhoto.deleteMany({ where: { profile: { userId: u.id } } }),
      this.prisma.userInterest.deleteMany({ where: { userId: u.id } }),
      this.prisma.profile.update({ where: { userId: u.id }, data: { displayName: 'Compte supprimé', bio: '', occupation: null, pronouns: null, visibility: 'HIDDEN', approxLat: null, approxLng: null } }),
      this.prisma.message.updateMany({ where: { senderId: u.id }, data: { body: '', deletedAt: new Date() } }),
      this.prisma.match.updateMany({ where: { OR: [{ userAId: u.id }, { userBId: u.id }], status: 'ACTIVE' }, data: { status: 'UNMATCHED', unmatchedById: u.id } }),
      this.prisma.subscription.updateMany({ where: { userId: u.id, status: { in: ['ACTIVE', 'PENDING', 'PAST_DUE'] } }, data: { status: 'CANCELED', cancelAtPeriodEnd: true } }),
    ]);
    await Promise.all(photos.flatMap((p) => [this.storage.delete(p.key), this.storage.delete(thumbKey(p.key))]));
    return { ok: true };
  }
}

@Module({ imports: [StorageModule], controllers: [UsersController] })
export class UsersModule {}
