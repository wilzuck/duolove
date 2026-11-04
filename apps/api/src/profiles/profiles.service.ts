import { Injectable } from '@nestjs/common';
import { ageFromBirthDate, INTEREST_SLUGS, type PreferenceInput, type ProfileUpdateInput } from '@duomatch/types';
import { cuid } from '../common/ids.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ImagesService, StorageService } from '../storage/storage.service.js';
import { EntitlementsService } from '../subscriptions/entitlements.service.js';
import { CreditsService } from '../subscriptions/credits.service.js';
import { giftTokensIfEligible } from '../live/gift.js';
import { badRequest, forbidden, notFound } from '../common/errors.js';
import { completenessLevel, computeCompleteness } from './completeness.js';
import type { Prisma } from '../generated/prisma/client.js';
import { getEnv } from '../config/env.js';

export const MAX_PHOTOS = 6;
export const photoUrl = (key: string) => `${getEnv().API_URL}/api/media/${key}`;
export const thumbKey = (key: string) => key.replace(/\.webp$/, '_t.webp');

@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly images: ImagesService,
    private readonly ent: EntitlementsService,
    private readonly credits: CreditsService,
  ) {}

  async ensureInterests() {
    await this.prisma.interest.createMany({ data: INTEREST_SLUGS.map((slug) => ({ slug })), skipDuplicates: true });
  }

  async getMine(userId: string) {
    const p = await this.prisma.profile.findUnique({
      where: { userId },
      include: { photos: { where: { moderationStatus: { not: 'REJECTED' } }, orderBy: { position: 'asc' } }, user: { include: { interests: { include: { interest: true } }, preference: true } } },
    });
    if (!p) throw notFound('PROFILE_NOT_FOUND');
    const pending = await this.prisma.verificationRequest.findFirst({ where: { userId, status: 'PENDING' } });
    return {
      id: p.userId, hasChildren: p.hasChildren, likesPets: p.likesPets, living: p.living, heightCm: p.heightCm, originCountry: p.originCountry, liveOptIn: p.liveOptIn, displayName: p.displayName, birthDate: p.birthDate, age: ageFromBirthDate(p.birthDate), gender: p.gender,
      pronouns: p.pronouns, country: p.country, city: p.city, bio: p.bio, occupation: p.occupation, languages: p.languages,
      intent: p.intent, visibility: p.visibility, incognito: p.incognito, verified: p.verified, verificationPending: !!pending,
      readReceipts: p.readReceipts, boostedUntil: p.boostedUntil, completeness: p.completeness, completenessLevel: completenessLevel(p.completeness),
      onboarded: !!p.onboardedAt,
      interests: p.user.interests.map((x) => x.interest.slug),
      photos: p.photos.map((x) => ({ id: x.id, url: photoUrl(x.key), thumbUrl: photoUrl(thumbKey(x.key)), isPrimary: x.isPrimary, position: x.position })),
      preference: p.user.preference
        ? { seeking: p.user.preference.seeking, ageMin: p.user.preference.ageMin, ageMax: p.user.preference.ageMax, country: p.user.preference.country, city: p.user.preference.city, intents: p.user.preference.intents, languages: p.user.preference.languages, interests: p.user.preference.interests, verifiedOnly: p.user.preference.verifiedOnly, activeRecently: p.user.preference.activeRecently, maxDistanceKm: p.user.preference.maxDistanceKm }
        : null,
    };
  }

  async recompute(userId: string) {
    const p = await this.prisma.profile.findUnique({
      where: { userId },
      include: { photos: { where: { moderationStatus: { not: 'REJECTED' } } }, user: { include: { _count: { select: { interests: true } } } } },
    });
    if (!p) return;
    const completeness = computeCompleteness({ bio: p.bio, occupation: p.occupation, interestCount: p.user._count.interests, photoCount: p.photos.length, intent: p.intent });
    await this.prisma.profile.update({ where: { userId }, data: { completeness } });
    // 100 % → jetons Match offerts une seule fois (idempotent, voir live/gift.ts).
    if (completeness >= 100) await giftTokensIfEligible(this.prisma, this.credits, userId);
  }

  async update(userId: string, input: ProfileUpdateInput) {
    const { interests, ...rest } = input;
    const data: Prisma.ProfileUpdateInput = { ...rest };
    await this.prisma.$transaction(async (tx) => {
      await tx.profile.update({ where: { userId }, data });
      if (interests) {
        await this.ensureInterests();
        const rows = await tx.interest.findMany({ where: { slug: { in: interests } } });
        await tx.userInterest.deleteMany({ where: { userId } });
        await tx.userInterest.createMany({ data: rows.map((r) => ({ userId, interestId: r.id })) });
      }
    });
    await this.recompute(userId);
    return this.getMine(userId);
  }

  async setVisibility(userId: string, visibility: 'VISIBLE' | 'HIDDEN') {
    await this.prisma.profile.update({ where: { userId }, data: { visibility } });
  }

  async setIncognito(userId: string, incognito: boolean) {
    const { limits } = await this.ent.get(userId);
    if (incognito && !limits.incognito) throw forbidden('PLAN_REQUIRED', 'Le mode discret est réservé à la formule VIP');
    await this.prisma.profile.update({ where: { userId }, data: { incognito } });
  }

  async setReadReceipts(userId: string, readReceipts: boolean) {
    await this.prisma.profile.update({ where: { userId }, data: { readReceipts } });
  }

  async savePreference(userId: string, input: PreferenceInput) {
    const { limits } = await this.ent.get(userId);
    const premiumRequested = !!(input.languages?.length || input.interests?.length || input.verifiedOnly || input.activeRecently || input.maxDistanceKm);
    // Les filtres avancés ne sont enregistrés que si la formule les inclut (contrôle serveur).
    if (premiumRequested && !limits.advancedFilters) throw forbidden('PLAN_REQUIRED', 'Filtres avancés réservés à Premium');
    const data = {
      seeking: input.seeking, ageMin: input.ageMin, ageMax: input.ageMax, country: input.country ?? null, city: input.city ?? null,
      intents: input.intents ?? [], languages: input.languages ?? [], interests: input.interests ?? [],
      verifiedOnly: input.verifiedOnly ?? false, activeRecently: input.activeRecently ?? false, maxDistanceKm: input.maxDistanceKm ?? null,
    };
    await this.prisma.preference.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    return this.getMine(userId);
  }

  async completeOnboarding(userId: string) {
    const p = await this.prisma.profile.findUnique({ where: { userId }, include: { photos: { where: { moderationStatus: { not: 'REJECTED' } } } } });
    if (!p) throw notFound('PROFILE_NOT_FOUND');
    if (p.photos.length < 1) throw badRequest('PHOTO_REQUIRED', 'Ajoutez au moins une photo');
    await this.prisma.profile.update({ where: { userId }, data: { onboardedAt: p.onboardedAt ?? new Date() } });
    return this.getMine(userId);
  }

  // ───────── Photos ─────────
  async addPhoto(userId: string, file: Buffer) {
    const profile = await this.prisma.profile.findUnique({ where: { userId }, include: { photos: { where: { moderationStatus: { not: 'REJECTED' } } } } });
    if (!profile) throw notFound('PROFILE_NOT_FOUND');
    if (profile.photos.length >= MAX_PHOTOS) throw badRequest('PHOTO_LIMIT', `Maximum ${MAX_PHOTOS} photos`);
    const img = await this.images.process(file);
    const key = `photos/${cuid()}.webp`;
    await this.storage.put(key, img.full);
    await this.storage.put(thumbKey(key), img.thumb);
    const first = profile.photos.length === 0;
    // Pas de détecteur de contenu automatique branché : la photo est publiée puis relue par la modération (signalements + file admin).
    await this.prisma.profilePhoto.create({
      data: { profileId: profile.id, key, width: img.width, height: img.height, position: profile.photos.length, isPrimary: first, moderationStatus: 'APPROVED' },
    });
    await this.recompute(userId);
    return this.getMine(userId);
  }

  private async ownPhoto(userId: string, photoId: string) {
    const photo = await this.prisma.profilePhoto.findUnique({ where: { id: photoId }, include: { profile: true } });
    if (!photo || photo.profile.userId !== userId) throw notFound('PHOTO_NOT_FOUND');
    return photo;
  }

  async deletePhoto(userId: string, photoId: string) {
    const photo = await this.ownPhoto(userId, photoId);
    await this.prisma.profilePhoto.delete({ where: { id: photo.id } });
    await this.storage.delete(photo.key);
    await this.storage.delete(thumbKey(photo.key));
    const rest = await this.prisma.profilePhoto.findMany({ where: { profileId: photo.profileId }, orderBy: { position: 'asc' } });
    await this.prisma.$transaction(rest.map((p, i) => this.prisma.profilePhoto.update({ where: { id: p.id }, data: { position: i, isPrimary: i === 0 } })));
    await this.recompute(userId);
    return this.getMine(userId);
  }

  /** Réorganisation : la première photo de la liste devient la photo principale. */
  async reorderPhotos(userId: string, ids: string[]) {
    const profile = await this.prisma.profile.findUnique({ where: { userId }, include: { photos: true } });
    if (!profile) throw notFound('PROFILE_NOT_FOUND');
    const own = new Set(profile.photos.map((p) => p.id));
    if (ids.length !== own.size || !ids.every((id) => own.has(id))) throw badRequest('INVALID_ORDER');
    await this.prisma.$transaction(ids.map((id, i) => this.prisma.profilePhoto.update({ where: { id }, data: { position: i, isPrimary: i === 0 } })));
    return this.getMine(userId);
  }

  async requestVerification(userId: string, selfie: Buffer) {
    const open = await this.prisma.verificationRequest.findFirst({ where: { userId, status: 'PENDING' } });
    if (open) throw badRequest('VERIFICATION_PENDING', 'Une demande est déjà en cours');
    const img = await this.images.process(selfie);
    const key = `private/verifications/${cuid()}.webp`;
    await this.storage.put(key, img.full);
    await this.prisma.verificationRequest.create({ data: { userId, selfieKey: key } });
    return { ok: true };
  }

  /** Localisation opt-in, arrondie à 0,1° (~11 km) AVANT stockage : le GPS précis n'est jamais conservé. */
  async setLocation(userId: string, lat: number | null, lng: number | null) {
    const r = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);
    await this.prisma.profile.update({ where: { userId }, data: { approxLat: r(lat), approxLng: r(lng) } });
  }
}
