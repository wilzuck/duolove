import {
  CanActivate, createParamDecorator, ExecutionContext, Injectable, SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { getEnv } from '../config/env.js';
import { forbidden, unauthorized } from './errors.js';
import { sha256 } from './crypto.js';

export const SESSION_COOKIE = 'duomatch_sid';

export interface AuthUser {
  id: string;
  role: Role;
  email: string;
  emailVerified: boolean;
  sessionId: string;
}
export type AuthedRequest = Request & { user?: AuthUser };

export const Public = () => SetMetadata('isPublic', true);
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
/** Exige un e-mail vérifié (sauf si REQUIRE_EMAIL_VERIFICATION=false en dev). */
export const RequireVerified = () => SetMetadata('requireVerified', true);
export const CurrentUser = createParamDecorator((_d: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user!;
});

const ROLE_RANK: Record<Role, number> = { USER: 0, MODERATOR: 1, ADMIN: 2, SUPER_ADMIN: 3 };
export const hasRole = (role: Role, min: Role) => ROLE_RANK[role] >= ROLE_RANK[min];

/** Résout une session (cookie opaque → hash en base). Utilisé par le garde HTTP et par la passerelle WebSocket. */
export async function resolveSession(prisma: PrismaService, token: string | undefined) {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  const u = session.user;
  if (u.status === 'DELETED' || u.status === 'BANNED') return null;
  return { session, user: u };
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>('isPublic', targets)) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    const found = await resolveSession(this.prisma, token);
    if (!found) throw unauthorized();
    const { session, user } = found;

    // Un compte suspendu garde l'accès à /users/me et à la contestation, rien d'autre.
    if (user.status === 'SUSPENDED' && user.suspendedUntil && user.suspendedUntil < new Date()) {
      await this.prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE', suspendedUntil: null } });
      user.status = 'ACTIVE';
    }
    const allowSuspended = this.reflector.getAllAndOverride<boolean>('allowSuspended', targets);
    if (user.status === 'SUSPENDED' && !allowSuspended) throw forbidden('ACCOUNT_SUSPENDED');

    const roles = this.reflector.getAllAndOverride<Role[]>('roles', targets);
    if (roles && !roles.some((r) => hasRole(user.role, r))) throw forbidden('FORBIDDEN');

    const emailVerified = !!user.emailVerifiedAt;
    if (
      this.reflector.getAllAndOverride<boolean>('requireVerified', targets) &&
      getEnv().REQUIRE_EMAIL_VERIFICATION &&
      !emailVerified
    ) {
      throw forbidden('EMAIL_NOT_VERIFIED');
    }

    req.user = { id: user.id, role: user.role, email: user.email, emailVerified, sessionId: session.id };

    // Activité : écriture au plus toutes les 5 min pour ne pas charger la base.
    if (Date.now() - session.lastUsedAt.getTime() > 5 * 60_000) {
      void this.prisma.$transaction([
        this.prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } }),
        this.prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } }),
      ]).catch(() => undefined); // Silence assumé : un échec de mise à jour d'activité ne doit pas casser la requête.
    }
    return true;
  }
}

export const AllowSuspended = () => SetMetadata('allowSuspended', true);

/** Protection CSRF : un navigateur envoie toujours Origin sur une requête mutante ; on refuse une origine étrangère. */
export function csrfOriginCheck(req: Request, _res: unknown, next: (e?: unknown) => void) {
  const safe = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  const origin = req.headers.origin;
  if (!safe && origin && origin !== getEnv().APP_URL && !req.path.startsWith('/api/payments/webhook')) {
    return next(forbidden('CSRF_ORIGIN'));
  }
  next();
}
