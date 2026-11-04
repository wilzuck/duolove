import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { loginSchema, registerSchema, type LoginInput, type RegisterInput } from '@duomatch/types';
import { AllowSuspended, CurrentUser, Public, SESSION_COOKIE, type AuthUser } from '../common/auth.js';
import { zod } from '../common/zod.pipe.js';
import { getEnv, isProd } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppError, notFound } from '../common/errors.js';
import { AuthService } from './auth.service.js';

const strictLimit = { default: { limit: 10, ttl: 60_000 } };
const tokenSchema = z.object({ token: z.string().min(10).max(200) });
const emailSchema = z.object({ email: z.string().trim().toLowerCase().email() });
const resetSchema = z.object({
  token: z.string().min(10).max(200),
  password: registerSchema.shape.password,
});
const changePwSchema = z.object({ current: z.string().min(1).max(128), next: registerSchema.shape.password });
const googleSchema = z.object({
  idToken: z.string().min(10),
  birthDate: z.coerce.date().optional(),
  gender: registerSchema.shape.gender.optional(),
  country: registerSchema.shape.country.optional(),
  city: registerSchema.shape.city.optional(),
  acceptTerms: z.boolean().optional(),
});

function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: isProd(), path: '/', expires: expiresAt, domain: getEnv().COOKIE_DOMAIN,
  });
}
const ctxOf = (req: Request) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly prisma: PrismaService) {}

  @Public() @Throttle(strictLimit) @Post('register')
  async register(@Body(zod(registerSchema)) body: RegisterInput, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { user, session } = await this.auth.register(body, ctxOf(req));
    setSessionCookie(res, session.token, session.expiresAt);
    return { id: user.id, email: user.email, emailVerified: false };
  }

  @Public() @Throttle(strictLimit) @HttpCode(200) @Post('login')
  async login(@Body(zod(loginSchema)) body: LoginInput, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { user, session } = await this.auth.login(body, ctxOf(req));
    setSessionCookie(res, session.token, session.expiresAt);
    return { id: user.id, email: user.email, role: user.role, emailVerified: !!user.emailVerifiedAt };
  }

  @Public() @Throttle(strictLimit) @HttpCode(200) @Post('google')
  async google(@Body(zod(googleSchema)) body: z.infer<typeof googleSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { idToken, ...extra } = body;
    const { user, session } = await this.auth.google(idToken, extra, ctxOf(req));
    setSessionCookie(res, session.token, session.expiresAt);
    return { id: user.id, email: user.email, role: user.role, emailVerified: true };
  }

  @Public() @HttpCode(200) @Post('apple')
  apple() {
    // Apple Sign In nécessite un compte développeur Apple (clés à fournir) : volontairement non activé.
    throw new AppError(501, 'OAUTH_NOT_CONFIGURED', 'Connexion Apple non configurée');
  }

  @AllowSuspended() @HttpCode(200) @Post('logout')
  async logout(@CurrentUser() u: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(u.sessionId);
    res.clearCookie(SESSION_COOKIE, { path: '/', domain: getEnv().COOKIE_DOMAIN });
    return { ok: true };
  }

  @Public() @Throttle(strictLimit) @HttpCode(200) @Post('verify-email')
  async verify(@Body(zod(tokenSchema)) body: { token: string }) {
    await this.auth.verifyEmail(body.token);
    return { ok: true };
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } }) @HttpCode(200) @Post('resend-verification')
  async resend(@CurrentUser() u: AuthUser) {
    await this.auth.resendVerification(u.id);
    return { ok: true };
  }

  @Public() @Throttle({ default: { limit: 5, ttl: 60_000 } }) @HttpCode(202) @Post('forgot-password')
  async forgot(@Body(zod(emailSchema)) body: { email: string }) {
    await this.auth.forgotPassword(body.email);
    return { ok: true };
  }

  @Public() @Throttle(strictLimit) @HttpCode(200) @Post('reset-password')
  async reset(@Body(zod(resetSchema)) body: { token: string; password: string }) {
    await this.auth.resetPassword(body.token, body.password);
    return { ok: true };
  }

  @Throttle(strictLimit) @HttpCode(200) @Post('change-password')
  async change(@CurrentUser() u: AuthUser, @Body(zod(changePwSchema)) body: { current: string; next: string }) {
    await this.auth.changePassword(u.id, body.current, body.next, u.sessionId);
    return { ok: true };
  }

  @Get('sessions')
  async sessions(@CurrentUser() u: AuthUser) {
    const rows = await this.prisma.session.findMany({
      where: { userId: u.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
    });
    return rows.map((s) => ({ id: s.id, userAgent: s.userAgent, createdAt: s.createdAt, lastUsedAt: s.lastUsedAt, current: s.id === u.sessionId }));
  }

  @Delete('sessions/:id')
  async revoke(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const r = await this.prisma.session.updateMany({ where: { id, userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!r.count) throw notFound();
    return { ok: true };
  }
}
