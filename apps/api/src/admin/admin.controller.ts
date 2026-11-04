import { Body, Controller, Get, Header, HttpCode, Module, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser, hasRole, Public, Roles, type AuthUser } from '../common/auth.js';
import { AppError, forbidden, notFound } from '../common/errors.js';
import { zod } from '../common/zod.pipe.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageModule, StorageService } from '../storage/storage.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ProfilesModule } from '../profiles/profiles.controller.js';
import { ProfilesService, thumbKey } from '../profiles/profiles.service.js';
import { PaymentsService } from '../subscriptions/payments.service.js';
import { RefundsService } from '../subscriptions/refunds.service.js';
import { PromoService } from '../subscriptions/promo.service.js';
import { promoCodeInput } from '@duomatch/types';
import { PlanConfigService } from '../subscriptions/plan-config.service.js';
import { planFeaturesSchema, DURATION_MONTHS, FEATURE_FLAGS, type FlagKey } from '@duomatch/types';
import { FlagsService } from '../common/flags.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.controller.js';
import type { Prisma } from '../generated/prisma/client.js';

const sanction = z.object({ reason: z.string().trim().min(3).max(500), days: z.number().int().min(1).max(365).optional(), reportId: z.string().optional() });
const resolve = z.object({ status: z.enum(['RESOLVED', 'DISMISSED', 'REVIEWING']), note: z.string().max(500).optional() });
const reasonOnly = z.object({ reason: z.string().trim().min(3).max(300) });
const review = z.object({ approve: z.boolean(), note: z.string().max(300).optional() });
const roleSchema = z.object({ role: z.enum(['USER', 'MODERATOR', 'ADMIN']) });
const promoCreate = z.object({
  code: promoCodeInput,
  kind: z.enum(['PERCENT', 'TOKENS']),
  percent: z.number().int().min(1).max(90).optional(),
  tokens: z.number().int().min(1).max(500).optional(),
  maxRedemptions: z.number().int().min(1).max(1_000_000).nullable().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
}).refine((d) => (d.kind === 'PERCENT' ? d.percent != null && d.tokens == null : d.tokens != null && d.percent == null), { message: 'kind_value_mismatch' })
  .refine((d) => !d.startsAt || !d.expiresAt || d.expiresAt > d.startsAt, { message: 'invalid_period' });
const promoPatch = z.object({
  active: z.boolean().optional(),
  maxRedemptions: z.number().int().min(1).max(1_000_000).nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
});
const planPatch = z.object({
  name: z.string().trim().min(2).max(40).optional(),
  priceXof: z.number().int().min(0).max(10_000_000).optional(),
  active: z.boolean().optional(),
  featured: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100).optional(),
  features: planFeaturesSchema.optional(),
  prices: z.array(z.object({ months: z.number().int().refine((m) => (DURATION_MONTHS as readonly number[]).includes(m)), discountPercent: z.number().int().min(0).max(90), amountOverride: z.number().int().min(0).nullable().optional(), active: z.boolean().optional() })).max(4).optional(),
});
const productPatch = z.object({ name: z.string().trim().min(2).max(60).optional(), priceXof: z.number().int().min(0).max(10_000_000).optional(), quantity: z.number().int().min(1).max(1000).optional(), active: z.boolean().optional(), sortOrder: z.number().int().min(0).max(100).optional() });
const refundCreate = z.object({ paymentId: z.string().min(1), reason: z.string().trim().min(5).max(500) });
const refundApprove = z.object({ note: z.string().trim().max(500).optional(), manual: z.boolean().optional() });
const refundReject = z.object({ note: z.string().trim().min(3).max(500) });
const flagSchema = z.object({ enabled: z.boolean() });

const page = (limit?: string) => Math.min(Math.max(parseInt(limit ?? '25', 10) || 25, 1), 100);
const cursorArgs = (cursor?: string): { cursor?: { id: string }; skip?: number } => (cursor ? { cursor: { id: cursor }, skip: 1 } : {});

