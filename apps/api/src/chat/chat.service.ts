import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ImagesService, StorageService } from '../storage/storage.service.js';
import { AppError, forbidden, notFound } from '../common/errors.js';
import { cuid } from '../common/ids.js';
import { photoUrl, thumbKey } from '../profiles/profiles.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { getEnv } from '../config/env.js';

const MSG_PER_MINUTE = 30;
const sendLog = new Map<string, number[]>();

/** Limiteur anti-spam par utilisateur (fenêtre glissante, en mémoire — à déplacer dans Redis en multi-instances). */
export function allowSend(userId: string, now = Date.now()): boolean {
  const recent = (sendLog.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= MSG_PER_MINUTE) { sendLog.set(userId, recent); return false; }
  recent.push(now);
  sendLog.set(userId, recent);
  return true;
}
export const resetSendLog = () => sendLog.clear();

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
    private readonly images: ImagesService,
  ) {}

  /** Charge la conversation et vérifie que `userId` en est membre (contrôle objet par objet). */
  async membership(userId: string, conversationId: string) {
    const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId }, include: { match: true } });
    if (!conv) throw notFound('CONVERSATION_NOT_FOUND');
    const { userAId, userBId } = conv.match;
    if (userId !== userAId && userId !== userBId) throw notFound('CONVERSATION_NOT_FOUND'); // 404 : ne révèle pas l'existence
    return { conv, otherId: userId === userAId ? userBId : userAId, active: conv.match.status === 'ACTIVE' };
  }

  private async assertCanSend(userId: string, otherId: string, active: boolean) {
    if (!active) throw forbidden('CONVERSATION_CLOSED', 'Cette conversation est fermée');
    const block = await this.prisma.block.findFirst({ where: { OR: [{ blockerId: userId, blockedId: otherId }, { blockerId: otherId, blockedId: userId }] } });
    if (block) throw forbidden('CONVERSATION_CLOSED', 'Cette conversation est fermée');
    const other = await this.prisma.user.findUnique({ where: { id: otherId }, select: { status: true } });
    if (!other || other.status !== 'ACTIVE') throw forbidden('CONVERSATION_CLOSED', 'Cette conversation est fermée');
  }

  private serialize(m: Prisma.MessageGetPayload<{ include: { attachments: true } }>, viewerId: string, readReceiptsOfReader: boolean) {
    const mine = m.senderId === viewerId;
    return {
      id: m.id, conversationId: m.conversationId, senderId: m.senderId, mine,
      body: m.deletedAt ? null : m.body, deleted: !!m.deletedAt, createdAt: m.createdAt,
      // Indicateur de lecture : exposé à l'expéditeur seulement si le lecteur l'autorise.
      readAt: mine && readReceiptsOfReader ? m.readAt : null,
      attachments: m.deletedAt ? [] : m.attachments.map((a) => ({ id: a.id, url: `${getEnv().API_URL}/api/conversations/attachments/${a.id}`, mime: a.mime })),
    };
  }

  async send(userId: string, conversationId: string, body: string) {
    const { conv, otherId, active } = await this.membership(userId, conversationId);
    await this.assertCanSend(userId, otherId, active);
    if (!allowSend(userId)) throw new AppError(429, 'RATE_LIMITED', 'Vous écrivez trop vite');
    return this.persist(userId, conv.id, otherId, body, []);
  }

  private async persist(userId: string, conversationId: string, otherId: string, body: string, attachments: Prisma.MessageAttachmentCreateWithoutMessageInput[]) {
    const m = await this.prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({ data: { conversationId, senderId: userId, body, attachments: { create: attachments } }, include: { attachments: true } });
      await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: msg.createdAt } });
      return msg;
    });
    const sender = await this.prisma.profile.findUnique({ where: { userId }, select: { readReceipts: true } });
    const forSender = this.serialize(m, userId, true);
    this.realtime.emitToUser(otherId, 'message:new', { ...this.serialize(m, otherId, sender?.readReceipts ?? true), fromUserId: userId });
    this.realtime.emitToUser(userId, 'message:new', forSender);
    await this.notifications.create(otherId, 'MESSAGE', { conversationId, fromUserId: userId });
    return forSender;
  }

  /** Image : le décodage serveur valide le format, supprime les métadonnées et redimensionne. */
  async sendImage(userId: string, conversationId: string, file: Buffer) {
    const { conv, otherId, active } = await this.membership(userId, conversationId);
    await this.assertCanSend(userId, otherId, active);
    if (!allowSend(userId)) throw new AppError(429, 'RATE_LIMITED', 'Vous écrivez trop vite');
    const img = await this.images.process(file);
    const key = `private/chat/${cuid()}.webp`;
    await this.storage.put(key, img.full);
    return this.persist(userId, conv.id, otherId, '', [{ key, mime: 'image/webp', size: img.full.length, moderationStatus: 'APPROVED' }]);
  }

  async attachment(userId: string, attachmentId: string) {
    const a = await this.prisma.messageAttachment.findUnique({ where: { id: attachmentId }, include: { message: { include: { conversation: { include: { match: true } } } } } });
    if (!a || a.message.deletedAt || a.moderationStatus === 'REJECTED') throw notFound();
    const { userAId, userBId } = a.message.conversation.match;
    if (userId !== userAId && userId !== userBId) throw notFound();
    const data = await this.storage.get(a.key);
    if (!data) throw notFound();
    return data;
  }

  async history(userId: string, conversationId: string, limit: number, cursor?: string) {
    const { conv, otherId } = await this.membership(userId, conversationId);
    const other = await this.prisma.profile.findUnique({ where: { userId: otherId }, select: { readReceipts: true } });
    const me = await this.prisma.profile.findUnique({ where: { userId }, select: { readReceipts: true } });
    const rows = await this.prisma.message.findMany({
      where: { conversationId: conv.id }, include: { attachments: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    // Mes messages : l'autre voit mes lectures selon MON réglage ; ses messages n'ont pas de readAt exposé.
    return {
      items: page.map((m) => this.serialize(m, userId, other?.readReceipts ?? true)).reverse(),
      nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
      readReceipts: me?.readReceipts ?? true,
    };
  }

  async markRead(userId: string, conversationId: string) {
    const { conv, otherId } = await this.membership(userId, conversationId);
    const r = await this.prisma.message.updateMany({ where: { conversationId: conv.id, senderId: otherId, readAt: null }, data: { readAt: new Date() } });
    const me = await this.prisma.profile.findUnique({ where: { userId }, select: { readReceipts: true } });
    if (r.count && me?.readReceipts) this.realtime.emitToUser(otherId, 'message:read', { conversationId: conv.id });
    return { read: r.count };
  }

  async deleteMessage(userId: string, messageId: string) {
    const m = await this.prisma.message.findUnique({ where: { id: messageId }, include: { conversation: { include: { match: true } } } });
    if (!m || m.senderId !== userId) throw notFound('MESSAGE_NOT_FOUND'); // seul l'auteur supprime
    await this.prisma.message.update({ where: { id: m.id }, data: { deletedAt: new Date(), body: '' } });
    const { userAId, userBId } = m.conversation.match;
    this.realtime.emitToUser(userId === userAId ? userBId : userAId, 'message:deleted', { conversationId: m.conversationId, messageId: m.id });
    return { ok: true };
  }

  /** Liste des conversations actives avec aperçu, non-lus et recherche (nom ou contenu des messages). */
  async list(userId: string, q?: string) {
    const term = q?.trim();
    const matches = await this.prisma.match.findMany({
      where: {
        status: 'ACTIVE', OR: [{ userAId: userId }, { userBId: userId }],
        // Pas de conversation avec un membre bloqué / suspendu.
        conversation: { isNot: null },
      },
      include: { conversation: true },
    });
    const otherIds = matches.map((m) => (m.userAId === userId ? m.userBId : m.userAId));
    const [profiles, blocks] = await Promise.all([
      this.prisma.profile.findMany({
        where: { userId: { in: otherIds }, user: { status: 'ACTIVE' } },
        include: { photos: { where: { moderationStatus: { not: 'REJECTED' } }, orderBy: { position: 'asc' }, take: 1 } },
      }),
      this.prisma.block.findMany({ where: { OR: [{ blockerId: userId, blockedId: { in: otherIds } }, { blockedId: userId, blockerId: { in: otherIds } }] } }),
    ]);
    const blocked = new Set(blocks.flatMap((b) => [b.blockerId, b.blockedId]));
    const byId = new Map(profiles.map((p) => [p.userId, p]));

    const matchedMessageConvs = term
      ? new Set((await this.prisma.message.findMany({
          where: { deletedAt: null, body: { contains: term, mode: 'insensitive' }, conversationId: { in: matches.map((m) => m.conversation!.id) } },
          select: { conversationId: true }, distinct: ['conversationId'],
        })).map((m) => m.conversationId))
      : null;

    const items = await Promise.all(matches.map(async (m) => {
      const otherId = m.userAId === userId ? m.userBId : m.userAId;
      const p = byId.get(otherId);
      if (!p || blocked.has(otherId)) return null;
      if (term && !p.displayName.toLowerCase().includes(term.toLowerCase()) && !matchedMessageConvs?.has(m.conversation!.id)) return null;
      const [last, unread] = await Promise.all([
        this.prisma.message.findFirst({ where: { conversationId: m.conversation!.id }, orderBy: { createdAt: 'desc' }, include: { attachments: { select: { id: true } } } }),
        this.prisma.message.count({ where: { conversationId: m.conversation!.id, senderId: otherId, readAt: null, deletedAt: null } }),
      ]);
      return {
        id: m.conversation!.id, matchId: m.id, createdAt: m.createdAt,
        user: { id: otherId, displayName: p.displayName, verified: p.verified, thumbUrl: p.photos[0] ? photoUrl(thumbKey(p.photos[0].key)) : null },
        lastMessage: last ? { body: last.deletedAt ? null : last.body, hasImage: last.attachments.length > 0, mine: last.senderId === userId, createdAt: last.createdAt } : null,
        unread,
        sortAt: (m.conversation!.lastMessageAt ?? m.createdAt).getTime(),
      };
    }));
    return items.filter((x) => x !== null).sort((a, b) => b.sortAt - a.sortAt).map(({ sortAt: _s, ...rest }) => rest);
  }
}
