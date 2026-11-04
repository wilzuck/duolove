import { Body, Controller, Delete, Get, HttpCode, Module, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { reportSchema } from '@duomatch/types';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../common/auth.js';
import { AppError, notFound } from '../common/errors.js';
import { zod } from '../common/zod.pipe.js';
import { PrismaService } from '../prisma/prisma.service.js';

@ApiTags('reports')
@Controller()
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @Post('reports')
  async report(@CurrentUser() u: AuthUser, @Body(zod(reportSchema)) body: z.infer<typeof reportSchema>) {
    if (body.targetId === u.id) throw new AppError(400, 'INVALID_TARGET');
    const target = await this.prisma.user.findUnique({ where: { id: body.targetId }, select: { id: true } });
    if (!target) throw notFound('USER_NOT_FOUND');
    await this.prisma.report.create({ data: { reporterId: u.id, targetId: body.targetId, reason: body.reason, details: body.details } });
    return { ok: true };
  }

  /** Bloquer : le profil disparaît de la découverte des deux côtés et le match éventuel est fermé. */
  @HttpCode(200) @Post('blocks/:userId')
  async block(@CurrentUser() u: AuthUser, @Param('userId') userId: string) {
    if (userId === u.id) throw new AppError(400, 'INVALID_TARGET');
    const target = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!target) throw notFound('USER_NOT_FOUND');
    const [a, b] = u.id < userId ? [u.id, userId] : [userId, u.id];
    await this.prisma.$transaction([
      this.prisma.block.upsert({ where: { blockerId_blockedId: { blockerId: u.id, blockedId: userId } }, create: { blockerId: u.id, blockedId: userId }, update: {} }),
      this.prisma.match.updateMany({ where: { userAId: a, userBId: b, status: 'ACTIVE' }, data: { status: 'UNMATCHED', unmatchedById: u.id } }),
    ]);
    return { ok: true };
  }

  @Delete('blocks/:userId')
  async unblock(@CurrentUser() u: AuthUser, @Param('userId') userId: string) {
    await this.prisma.block.deleteMany({ where: { blockerId: u.id, blockedId: userId } });
    return { ok: true };
  }

  @Get('blocks')
  async blocks(@CurrentUser() u: AuthUser) {
    const rows = await this.prisma.block.findMany({
      where: { blockerId: u.id }, orderBy: { createdAt: 'desc' },
      include: { blocked: { select: { id: true, profile: { select: { displayName: true } } } } },
    });
    return rows.map((r) => ({ userId: r.blockedId, displayName: r.blocked.profile?.displayName ?? '—', blockedAt: r.createdAt }));
  }
}

@Module({ controllers: [ReportsController] })
export class ReportsModule {}
