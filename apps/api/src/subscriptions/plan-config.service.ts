import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  DEFAULT_DISCOUNTS, DEFAULT_PLANS, DEFAULT_PRODUCTS, DURATION_MONTHS, PLAN_CODES, planFeaturesSchema, priceForDuration, type PlanCode, type PlanFeatures,
} from '@duomatch/types';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { badRequest, notFound } from '../common/errors.js';

export interface PriceOption { months: number; discountPercent: number; totalXof: number; monthlyEquivalentXof: number; savingsXof: number }
export interface PlanView {
  code: PlanCode; name: string; priceXof: number; currency: string; features: PlanFeatures; featured: boolean; sortOrder: number; prices: PriceOption[];
}

const TTL = 15_000;

/**
 * Source unique de la configuration commerciale (offres, fonctionnalités, durées, remises, produits).
 * Les valeurs par défaut ne sont écrites QUE si elles manquent : une modification d'administrateur n'est jamais écrasée.
 */
@Injectable()
export class PlanConfigService implements OnModuleInit {
  private cache: { at: number; plans: Map<PlanCode, PlanView> } | null = null;
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() { await this.ensureDefaults(); }

  invalidate() { this.cache = null; }

  async ensureDefaults() {
    for (const code of PLAN_CODES) {
      const d = DEFAULT_PLANS[code];
      const plan = await this.prisma.subscriptionPlan.upsert({
        where: { code },
        create: { code, name: d.name, priceXof: d.priceXof, features: d.features, featured: d.featured, sortOrder: d.sortOrder },
        update: {},
      });
      // Migration unique des anciennes lignes (ancien format de droits) vers les fonctionnalités configurables.
      if (!planFeaturesSchema.safeParse(plan.features).success) {
        await this.prisma.subscriptionPlan.update({ where: { id: plan.id }, data: { features: d.features, featured: d.featured, sortOrder: d.sortOrder } });
      }
      // Nouvelles fonctionnalités : on AJOUTE les clés absentes (valeurs par défaut) sans toucher à celles déjà réglées par l'administration.
      const raw = (plan.features ?? {}) as Record<string, unknown>;
      const missing = Object.entries(d.features).filter(([k]) => !(k in raw));
      if (missing.length && planFeaturesSchema.safeParse(plan.features).success) {
        await this.prisma.subscriptionPlan.update({ where: { id: plan.id }, data: { features: { ...raw, ...Object.fromEntries(missing) } as Prisma.InputJsonObject } });
      }
      if (code !== 'FREE') {
        await this.prisma.planPrice.createMany({
          data: DURATION_MONTHS.map((months) => ({ planId: plan.id, months, discountPercent: DEFAULT_DISCOUNTS[months] })),
          skipDuplicates: true,
        });
      }
    }
    await this.prisma.product.createMany({ data: DEFAULT_PRODUCTS.map((p) => ({ ...p })), skipDuplicates: true });
    this.invalidate();
  }

  private async load(): Promise<Map<PlanCode, PlanView>> {
    if (this.cache && Date.now() - this.cache.at < TTL) return this.cache.plans;
    const rows = await this.prisma.subscriptionPlan.findMany({ include: { prices: { orderBy: { months: 'asc' } } }, orderBy: { sortOrder: 'asc' } });
    const plans = new Map<PlanCode, PlanView>();
    for (const r of rows) {
      const features = planFeaturesSchema.safeParse(r.features);
      if (!features.success) continue; // configuration corrompue : on garde la formule hors catalogue plutôt que d'ouvrir des droits
      const prices = r.prices.filter((p) => p.active).map((p) => {
        const total = priceForDuration(r.priceXof, p.months, p.discountPercent, p.amountOverride);
        return { months: p.months, discountPercent: p.discountPercent, totalXof: total, monthlyEquivalentXof: Math.round(total / p.months), savingsXof: Math.max(0, r.priceXof * p.months - total) };
      });
      plans.set(r.code, { code: r.code, name: r.name, priceXof: r.priceXof, currency: r.currency, features: features.data, featured: r.featured, sortOrder: r.sortOrder, prices });
    }
    this.cache = { at: Date.now(), plans };
    return plans;
  }

  async featuresOf(code: PlanCode): Promise<PlanFeatures> {
    return (await this.load()).get(code)?.features ?? DEFAULT_PLANS[code].features;
  }

  /** Catalogue public : seules les formules actives. */
  async catalog(): Promise<PlanView[]> {
    const active = await this.prisma.subscriptionPlan.findMany({ where: { active: true }, select: { code: true } });
    const ok = new Set(active.map((a) => a.code));
    return [...(await this.load()).values()].filter((p) => ok.has(p.code));
  }

  /** Devis calculé côté serveur : le montant payé ne vient JAMAIS du frontend. */
  async quote(code: PlanCode, months: number) {
    if (code === 'FREE') throw badRequest('INVALID_PLAN');
    const plan = (await this.catalog()).find((p) => p.code === code);
    if (!plan) throw notFound('PLAN_NOT_FOUND');
    const price = plan.prices.find((p) => p.months === months);
    if (!price) throw badRequest('PRICE_NOT_AVAILABLE', 'Durée non proposée');
    return { plan, price };
  }

  async products() {
    return this.prisma.product.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
  }
}
