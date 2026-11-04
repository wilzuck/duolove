import { Body, Controller, Get, Global, Module, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../common/auth.js';
import { zod } from '../common/zod.pipe.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EntitlementsService } from '../subscriptions/entitlements.service.js';
import { NotificationsService } from './notifications.service.js';

const prefsSchema = z.object({
  inAppLikes: z.boolean(), inAppMatches: z.boolean(), inAppMessages: z.boolean(),
  emailLikes: z.boolean(), emailMatches: z.boolean(), emailMessages: z.boolean(),
  pushEnabled: z.boolean(),
}).partial();

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService, private readonly ent: EntitlementsService) {}

  @Get()
  async list(@CurrentUser() u: AuthUser, @Query('cursor') cursor?: string, @Query('limit') limit = '30') {
    const take = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 50);
    const rows = await this.prisma.notification.findMany({
      where: { userId: u.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const more = rows.length > take;
    const page = rows.slice(0, take);
    const { limits } = await this.ent.get(u.id);
    // Identité des likes masquée tant que la formule ne la donne pas (Super Like toujours visible).
    const items = page.map((n) => {
      const data = (n.data ?? {}) as Record<string, unknown>;
      const reveal = n.type !== 'LIKE' || limits.seeLikers || data.superLike === true;
      return { id: n.id, type: n.type, readAt: n.readAt, createdAt: n.createdAt, data: reveal ? data : {} };
    });
    return { items, nextCursor: more ? page[page.length - 1]!.id : null };
  }

  @Get('unread-count')
  async unread(@CurrentUser() u: AuthUser) {
    return { count: await this.prisma.notification.count({ where: { userId: u.id, readAt: null } }) };
  }

  @Post('read-all')
  async readAll(@CurrentUser() u: AuthUser) {
    await this.prisma.notification.updateMany({ where: { userId: u.id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  @Post(':id/read')
  async read(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId: u.id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  @Get('preferences')
  async getPrefs(@CurrentUser() u: AuthUser) {
    const p = await this.prisma.notificationPreference.upsert({ where: { userId: u.id }, create: { userId: u.id }, update: {} });
    const { id: _id, userId: _u, ...rest } = p;
    return rest;
  }

  @Put('preferences')
  async setPrefs(@CurrentUser() u: AuthUser, @Body(zod(prefsSchema)) body: z.infer<typeof prefsSchema>) {
    const p = await this.prisma.notificationPreference.upsert({ where: { userId: u.id }, create: { userId: u.id, ...body }, update: body });
    const { id: _id, userId: _u, ...rest } = p;
    return rest;
  }
}

@Global()
@Module({ controllers: [NotificationsController], providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
