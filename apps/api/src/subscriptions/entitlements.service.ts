import { Global, Injectable, Module } from '@nestjs/common';
import { limitsFromFeatures, type Limits, type PlanCode } from '@duomatch/types';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreditsService } from './credits.service.js';
import { PlanConfigService } from './plan-config.service.js';

export type { Limits };
export interface EffectiveEntitlement { plan: PlanCode; limits: Limits; validUntil: Date | null }

/**
 * Source de vérité serveur des droits, DÉRIVÉE de la configuration des offres (administrable).
 * Un abonnement expiré est traité comme gratuit immédiatement, sans attendre le job d'expiration.
 */
@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService, private readonly config: PlanConfigService) {}

  async get(userId: string): Promise<EffectiveEntitlement> {
    const e = await this.prisma.entitlement.findUnique({ where: { userId } });
    const active = e && e.plan !== 'FREE' && e.validUntil && e.validUntil > new Date();
    const plan: PlanCode = active ? e.plan : 'FREE';
    return { plan, limits: limitsFromFeatures(await this.config.featuresOf(plan)), validUntil: active ? e.validUntil : null };
  }

  async set(userId: string, plan: PlanCode, validUntil: Date | null) {
    await this.prisma.entitlement.upsert({ where: { userId }, create: { userId, plan, validUntil }, update: { plan, validUntil } });
  }
}

@Global()
@Module({ providers: [PlanConfigService, CreditsService, EntitlementsService], exports: [PlanConfigService, CreditsService, EntitlementsService] })
export class EntitlementsModule {}
