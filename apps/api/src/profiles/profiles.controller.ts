import {
  Body, Controller, Delete, Get, Header, HttpCode, Module, Param, Patch, Post, Put, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { locationSchema, preferenceSchema, profileUpdateSchema, type PreferenceInput, type ProfileUpdateInput } from '@duomatch/types';
import { CurrentUser, Public, type AuthUser } from '../common/auth.js';
import { badRequest, notFound } from '../common/errors.js';
import { zod } from '../common/zod.pipe.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageModule, StorageService } from '../storage/storage.service.js';
import { cardInclude, toCard } from './card.js';
import { ProfilesService } from './profiles.service.js';

const settingsSchema = z.object({
  visibility: z.enum(['VISIBLE', 'HIDDEN']).optional(),
  incognito: z.boolean().optional(),
  readReceipts: z.boolean().optional(),
});
const orderSchema = z.object({ ids: z.array(z.string()).min(1).max(10) });
const upload = () => FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
function need(file: Express.Multer.File | undefined) {
  if (!file) throw badRequest('FILE_REQUIRED', 'Fichier manquant');
  return file.buffer;
}

@ApiTags('profiles')
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService, private readonly prisma: PrismaService) {}

  @Get('me') me(@CurrentUser() u: AuthUser) { return this.profiles.getMine(u.id); }

  @Patch('me')
  update(@CurrentUser() u: AuthUser, @Body(zod(profileUpdateSchema)) body: ProfileUpdateInput) {
    return this.profiles.update(u.id, body);
  }

  @Put('me/preferences')
  prefs(@CurrentUser() u: AuthUser, @Body(zod(preferenceSchema)) body: PreferenceInput) {
    return this.profiles.savePreference(u.id, body);
  }

  @Patch('me/settings')
  async settings(@CurrentUser() u: AuthUser, @Body(zod(settingsSchema)) body: z.infer<typeof settingsSchema>) {
    if (body.visibility) await this.profiles.setVisibility(u.id, body.visibility);
    if (body.incognito !== undefined) await this.profiles.setIncognito(u.id, body.incognito);
    if (body.readReceipts !== undefined) await this.profiles.setReadReceipts(u.id, body.readReceipts);
    return this.profiles.getMine(u.id);
  }

  @Put('me/location')
  async location(@CurrentUser() u: AuthUser, @Body(zod(locationSchema)) body: { lat: number; lng: number }) {
    await this.profiles.setLocation(u.id, body.lat, body.lng);
    return { ok: true };
  }

  @Delete('me/location')
  async clearLocation(@CurrentUser() u: AuthUser) {
    await this.profiles.setLocation(u.id, null, null);
    return { ok: true };
  }

  @ApiConsumes('multipart/form-data') @Post('me/photos') @UseInterceptors(upload())
  addPhoto(@CurrentUser() u: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    return this.profiles.addPhoto(u.id, need(file));
  }

  @Put('me/photos/order')
  order(@CurrentUser() u: AuthUser, @Body(zod(orderSchema)) body: { ids: string[] }) {
    return this.profiles.reorderPhotos(u.id, body.ids);
  }

  @Delete('me/photos/:id')
  removePhoto(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.profiles.deletePhoto(u.id, id); }

  @HttpCode(200) @Post('me/onboarding/complete')
  complete(@CurrentUser() u: AuthUser) { return this.profiles.completeOnboarding(u.id); }

  @ApiConsumes('multipart/form-data') @Post('me/verification') @UseInterceptors(upload())
  verification(@CurrentUser() u: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    return this.profiles.requestVerification(u.id, need(file));
  }

  /** Profil complet d'un autre membre. Refusé si bloqué (dans un sens ou l'autre), suspendu ou masqué. */
  @Get(':userId')
  async view(@CurrentUser() u: AuthUser, @Param('userId') userId: string) {
    const [p, mine, block] = await Promise.all([
      this.prisma.profile.findFirst({
        where: { userId, user: { status: 'ACTIVE' } },
        include: cardInclude,
      }),
      this.prisma.userInterest.findMany({ where: { userId: u.id }, include: { interest: true } }),
      this.prisma.block.findFirst({ where: { OR: [{ blockerId: u.id, blockedId: userId }, { blockerId: userId, blockedId: u.id }] } }),
    ]);
    if (!p || block || (p.visibility === 'HIDDEN' && userId !== u.id)) throw notFound('PROFILE_NOT_FOUND');
    return toCard(p, { viewerInterests: mine.map((m) => m.interest.slug) });
  }
}

@Controller('media')
export class MediaController {
  constructor(private readonly storage: StorageService) {}

  /** Seules les photos de profil (clés aléatoires) sont publiques ; `private/` n'est jamais servi ici. */
  @Public() @Get('photos/:file')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  @Header('Content-Type', 'image/webp')
  async photo(@Param('file') file: string, @Res() res: Response) {
    if (!/^[a-f0-9]+(_t)?\.webp$/.test(file)) throw notFound(); // clé hex aléatoire, miniature = suffixe _t
    const data = await this.storage.get(`photos/${file}`);
    if (!data) throw notFound();
    res.end(data);
  }
}

@Module({ imports: [StorageModule], controllers: [ProfilesController, MediaController], providers: [ProfilesService], exports: [ProfilesService] })
export class ProfilesModule {}
