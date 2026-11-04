import { CanActivate, ExecutionContext, Global, Injectable, Module, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_FLAGS, type FlagKey } from '@duomatch/types';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppError } from './errors.js';

const DEFAULTS = new Map<string, boolean>(FEATURE_FLAGS.map((f) => [f.key, f.defaultOn]));

/** Lecture directe (sans cache) : pour le code qui n'a pas accès au service Nest. Absence de ligne = valeur par défaut du catalogue. */
export async function readFlag(prisma: PrismaService, key: FlagKey): Promise<boolean> {
  const row = await prisma.featureFlag.findUnique({ where: { key }, select: { enabled: true } });
  return row?.enabled ?? DEFAULTS.get(key) ?? false;
}

export const featureOff = (key: string) => new AppError(503, 'FEATURE_DISABLED', 'Cette fonctionnalité est temporairement indisponible.', { flag: key });

/** Exige qu'une fonctionnalité soit activée par l'administration (refus 503 FEATURE_DISABLED sinon). */
export const RequireFlag = (key: FlagKey) => SetMetadata('requireFlag', key);

/** État des flags avec cache court (les modifications admin l'invalident immédiatement dans ce processus). */
@Injectable()
export class FlagsService {
  private cache: { at: number; map: Map<string, boolean> } | null = null;
  constructor(private readonly prisma: PrismaService) {}

  invalidate() { this.cache = null; }

  async all(): Promise<Record<FlagKey, boolean>> {
    if (!this.cache || Date.now() - this.cache.at > 10_000) {
      const rows = await this.prisma.featureFlag.findMany({ select: { key: true, enabled: true } });
      this.cache = { at: Date.now(), map: new Map(rows.map((r) => [r.key, r.enabled])) };
    }
    const { map } = this.cache;
    return Object.fromEntries(FEATURE_FLAGS.map((f) => [f.key, map.get(f.key) ?? f.defaultOn])) as Record<FlagKey, boolean>;
  }

  async isOn(key: FlagKey) { return (await this.all())[key]; }
  async assertOn(key: FlagKey) { if (!(await this.isOn(key))) throw featureOff(key); }
}

@Injectable()
export class FlagGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly flags: FlagsService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const key = this.reflector.getAllAndOverride<FlagKey | undefined>('requireFlag', [ctx.getHandler(), ctx.getClass()]);
    if (key) await this.flags.assertOn(key);
    return true;
  }
}

@Global()
@Module({ providers: [FlagsService], exports: [FlagsService] })
export class FlagsModule {}
