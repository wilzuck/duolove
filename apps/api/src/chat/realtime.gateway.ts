import { Global, Logger, Module } from '@nestjs/common';
import {
  ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service.js';
import { resolveSession, SESSION_COOKIE } from '../common/auth.js';
import { getEnv } from '../config/env.js';

function parseCookie(header: string | undefined, name: string) {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/** Diffuse des événements temps réel vers la « salle » privée de chaque utilisateur (user:<id>). */
@WebSocketGateway({ cors: { origin: getEnv().APP_URL, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger('Realtime');
  /** Présence : nombre de sockets ouverts par membre (un seul processus ; plusieurs instances → adaptateur Redis, voir docs). */
  private readonly sockets = new Map<string, number>();
  /** Appelé à la connexion d'un membre (branchement du menu Match, sans dépendance circulaire). */
  onPresence?: (userId: string) => void;

  constructor(private readonly prisma: PrismaService) {}

  async handleConnection(client: Socket) {
    const token = parseCookie(client.handshake.headers.cookie, SESSION_COOKIE);
    const found = await resolveSession(this.prisma, token);
    if (!found || found.user.status !== 'ACTIVE') {
      client.disconnect(true);
      return;
    }
    client.data.userId = found.user.id;
    await client.join(`user:${found.user.id}`);
    const n = this.sockets.get(found.user.id) ?? 0;
    this.sockets.set(found.user.id, n + 1);
    if (n === 0) this.onPresence?.(found.user.id);
  }

  handleDisconnect(client: Socket) {
    const id = client.data.userId as string | undefined;
    if (!id) return;
    const n = (this.sockets.get(id) ?? 1) - 1;
    if (n <= 0) this.sockets.delete(id); else this.sockets.set(id, n);
  }

  onlineIds(): string[] { return [...this.sockets.keys()]; }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  /** Indicateur de saisie : relayé uniquement à l'autre membre d'un match actif. */
  @SubscribeMessage('typing')
  async onTyping(@ConnectedSocket() client: Socket, @MessageBody() body: { conversationId?: string; isTyping?: boolean }) {
    const userId = client.data.userId as string | undefined;
    if (!userId || typeof body?.conversationId !== 'string') return;
    const conv = await this.prisma.conversation.findUnique({
      where: { id: body.conversationId },
      include: { match: true },
    });
    if (!conv || conv.match.status !== 'ACTIVE') return;
    const { userAId, userBId } = conv.match;
    if (userId !== userAId && userId !== userBId) return;
    this.emitToUser(userId === userAId ? userBId : userAId, 'typing', {
      conversationId: conv.id,
      isTyping: !!body.isTyping,
    });
  }
}

@Global()
@Module({ providers: [RealtimeGateway], exports: [RealtimeGateway] })
export class RealtimeModule {}
