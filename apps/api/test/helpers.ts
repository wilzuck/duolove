import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import sharp from 'sharp';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/main.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { MailService } from '../src/mail/mail.service.js';
import type { Gender, Seeking } from '../src/generated/prisma/enums.js';

export const PASSWORD = 'Duomio-Test-2026!';
export const uid = () => randomBytes(4).toString('hex');

export async function boot() {
  const app = await createApp();
  await app.init();
  return { app, prisma: app.get(PrismaService), mail: app.get(MailService), http: app.getHttpServer() as Parameters<typeof request>[0] };
}

export const jpeg = () => sharp({ create: { width: 500, height: 600, channels: 3, background: '#e91e63' } }).jpeg().toBuffer();

export type Agent = ReturnType<typeof request.agent>;
export const agentFor = (http: Parameters<typeof request>[0]) => request.agent(http);

let passwordHash: Promise<string> | undefined;

/** Crée directement en base un membre complet et éligible à la découverte (rapide, sans HTTP). */
export async function seedMember(
  prisma: PrismaService,
  o: { name?: string; gender: Gender; seeking: Seeking; city: string; age?: number; country?: string; verified?: boolean; intent?: 'SERIOUS' | 'DATING' | 'FRIENDSHIP' | 'MARRIAGE' | 'UNSURE' },
) {
  const hash = await (passwordHash ??= argon2.hash(PASSWORD, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }));
  const age = o.age ?? 28;
  const birth = new Date();
  birth.setUTCFullYear(birth.getUTCFullYear() - age - 1);
  const email = `m-${uid()}-${uid()}@test.duomatch`;
  const user = await prisma.user.create({
    data: {
      email, passwordHash: hash, emailVerifiedAt: new Date(), acceptedTermsAt: new Date(),
      profile: { create: { displayName: o.name ?? `Membre ${uid()}`, birthDate: birth, gender: o.gender, country: o.country ?? 'TG', city: o.city, intent: o.intent ?? 'SERIOUS', completeness: 70, verified: o.verified ?? false, onboardedAt: new Date(), bio: 'Bio de test suffisamment longue pour compter.' } },
      preference: { create: { seeking: o.seeking, ageMin: 18, ageMax: 99, city: o.city, country: o.country ?? 'TG' } },
      notificationPref: { create: {} }, entitlement: { create: {} },
    },
    include: { profile: true },
  });
  await prisma.profilePhoto.create({ data: { profileId: user.profile!.id, key: `photos/${uid()}${uid()}.webp`, width: 500, height: 600, isPrimary: true, moderationStatus: 'APPROVED' } });
  return { id: user.id, email };
}

export async function login(http: Parameters<typeof request>[0], email: string) {
  const a = request.agent(http);
  const r = await a.post('/api/auth/login').send({ email, password: PASSWORD });
  if (r.status !== 200) throw new Error(`login failed ${r.status} ${JSON.stringify(r.body)}`);
  return a;
}

export type App = INestApplication;
