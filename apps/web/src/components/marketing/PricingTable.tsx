'use client';
import { Check, Crown, Sparkles, Star } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import type { PlanCode } from '@duomatch/types';
import { Badge, Card, cn } from '@duomatch/ui';
import { useCatalog } from '@/hooks/useQueries';
import { formatXof } from '@/lib/format';
import { Button } from '@duomatch/ui';
import { Link } from '@/i18n/navigation';
import type { Catalog, PlanView } from '@/lib/types';

const ICON = { FREE: Star, PREMIUM: Sparkles, VIP: Crown } as const;
const BASE = ['plans.feat.signup', 'plans.feat.discover', 'plans.feat.matches', 'plans.feat.chat', 'plans.feat.safety'] as const;

/** Les avantages affichés sont LUS dans la configuration de l'offre (jamais codés par formule). */
function featureLines(p: PlanView, t: (k: string, v?: Record<string, number>) => string): string[] {
  const f = p.features;
  const out: string[] = [];
  if (p.code !== 'FREE') out.push(t('plans.feat.allFree'));
  out.push(f.daily_likes_limit < 0 ? t('plans.feat.likesUnlimited') : t('plans.feat.likes', { n: f.daily_likes_limit }));
  if (f.super_likes_weekly > 0) out.push(t('plans.feat.superLikesWeekly', { n: f.super_likes_weekly }));
  if (f.can_see_likes) out.push(t('plans.feat.seeLikers'));
  if (f.advanced_filters) out.push(t('plans.feat.advancedFilters'));
  if (f.rewind_enabled) out.push(t('plans.feat.rewind'));
  if (f.boosts_monthly > 0) out.push(t('plans.feat.boostsMonthly', { n: f.boosts_monthly }));
  if (f.incognito_mode) out.push(t('plans.feat.incognito'));
  if (f.chat_images_enabled) out.push(t('plans.feat.chatImages'));
  out.push(t('plans.feat.dailyPicks', { n: f.daily_picks_count }));
  if (f.read_receipts_control) out.push(t('plans.feat.readReceipts'));
  if (f.live_match_enabled) out.push(t('plans.feat.liveMatch'));
  else if (f.live_match_trials > 0) out.push(t('plans.feat.liveMatchTrials', { n: f.live_match_trials }));
  if (f.match_tokens_monthly > 0) out.push(t('plans.feat.matchTokensMonthly', { n: f.match_tokens_monthly }));
  if (!f.ads_enabled && p.code !== 'FREE') out.push(t('plans.feat.noAds'));
  return out;
}

/**
 * Grille des offres avec choix de la durée (mensuel / 3 / 6 / 12 mois). `initial` vient du serveur ; le catalogue
 * est ensuite rafraîchi en continu : un changement de tarif dans l'administration apparaît sans rechargement.
 */
export function PricingTable({ initial, current, action, defaultMonths = 1 }: { initial?: Catalog; current?: PlanCode; /** Absent = pages publiques : bouton « Créer mon compte » intégré (une fonction ne peut pas traverser serveur → client). */ action?: (plan: PlanView, months: number) => ReactNode; defaultMonths?: number }) {
  const t = useTranslations();
  const locale = useLocale();
  const { data } = useCatalog(initial);
  const [months, setMonths] = useState(defaultMonths);
  const plans = [...(data?.plans ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const durations = [...new Set(plans.flatMap((p) => p.prices.map((x) => x.months)))].sort((a, b) => a - b);
  const maxDiscount = (m: number) => Math.max(0, ...plans.map((p) => p.prices.find((x) => x.months === m)?.discountPercent ?? 0));

  return (
    <div className="space-y-8">
      {durations.length > 1 && (
        <div role="radiogroup" aria-label={t('plans.durationLabel')} className="mx-auto flex w-fit max-w-full flex-wrap justify-center gap-1 rounded-full bg-soft p-1">
          {durations.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={months === m} onClick={() => setMonths(m)}
              className={cn('flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition', months === m ? 'bg-linear-to-br from-brand-strong to-brand-strong-2 text-white shadow-soft' : 'text-brand-ink hover:bg-card')}>
              {t('plans.months', { n: m })}
              {maxDiscount(m) > 0 && <span className={cn('rounded-full px-1.5 text-[11px]', months === m ? 'bg-white/25' : 'bg-linear-to-br from-brand-strong to-brand-strong-2 text-white')}>−{maxDiscount(m)}%</span>}
            </button>
          ))}
        </div>
      )}
      <div className="grid justify-items-center gap-5 lg:grid-cols-3">
        {plans.map((p) => {
          const Icon = ICON[p.code];
          const price = p.prices.find((x) => x.months === months) ?? p.prices[0];
          const lines = [...(p.code === 'FREE' ? BASE.map((k) => t(k)) : []), ...featureLines(p, t as never)];
          return (
            <Card key={p.code} className={cn('relative flex w-full max-w-[25rem] flex-col gap-5 p-7', p.featured && 'border-2 border-brand shadow-pop')}>
              {p.featured && <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-linear-to-br from-brand-strong to-brand-strong-2 text-white">{t('plans.popular')}</Badge>}
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-soft text-brand"><Icon className="size-5" aria-hidden /></span>
                <h3 className="text-xl font-bold">{p.name}</h3>
                {current === p.code && <Badge tone="success">{t('plans.current')}</Badge>}
              </div>
              <p className="text-sm text-muted">{(locale === 'en' ? p.taglineEn : p.taglineFr) || t(`plans.${p.code}.tagline`)}</p>
              {p.code === 'FREE' || !price ? (
                <p className="font-display text-4xl font-extrabold">{t('plans.free')}</p>
              ) : (
                <div className="space-y-1">
                  <p className="flex items-baseline gap-1"><span className="font-display text-4xl font-extrabold">{formatXof(price.monthlyEquivalentXof, locale)}</span><span className="text-sm text-muted">{t('plans.perMonth')}</span></p>
                  <p className="text-sm text-muted">
                    {price.months === 1 ? t('plans.billedMonthly') : t('plans.billedOnce', { total: formatXof(price.totalXof, locale), n: price.months })}
                    {price.discountPercent > 0 && <span className="ml-2 font-semibold text-success-ink">{t('plans.save', { amount: formatXof(price.savingsXof, locale), pct: price.discountPercent })}</span>}
                  </p>
                </div>
              )}
              <ul className="flex-1 space-y-3 text-sm">
                {lines.map((l) => <li key={l} className="flex gap-3"><Check className="mt-0.5 size-4 shrink-0 text-success-ink" aria-hidden /><span>{l}</span></li>)}
              </ul>
              {action ? action(p, months) : (
                <Link href="/register"><Button className="w-full" size="lg" variant={p.featured ? 'primary' : 'outline'}>{t(p.code === 'FREE' ? 'plans.ctaFree' : 'plans.ctaPaid')}</Button></Link>
              )}
            </Card>
          );
        })}
      </div>
      <p className="mx-auto max-w-2xl text-center text-sm text-muted">{t('plans.renewalNote')}</p>
    </div>
  );
}
