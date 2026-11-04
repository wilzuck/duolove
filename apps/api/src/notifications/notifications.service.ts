import { Injectable } from '@nestjs/common';
import type { NotificationType, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../chat/realtime.gateway.js';
import { MailService } from '../mail/mail.service.js';
import { getEnv } from '../config/env.js';

const PREF_FIELD: Partial<Record<NotificationType, { inApp: 'inAppLikes' | 'inAppMatches' | 'inAppMessages'; email: 'emailLikes' | 'emailMatches' | 'emailMessages' }>> = {
  LIKE: { inApp: 'inAppLikes', email: 'emailLikes' },
  MATCH: { inApp: 'inAppMatches', email: 'emailMatches' },
  MESSAGE: { inApp: 'inAppMessages', email: 'emailMessages' },
};

const EMAIL_COPY: Partial<Record<NotificationType, [string, string]>> = {
  LIKE: ['Quelqu’un vous a liké sur DuoMatch', 'Une personne s’intéresse à vous. Ouvrez DuoMatch pour la découvrir.'],
  MATCH: ['C’est un match sur DuoMatch !', 'Vous avez un nouveau match. Dites-lui bonjour !'],
  MESSAGE: ['Nouveau message sur DuoMatch', 'Vous avez reçu un nouveau message.'],
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly mail: MailService,
  ) {}

  /** Crée la notification (selon les préférences), la pousse en temps réel et envoie l'e-mail si demandé. */
  async create(userId: string, type: NotificationType, data: Prisma.InputJsonObject = {}) {
    const prefs = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    const field = PREF_FIELD[type];
    const inApp = field ? (prefs?.[field.inApp] ?? true) : true;
    const email = field ? (prefs?.[field.email] ?? (type === 'MATCH')) : false;

    if (inApp) {
      const n = await this.prisma.notification.create({ data: { userId, type, data } });
      this.realtime.emitToUser(userId, 'notification:new', { id: n.id, type, createdAt: n.createdAt, data: type === 'LIKE' ? {} : data });
    }
    const copy = EMAIL_COPY[type];
    if (email && copy) {
      const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (u) await this.mail.send(u.email, copy[0], `${copy[1]}\n\n${getEnv().APP_URL}`);
    }
  }
}