@ApiTags('admin')
@Roles('MODERATOR')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly profiles: ProfilesService,
    private readonly payments: PaymentsService,
    private readonly config: PlanConfigService,
    private readonly refunds: RefundsService,
    private readonly promos: PromoService,
    private readonly flagsSvc: FlagsService,
  ) {}

  private audit(actorId: string, action: string, targetType?: string, targetId?: string, metadata: Prisma.InputJsonObject = {}) {
    return this.prisma.auditLog.create({ data: { actorId, action, targetType, targetId, metadata } });
  }

  // ───────── Vue d'ensemble ─────────
  @Roles('ADMIN') @Get('overview')
  async overview() {
    const now = new Date();
    const d = (n: number) => new Date(now.getTime() - n * 86_400_000);
    const [users, signups7, signups30, active7, completed, likes, matches, convs, subs, rev, rev30, paid, cohort, cohortActive, series] = await Promise.all([
      this.prisma.user.count({ where: { status: { not: 'DELETED' } } }),
      this.prisma.user.count({ where: { createdAt: { gte: d(7) } } }),
      this.prisma.user.count({ where: { createdAt: { gte: d(30) } } }),
      this.prisma.user.count({ where: { lastActiveAt: { gte: d(7) }, status: 'ACTIVE' } }),
      this.prisma.profile.count({ where: { completeness: { gte: 80 } } }),
      this.prisma.swipe.count({ where: { action: { in: ['LIKE', 'SUPER_LIKE'] } } }),
      this.prisma.match.count(),
      this.prisma.conversation.count({ where: { lastMessageAt: { gte: d(7) } } }),
      this.prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      this.prisma.payment.aggregate({ where: { status: 'SUCCEEDED' }, _sum: { amountXof: true } }),
      this.prisma.payment.aggregate({ where: { status: 'SUCCEEDED', paidAt: { gte: d(30) } }, _sum: { amountXof: true } }),
      this.prisma.payment.findMany({ where: { status: 'SUCCEEDED' }, distinct: ['userId'], select: { userId: true } }),
      this.prisma.user.count({ where: { createdAt: { gte: d(30), lt: d(7) } } }),
      this.prisma.user.count({ where: { createdAt: { gte: d(30), lt: d(7) }, lastActiveAt: { gte: d(7) } } }),
      this.prisma.$queryRaw<{ day: Date; count: bigint }[]>`SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count FROM "User" WHERE "createdAt" > now() - interval '14 days' GROUP BY 1 ORDER BY 1`,
    ]);
    const [plans, recent, byCountry] = await Promise.all([
      this.prisma.entitlement.groupBy({ by: ['plan'], _count: true }),
      this.prisma.user.findMany({ where: { status: { not: 'DELETED' } }, orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, createdAt: true, profile: { select: { displayName: true, city: true, country: true } } } }),
      this.prisma.profile.groupBy({ by: ['country'], _count: true, orderBy: { _count: { country: 'desc' } }, take: 6 }),
    ]);
    return {
      planDistribution: plans.map((p) => ({ plan: p.plan, count: p._count })),
      recentSignups: recent.map((u) => ({ id: u.id, displayName: u.profile?.displayName ?? '—', city: u.profile?.city ?? '', country: u.profile?.country ?? '', createdAt: u.createdAt })),
      refundedXof: (await this.prisma.refund.aggregate({ where: { status: 'COMPLETED' }, _sum: { amountXof: true } }))._sum.amountXof ?? 0,
      topCountries: byCountry.map((c) => ({ country: c.country, count: c._count })),
      users, signups7, signups30, active7, profilesCompleted: completed, likes, matches, activeConversations: convs, activeSubscriptions: subs,
      revenueXof: rev._sum.amountXof ?? 0, revenue30dXof: rev30._sum.amountXof ?? 0,
      conversionRate: users ? Math.round((paid.length / users) * 1000) / 10 : 0,
      retentionD7: cohort ? Math.round((cohortActive / cohort) * 1000) / 10 : 0,
      signupsPerDay: series.map((r) => ({ day: r.day.toISOString().slice(0, 10), count: Number(r.count) })),
    };
  }

  /** Compteurs de travail en attente (pastilles du menu) — modérateurs et plus. */
  @Get('badges')
  async badges() {
    const [reports, verifications, appeals] = await Promise.all([
      this.prisma.report.count({ where: { status: 'OPEN' } }),
      this.prisma.verificationRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.moderationAction.count({ where: { appealStatus: 'PENDING' } }),
    ]);
    return { reports, moderation: verifications + appeals, verifications, appeals };
  }

  // ───────── Utilisateurs ─────────
  @Get('users')
  async users(@CurrentUser() a: AuthUser, @Query('q') q?: string, @Query('status') status?: string, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    const take = page(limit);
    const where: Prisma.UserWhereInput = {
      ...(status && ['ACTIVE', 'SUSPENDED', 'BANNED', 'DELETED'].includes(status) ? { status: status as 'ACTIVE' } : {}),
      ...(q ? { OR: [{ profile: { displayName: { contains: q, mode: 'insensitive' } } }, { id: q }, ...(hasRole(a.role, 'ADMIN') ? [{ email: { contains: q, mode: 'insensitive' as const } }] : [])] } : {}),
    };
    const rows = await this.prisma.user.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: take + 1, ...cursorArgs(cursor), include: { profile: { select: { displayName: true, city: true, country: true, verified: true } }, entitlement: { select: { plan: true } }, _count: { select: { reportsAgainst: true } } } });
    return {
      items: rows.slice(0, take).map((u) => ({ id: u.id, displayName: u.profile?.displayName ?? '—', email: hasRole(a.role, 'ADMIN') ? u.email : null, role: u.role, status: u.status, city: u.profile?.city, country: u.profile?.country, verified: !!u.profile?.verified, plan: u.entitlement?.plan ?? 'FREE', reports: u._count.reportsAgainst, createdAt: u.createdAt, lastActiveAt: u.lastActiveAt })),
      nextCursor: rows.length > take ? rows[take - 1]!.id : null,
    };
  }

  @Get('users/:id')
  async user(@CurrentUser() a: AuthUser, @Param('id') id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, include: { profile: { include: { photos: true } }, moderationsOn: { orderBy: { createdAt: 'desc' }, take: 20 }, reportsAgainst: { orderBy: { createdAt: 'desc' }, take: 20 }, entitlement: true } });
    if (!u) throw notFound('USER_NOT_FOUND');
    return {
      id: u.id, email: hasRole(a.role, 'ADMIN') ? u.email : null, role: u.role, status: u.status, suspendedUntil: u.suspendedUntil, createdAt: u.createdAt, lastActiveAt: u.lastActiveAt, emailVerified: !!u.emailVerifiedAt,
      plan: u.entitlement?.plan ?? 'FREE',
      profile: u.profile ? { displayName: u.profile.displayName, bio: u.profile.bio, city: u.profile.city, country: u.profile.country, gender: u.profile.gender, verified: u.profile.verified, completeness: u.profile.completeness, photos: u.profile.photos.map((p) => ({ id: p.id, url: `/api/media/${p.key}`, status: p.moderationStatus })) } : null,
      moderation: u.moderationsOn, reports: u.reportsAgainst,
    };
  }

  /** Un modérateur ne peut pas sanctionner un rôle égal ou supérieur, ni lui-même. */
  private async guardTarget(actor: AuthUser, targetId: string) {
    const t = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!t) throw notFound('USER_NOT_FOUND');
    if (t.id === actor.id || (t.role !== 'USER' && !hasRole(actor.role, 'SUPER_ADMIN'))) throw forbidden('CANNOT_SANCTION_STAFF');
    return t;
  }

  @HttpCode(200) @Post('users/:id/suspend')
  async suspend(@CurrentUser() a: AuthUser, @Param('id') id: string, @Body(zod(sanction)) body: z.infer<typeof sanction>) {
    await this.guardTarget(a, id);
    const until = new Date(Date.now() + (body.days ?? 7) * 86_400_000);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { status: 'SUSPENDED', suspendedUntil: until } }),
      this.prisma.moderationAction.create({ data: { moderatorId: a.id, targetUserId: id, type: 'SUSPEND', reason: body.reason, expiresAt: until, reportId: body.reportId } }),
    ]);
    await this.audit(a.id, 'user.suspend', 'User', id, { days: body.days ?? 7 });
    await this.notifications.create(id, 'SECURITY_ALERT', { event: 'suspended' });
    return { ok: true };
  }

  @HttpCode(200) @Post('users/:id/ban')
  async ban(@CurrentUser() a: AuthUser, @Param('id') id: string, @Body(zod(sanction)) body: z.infer<typeof sanction>) {
    await this.guardTarget(a, id);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { status: 'BANNED' } }),
      this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
      this.prisma.profile.updateMany({ where: { userId: id }, data: { visibility: 'HIDDEN' } }),
      this.prisma.moderationAction.create({ data: { moderatorId: a.id, targetUserId: id, type: 'BAN', reason: body.reason, reportId: body.reportId } }),
    ]);
    await this.audit(a.id, 'user.ban', 'User', id);
    return { ok: true };
  }

  @HttpCode(200) @Post('users/:id/unsuspend')
  async unsuspend(@CurrentUser() a: AuthUser, @Param('id') id: string, @Body(zod(reasonOnly)) body: { reason: string }) {
    await this.guardTarget(a, id);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { status: 'ACTIVE', suspendedUntil: null } }),
      this.prisma.profile.updateMany({ where: { userId: id }, data: { visibility: 'VISIBLE' } }),
      this.prisma.moderationAction.create({ data: { moderatorId: a.id, targetUserId: id, type: 'UNSUSPEND', reason: body.reason } }),
    ]);
    await this.audit(a.id, 'user.unsuspend', 'User', id);
    return { ok: true };
  }

  @Roles('SUPER_ADMIN') @Patch('users/:id/role')
  async role(@CurrentUser() a: AuthUser, @Param('id') id: string, @Body(zod(roleSchema)) body: { role: 'USER' | 'MODERATOR' | 'ADMIN' }) {
    if (id === a.id) throw forbidden('CANNOT_CHANGE_SELF');
    await this.prisma.user.update({ where: { id }, data: { role: body.role } });
    await this.audit(a.id, 'user.role', 'User', id, { role: body.role });
    return { ok: true };
  }

  // ───────── Signalements ─────────
  @Get('reports')
  async reports(@Query('status') status = 'OPEN', @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    const take = page(limit);
    const rows = await this.prisma.report.findMany({
      where: { status: status as 'OPEN' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: take + 1, ...cursorArgs(cursor),
      include: { reporter: { select: { id: true, profile: { select: { displayName: true } } } }, target: { select: { id: true, status: true, profile: { select: { displayName: true } }, _count: { select: { reportsAgainst: true } } } } },
    });
    return {
      items: rows.slice(0, take).map((r) => ({ id: r.id, reason: r.reason, details: r.details, status: r.status, createdAt: r.createdAt, reporter: { id: r.reporter.id, displayName: r.reporter.profile?.displayName }, target: { id: r.target.id, displayName: r.target.profile?.displayName, status: r.target.status, totalReports: r.target._count.reportsAgainst } })),
      nextCursor: rows.length > take ? rows[take - 1]!.id : null,
    };
  }

  @HttpCode(200) @Post('reports/:id/resolve')
  async resolveReport(@CurrentUser() a: AuthUser, @Param('id') id: string, @Body(zod(resolve)) body: z.infer<typeof resolve>) {
    const r = await this.prisma.report.updateMany({ where: { id }, data: { status: body.status, resolvedById: a.id, resolvedAt: body.status === 'REVIEWING' ? null : new Date() } });
    if (!r.count) throw notFound('REPORT_NOT_FOUND');
    await this.audit(a.id, 'report.resolve', 'Report', id, { status: body.status, note: body.note ?? null });
    return { ok: true };
  }

  // ───────── Photos ─────────
  @Get('photos')
  async photos(@Query('status') status = 'APPROVED', @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    const take = page(limit);
    const rows = await this.prisma.profilePhoto.findMany({ where: { moderationStatus: status as 'APPROVED' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: take + 1, ...cursorArgs(cursor), include: { profile: { select: { userId: true, displayName: true } } } });
    return { items: rows.slice(0, take).map((p) => ({ id: p.id, url: `/api/media/${thumbKey(p.key)}`, status: p.moderationStatus, userId: p.profile.userId, displayName: p.profile.displayName, createdAt: p.createdAt })), nextCursor: rows.length > take ? rows[take - 1]!.id : null };
  }

  @HttpCode(200) @Post('photos/:id/reject')
  async rejectPhoto(@CurrentUser() a: AuthUser, @Param('id') id: string, @Body(zod(reasonOnly)) body: { reason: string }) {
    const p = await this.prisma.profilePhoto.findUnique({ where: { id }, include: { profile: true } });
    if (!p) throw notFound('PHOTO_NOT_FOUND');
    await this.prisma.$transaction([
      this.prisma.profilePhoto.update({ where: { id }, data: { moderationStatus: 'REJECTED', isPrimary: false } }),
      this.prisma.moderationAction.create({ data: { moderatorId: a.id, targetUserId: p.profile.userId, type: 'PHOTO_REJECT', reason: body.reason } }),
    ]);
    await this.storage.delete(p.key); await this.storage.delete(thumbKey(p.key));
    const rest = await this.prisma.profilePhoto.findMany({ where: { profileId: p.profileId, moderationStatus: { not: 'REJECTED' } }, orderBy: { position: 'asc' } });
    await this.prisma.$transaction(rest.map((x, i) => this.prisma.profilePhoto.update({ where: { id: x.id }, data: { position: i, isPrimary: i === 0 } })));
    await this.profiles.recompute(p.profile.userId);
    await this.audit(a.id, 'photo.reject', 'ProfilePhoto', id);
    return { ok: true };
  }

  // ───────── Vérification de profil ─────────
  @Get('verifications')
  async verifications(@Query('status') status = 'PENDING') {
    const rows = await this.prisma.verificationRequest.findMany({ where: { status: status as 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 100, include: { user: { select: { profile: { select: { displayName: true } } } } } });
    return rows.map((v) => ({ id: v.id, userId: v.userId, displayName: v.user.profile?.displayName, status: v.status, createdAt: v.createdAt }));
  }

  /** Le selfie est privé : servi seulement au personnel de modération. */
  @Get('verifications/:id/selfie')
  @Header('Content-Type', 'image/webp') @Header('Cache-Control', 'no-store')
  async selfie(@CurrentUser() a: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const v = await this.prisma.verificationRequest.findUnique({ where: { id } });
    const data = v ? await this.storage.get(v.selfieKey) : null;
    if (!data) throw notFound();
    await this.audit(a.id, 'verification.view', 'VerificationRequest', id);
    res.end(data);
  }

  @HttpCode(200) @Post('verifications/:id/review')
  async reviewVerification(@CurrentUser() a: AuthUser, @Param('id') id: string, @Body(zod(review)) body: z.infer<typeof review>) {
    const v = await this.prisma.verificationRequest.findUnique({ where: { id } });
    if (!v || v.status !== 'PENDING') throw notFound('VERIFICATION_NOT_FOUND');
    await this.prisma.$transaction([
      this.prisma.verificationRequest.update({ where: { id }, data: { status: body.approve ? 'APPROVED' : 'REJECTED', reviewedById: a.id, reviewedAt: new Date(), note: body.note } }),
      ...(body.approve ? [this.prisma.profile.update({ where: { userId: v.userId }, data: { verified: true } })] : []),
      this.prisma.moderationAction.create({ data: { moderatorId: a.id, targetUserId: v.userId, type: body.approve ? 'VERIFICATION_APPROVE' : 'VERIFICATION_REJECT', reason: body.note ?? (body.approve ? 'approved' : 'rejected') } }),
    ]);
    // Le selfie n'est plus nécessaire une fois la décision prise : minimisation des données.
    await this.storage.delete(v.selfieKey);
    if (body.approve) await this.notifications.create(v.userId, 'PROFILE_VERIFIED', {});
    await this.audit(a.id, 'verification.review', 'VerificationRequest', id, { approve: body.approve });
    return { ok: true };
  }

  // ───────── Contestations ─────────
  @Get('appeals')
  async appeals() {
    const rows = await this.prisma.moderationAction.findMany({ where: { appealStatus: 'PENDING' }, orderBy: { appealedAt: 'asc' }, include: { target: { select: { id: true, profile: { select: { displayName: true } } } } } });
    return rows.map((r) => ({ id: r.id, userId: r.targetUserId, displayName: r.target.profile?.displayName, type: r.type, reason: r.reason, appealText: r.appealText, appealedAt: r.appealedAt }));
  }

  @HttpCode(200) @Post('appeals/:id/decide')
  async decideAppeal(@CurrentUser() a: AuthUser, @Param('id') id: string, @Body(zod(review)) body: { approve: boolean; note?: string }) {
    const act = await this.prisma.moderationAction.findUnique({ where: { id } });
    if (!act || act.appealStatus !== 'PENDING') throw notFound('APPEAL_NOT_FOUND');
    await this.prisma.$transaction([
      this.prisma.moderationAction.update({ where: { id }, data: { appealStatus: body.approve ? 'ACCEPTED' : 'REJECTED' } }),
      ...(body.approve ? [this.prisma.user.update({ where: { id: act.targetUserId }, data: { status: 'ACTIVE', suspendedUntil: null } })] : []),
      this.prisma.moderationAction.create({ data: { moderatorId: a.id, targetUserId: act.targetUserId, type: body.approve ? 'APPEAL_ACCEPT' : 'APPEAL_REJECT', reason: body.note ?? '—' } }),
    ]);
    await this.audit(a.id, 'appeal.decide', 'ModerationAction', id, { approve: body.approve });
    return { ok: true };
  }

  // ───────── Finances (ADMIN) ─────────
  @Roles('ADMIN') @Get('subscriptions')
  async subscriptions(@Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    const take = page(limit);
    const rows = await this.prisma.subscription.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: take + 1, ...cursorArgs(cursor), include: { plan: { select: { code: true } }, user: { select: { email: true, profile: { select: { displayName: true } } } } } });
    return { items: rows.slice(0, take).map((s) => ({ id: s.id, userId: s.userId, displayName: s.user.profile?.displayName, plan: s.plan.code, status: s.status, currentPeriodEnd: s.currentPeriodEnd, cancelAtPeriodEnd: s.cancelAtPeriodEnd, provider: s.provider, createdAt: s.createdAt })), nextCursor: rows.length > take ? rows[take - 1]!.id : null };
  }

  @Roles('ADMIN') @Get('payments')
  async paymentsList(@Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    const take = page(limit);
    const rows = await this.prisma.payment.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: take + 1, ...cursorArgs(cursor), include: { invoice: { select: { number: true } }, refunds: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } }, user: { select: { profile: { select: { displayName: true } } } } } });
    return { items: rows.slice(0, take).map((p) => ({ refund: p.refunds[0]?.status ?? null, id: p.id, userId: p.userId, displayName: p.user.profile?.displayName, amountXof: p.amountXof, status: p.status, provider: p.provider, failureReason: p.failureReason, invoiceNumber: p.invoice?.number ?? null, createdAt: p.createdAt })), nextCursor: rows.length > take ? rows[take - 1]!.id : null };
  }

  // ───────── Remboursements (ADMIN) ─────────
  @Roles('ADMIN') @Get('refunds')
  refundsList(@Query('status') status?: string, @Query('cursor') cursor?: string, @Query('limit') limit?: string) { return this.refunds.list(status, cursor, page(limit)); }

  /** Création par un administrateur : nécessite l'approbation d'un AUTRE administrateur. */
  @Roles('ADMIN') @Post('refunds')
  async refundCreate(@CurrentUser() a: AuthUser, @Body(zod(refundCreate)) body: z.infer<typeof refundCreate>) {
    const r = await this.refunds.requestByAdmin(a.id, body.paymentId, body.reason);
    await this.audit(a.id, 'refund.request', 'Payment', body.paymentId, { refundId: r.id, amountXof: r.amountXof });
    return { id: r.id, status: r.status };
  }

  @Roles('ADMIN') @HttpCode(200) @Post('refunds/:id/approve')
  async refundApprove(@CurrentUser() a: AuthUser, @Param('id') id: string, @Body(zod(refundApprove)) body: z.infer<typeof refundApprove>) {
    const r = await this.refunds.approve(a.id, id, body);
    await this.audit(a.id, 'refund.approve', 'Refund', id, { result: r.status, manual: body.manual ?? false });
    return r;
  }

  @Roles('ADMIN') @HttpCode(200) @Post('refunds/:id/reject')
  async refundReject(@CurrentUser() a: AuthUser, @Param('id') id: string, @Body(zod(refundReject)) body: z.infer<typeof refundReject>) {
    const r = await this.refunds.reject(a.id, id, body.note);
    await this.audit(a.id, 'refund.reject', 'Refund', id, { note: body.note });
    return r;
  }

  @Roles('ADMIN') @HttpCode(200) @Post('jobs/expire-subscriptions')
  async expire(@CurrentUser() a: AuthUser) {
    const r = await this.payments.runExpiryJob();
    await this.audit(a.id, 'job.expire-subscriptions', undefined, undefined, r);
    return r;
  }

  // ───────── Offres, tarifs et produits (ADMIN) ─────────
  /**
   * Les modifications ne valent QUE pour les achats futurs : un abonnement ou un paiement existant garde sa durée et son montant
   * (le montant est figé sur `Payment`, la période sur `Subscription`).
   */
  @Roles('ADMIN') @Get('plans')
  async plans() {
    const [plans, products] = await Promise.all([
      this.prisma.subscriptionPlan.findMany({ include: { prices: { orderBy: { months: 'asc' } } }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.product.findMany({ orderBy: { sortOrder: 'asc' } }),
    ]);
    const catalog = await this.config.catalog();
    return { plans: plans.map((p) => ({ ...p, preview: catalog.find((c) => c.code === p.code)?.prices ?? [] })), products };
  }

  @Roles('ADMIN') @Patch('plans/:code')
  async patchPlan(@CurrentUser() a: AuthUser, @Param('code') code: string, @Body(zod(planPatch)) body: z.infer<typeof planPatch>) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { code: code as 'FREE' } });
    if (!plan) throw notFound('PLAN_NOT_FOUND');
    if (plan.code === 'FREE' && ((body.priceXof ?? 0) > 0 || body.active === false)) throw forbidden('FREE_PLAN_LOCKED', 'La formule gratuite ne peut ni être payante ni être désactivée');
    const { prices, ...data } = body;
    await this.prisma.$transaction([
      this.prisma.subscriptionPlan.update({ where: { id: plan.id }, data }),
      ...(prices ?? []).map((pr) => this.prisma.planPrice.upsert({
        where: { planId_months: { planId: plan.id, months: pr.months } },
        create: { planId: plan.id, months: pr.months, discountPercent: pr.discountPercent, amountOverride: pr.amountOverride ?? null, active: pr.active ?? true },
        update: { discountPercent: pr.discountPercent, amountOverride: pr.amountOverride ?? null, ...(pr.active === undefined ? {} : { active: pr.active }) },
      })),
    ]);
    this.config.invalidate();
    await this.audit(a.id, 'plan.update', 'SubscriptionPlan', plan.code, { before: { name: plan.name, priceXof: plan.priceXof, active: plan.active }, after: JSON.parse(JSON.stringify(body)) });
    return { ok: true };
  }

  @Roles('ADMIN') @Patch('products/:code')
  async patchProduct(@CurrentUser() a: AuthUser, @Param('code') code: string, @Body(zod(productPatch)) body: z.infer<typeof productPatch>) {
    const r = await this.prisma.product.updateMany({ where: { code }, data: body });
    if (!r.count) throw notFound('PRODUCT_NOT_FOUND');
    await this.audit(a.id, 'product.update', 'Product', code, JSON.parse(JSON.stringify(body)));
    return { ok: true };
  }

  // ───────── Codes promotionnels (ADMIN) ─────────
  @Roles('ADMIN') @Get('promos')
  async listPromos() {
    const rows = await this.prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
    return Promise.all(rows.map(async (r) => ({ ...r, used: await this.promos.usage(r) })));
  }

  @Roles('ADMIN') @Post('promos')
  async createPromo(@CurrentUser() a: AuthUser, @Body(zod(promoCreate)) body: z.infer<typeof promoCreate>) {
    if (await this.prisma.promoCode.findUnique({ where: { code: body.code } })) throw new AppError(409, 'PROMO_CODE_EXISTS');
    const p = await this.prisma.promoCode.create({ data: { code: body.code, kind: body.kind, percent: body.percent ?? null, tokens: body.tokens ?? null, maxRedemptions: body.maxRedemptions ?? null, startsAt: body.startsAt ?? null, expiresAt: body.expiresAt ?? null } });
    await this.audit(a.id, 'promo.create', 'PromoCode', p.code, { kind: p.kind, percent: p.percent, tokens: p.tokens, maxRedemptions: p.maxRedemptions });
    return p;
  }

  /** Le type et la valeur d'un code ne changent jamais (les paiements déjà remisés restent cohérents) : on le désactive et on en crée un autre. */
  @Roles('ADMIN') @Patch('promos/:id')
  async patchPromo(@CurrentUser() a: AuthUser, @Param('id') id: string, @Body(zod(promoPatch)) body: z.infer<typeof promoPatch>) {
    const r = await this.prisma.promoCode.updateMany({ where: { id }, data: body });
    if (!r.count) throw notFound('PROMO_NOT_FOUND');
    await this.audit(a.id, 'promo.update', 'PromoCode', id, JSON.parse(JSON.stringify(body)));
    return { ok: true };
  }

  // ───────── Paramètres ─────────
  @Roles('ADMIN') @Get('feature-flags')
  async flags() {
    const rows = await this.prisma.featureFlag.findMany();
    const by = new Map(rows.map((r) => [r.key, r]));
    // Catalogue fermé : on affiche toutes les fonctions pilotables, avec leur état réel (ligne absente = valeur par défaut).
    return FEATURE_FLAGS.map((f) => ({ key: f.key, category: f.category, emergency: f.emergency, defaultOn: f.defaultOn, enabled: by.get(f.key)?.enabled ?? f.defaultOn, overridden: by.has(f.key), updatedAt: by.get(f.key)?.updatedAt ?? null }));
  }

  @Roles('ADMIN') @Put('feature-flags/:key')
  async setFlag(@CurrentUser() a: AuthUser, @Param('key') key: string, @Body(zod(flagSchema)) body: z.infer<typeof flagSchema>) {
    if (!FEATURE_FLAGS.some((f) => f.key === key)) throw notFound('UNKNOWN_FLAG', 'Fonctionnalité inconnue');
    const before = await this.flagsSvc.isOn(key as FlagKey);
    const f = await this.prisma.featureFlag.upsert({ where: { key }, create: { key, enabled: body.enabled }, update: { enabled: body.enabled } });
    this.flagsSvc.invalidate();
    await this.audit(a.id, 'flag.set', 'FeatureFlag', key, { before, enabled: body.enabled });
    return { key, enabled: f.enabled };
  }

  @Roles('ADMIN') @Get('audit-logs')
  async auditLogs(@Query('cursor') cursor?: string, @Query('action') action?: string, @Query('limit') limit?: string) {
    const take = page(limit);
    const rows = await this.prisma.auditLog.findMany({ where: action ? { action } : {}, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: take + 1, ...cursorArgs(cursor), include: { actor: { select: { profile: { select: { displayName: true } } } } } });
    return { items: rows.slice(0, take).map((l) => ({ id: l.id, actorId: l.actorId, actor: l.actor?.profile?.displayName ?? null, action: l.action, targetType: l.targetType, targetId: l.targetId, metadata: l.metadata, createdAt: l.createdAt })), nextCursor: rows.length > take ? rows[take - 1]!.id : null };
  }
}

/** Drapeaux de fonctionnalité en lecture publique (le web masque/affiche selon l'état). */
@Controller('feature-flags')
export class PublicFlagsController {
  constructor(private readonly flags: FlagsService) {}
  @Public() @Get()
  list() { return this.flags.all(); }
}

@Module({ imports: [StorageModule, ProfilesModule, SubscriptionsModule], controllers: [AdminController, PublicFlagsController] })
export class AdminModule {}
