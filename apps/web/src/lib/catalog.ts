import { DEFAULT_DISCOUNTS, DEFAULT_PLANS, DEFAULT_PRODUCTS, DURATION_MONTHS, WEEK, priceForDuration, type PlanCode } from '@duomatch/types';
import type { Catalog } from './types';

/** Catalogue de repli (valeurs par défaut) : sert quand l'API est injoignable (build, panne) — jamais pour encaisser. */
export function fallbackCatalog(): Catalog {
  return {
    plans: (Object.keys(DEFAULT_PLANS) as PlanCode[]).map((code) => {
      const d = DEFAULT_PLANS[code];
      return {
        code, name: d.name, priceXof: d.priceXof, currency: 'XOF', features: d.features, featured: d.featured, sortOrder: d.sortOrder,
        prices: code === 'FREE' ? [] : DURATION_MONTHS.filter((m) => m !== WEEK).map((months) => {
          const total = priceForDuration(d.priceXof, months, DEFAULT_DISCOUNTS[months]);
          return { months, discountPercent: DEFAULT_DISCOUNTS[months], totalXof: total, monthlyEquivalentXof: Math.round(total / months), savingsXof: d.priceXof * months - total };
        }),
      };
    }),
    products: DEFAULT_PRODUCTS.map((p) => ({ code: p.code, kind: p.kind, creditType: p.creditType, name: p.name, quantity: p.quantity, priceXof: p.priceXof, currency: 'XOF' })),
  };
}

/** Récupération côté serveur Next (pages marketing), revalidée toutes les 60 s. */
export async function fetchCatalog(): Promise<Catalog> {
  try {
    const res = await fetch(`${(process.env.API_URL ?? 'http://localhost:4000').trim()}/api/plans`, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as Catalog;
  } catch {
    return fallbackCatalog();
  }
}
