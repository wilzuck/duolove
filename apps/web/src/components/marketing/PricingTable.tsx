'use client';
import { Check, ChevronDown, Crown, Sparkles, Star } from 'lucide-react';
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
/** Avantages phares, par ordre d'importance : les trois premiers présents dans la formule sont mis en avant. */
const STARS = ['likesUnlimited', 'seeLikers', 'superLikesWeekly', 'boostsMonthly', 'chatSuggestions', 'liveMatch', 'incognito'] as const;
const BASE = ['plans.feat.signup', 'plans.feat.discover', 'plans.feat.matches', 'plans.feat.chat', 'plans.feat.safety'] as const;

/** Les avantages affichés sont LUS dans la configuration de l'offre (jamais codés par formule). */
function featureLines(p: PlanView, t: (k: string, v?: Record<string, number>) => string, freeShown: boolean): { id: string; text: string }[] {
  const f = p.features;
  const out: { id: string; text: string }[] = [];
  if (p.code !== 'FREE' && freeShown) out.push({ id: 'allFree', text: t('plans.feat.allFree') });  // « Tout Gratuit » n'a de sens que si l'offre gratuite est affichée
  out.push(f.daily_likes_limit < 0 ? { id: 'likesUnlimited', text: t('plans.feat.likesUnlimited') } : { id: 'likes', text: t('plans.feat.likes', { n: f.daily_likes_limit }) });
  if (f.super_likes_weekly > 0) out.push({ id: 'superLikesWeekly', text: t('plans.feat.superLikesWeekly', { n: f.super_likes_weekly }) });
  if (f.can_see_likes) out.push({ id: 'seeLikers', text: t('plans.feat.seeLikers') });
  if (f.advanced_filters) out.push({ id: 'advancedFilters', text: t('plans.feat.advancedFilters') });
  if (f.rewind_enabled) out.push({ id: 'rewind', text: t('plans.feat.rewind') });
  if (f.boosts_monthly > 0) out.push({ id: 'boostsMonthly', text: t('plans.feat.boostsMonthly', { n: f.boosts_monthly }) });
  if (f.incognito_mode) out.push({ id: 'incognito', text: t('plans.feat.incognito') });
  if (f.chat_images_enabled) out.push({ id: 'chatImages', text: t('plans.feat.chatImages') });
  if (f.chat_suggestions_enabled) out.push({ id: 'chatSuggestions', text: t('plans.feat.chatSuggestions') });
  if (f.calls_enabled) out.push({ id: 'calls', text: t('plans.feat.calls') });
  if (f.dates_enabled) out.push({ id: 'dates', text: t('plans.feat.dates') });
  out.push({ id: 'dailyPicks', text: t('plans.feat.dailyPicks', { n: f.daily_picks_count }) });
  if (f.read_receipts_control) out.push({ id: 'readReceipts', text: t('plans.feat.readReceipts') });
  if (f.live_match_enabled) out.push({ id: 'liveMatch', text: t('plans.feat.liveMatch') });
  else if (f.live_match_trials > 0) out.push({ id: 'liveMatchTrials', text: t('plans.feat.liveMatchTrials', { n: f.live_match_trials }) });
  if (f.match_tokens_monthly > 0) out.push({ id: 'matchTokensMonthly', text: t('plans.feat.matchTokensMonthly', { n: f.match_tokens_monthly }) });
  if (!f.ads_enabled && p.code !== 'FREE') out.push({ id: 'noAds', text: t('plans.feat.noAds') });
  return out;
}

/**
 * Grille des offres avec choix de la durée (mensuel / 3 / 6 / 12 mois). `initial` vient du serveur ; le catalogue
 * est ensuite rafraîchi en continu : un changement de tarif dans l'administration apparaît sans rechargement.
 */
export function PricingTable({ initial, current, action, defaultMonths = 1, hideFree = false, collapseFeatures = false, promo }: { /** Code promo appliqué (remise en %) : les prix des cartes sont affichés remise comprise (le serveur reste seul juge du montant payé, même arrondi). */ promo?: { code: string; percent: number } | null; /** Avantages masqués par défaut : un seul bouton sous la grille les affiche pour toutes les offres (page d'arrivée après l'inscription). */ collapseFeatures?: boolean; initial?: Catalog; current?: PlanCode; /** Absent = pages publiques : bouton « Créer mon compte » intégré (une fonction ne peut pas traverser serveur → client). */ action?: (plan: PlanView, months: number) => ReactNode; defaultMonths?: number; /** Accès payant : la formule gratuite n'est pas proposée. */ hideFree?: boolean }) {
  const t = useTranslations();
  const locale = useLocale();
  const { data } = useCatalog(initial);
  const [months, setMonths] = useState(defaultMonths);
  const [showAll, setShowAll] = useState(!collapseFeatures);
  const plans = [...(data?.plans ?? [])].filter((p) => !hideFree || p.code !== 'FREE').sort((a, b) => a.sortOrder - b.sortOrder);
  const durations = [...new Set(plans.flatMap((p) => p.prices.map((x) => x.months)))].sort((a, b) => a - b);
  const maxDiscount = (m: number) => Math.max(0, ...plans.map((p) => p.prices.find((x) => x.months === m)?.discountPercent ?? 0));

  return (
    <div className="space-y-8">
      {durations.length > 1 && (
        <div role="radiogroup" aria-label={t('plans.durationLabel')} className="mx-auto flex w-fit max-w-full flex-wrap justify-center gap-1 rounded-full bg-soft p-1">
          {durations.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={months === m} onClick={() => setMonths(m)}
              className={cn('flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition', months === m ? 'bg-linear-to-br from-brand-strong to-brand-strong-2 text-white shadow-soft' : 'text-brand-ink hover:bg-card')}>
              {m === 0 ? t('plans.week') : t('plans.months', { n: m })}
              {maxDiscount(m) > 0 && <span className={cn('rounded-full px-1.5 text-[11px]', months === m ? 'bg-white/25' : 'bg-linear-to-br from-brand-strong to-brand-strong-2 text-white')}>−{maxDiscount(m)}%</span>}
            </button>
          ))}
        </div>
      )}
      <div className={cn('grid justify-items-center gap-5', plans.length === 2 ? 'mx-auto max-w-[52rem] lg:grid-cols-2' : plans.length === 1 ? '' : 'lg:grid-cols-3')}>
        {plans.map((p) => {
          const Icon = ICON[p.code];
          const price = p.prices.find((x) => x.months === months); // pas de repli : une formule qui n'a pas cette durée (ex. 7 jours seulement sur Premium) ne l'affiche pas
          const all = [...(p.code === 'FREE' ? BASE.map((k) => ({ id: k, text: t(k) })) : []), ...featureLines(p, t as never, plans.some((x) => x.code === 'FREE'))];
          // Trois avantages phares par formule payante (les plus marquants d'abord), le reste suit sous « Aussi inclus ».
          const stars = p.code === 'FREE' ? [] : STARS.map((id) => all.find((l) => l.id === id)).filter((l): l is { id: string; text: string } => !!l).slice(0, 3);
          const lines = all.filter((l) => !stars.includes(l));
          return (
            <Card key={p.code} className={cn('relative flex w-full max-w-[25rem] flex-col gap-5 p-7', p.featured && 'border-2 border-brand shadow-pop')}>
              {p.featured && <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-linear-to-br from-brand-strong to-brand-strong-2 text-white">{t('plans.popular')}</Badge>}
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-soft text-brand"><Icon className="size-5" aria-hidden /></span>
                <h3 className="text-xl font-bold">{p.name}</h3>
                {current === p.code && <Badge tone="success">{t('plans.current')}</Badge>}
              </div>
              <p className="text-sm text-muted">{(locale === 'en' ? p.taglineEn : p.taglineFr) || t(`plans.${p.code}.tagline`)}</p>
              {p.code === 'FREE' ? (
                <p className="font-display text-4xl font-extrabold">{t('plans.free')}</p>
              ) : !price ? (
                <p className="text-sm font-medium text-muted">{t('plans.durationUnavailable')}</p>
              ) : promo ? (
                // Remise du code : prix barré, prix remisé et total du prochain paiement (même arrondi que le serveur : remise = round(total × % / 100)).
                <div className="space-y-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
                    <del className="text-lg font-semibold text-muted decoration-2"><span className="sr-only">{t('plans.regularPrice')} </span>{formatXof(Math.round((price.totalXof + price.savingsXof) / price.months), locale)}</del>
                    <span className="font-display text-4xl font-extrabold"><span className="sr-only">{t('plans.promoPrice')} </span>{formatXof(Math.round((price.totalXof - Math.round((price.totalXof * promo.percent) / 100)) / Math.max(1, price.months)), locale)}</span>
                    <span className="text-sm text-muted">{t(price.months === 0 ? 'plans.perWeek' : 'plans.perMonth')}</span>
                  </p>
                  <p className="text-sm font-semibold text-success-ink">{t(price.months === 0 ? 'plans.promoTotalWeek' : 'plans.promoTotal', { code: promo.code, percent: promo.percent, total: formatXof(price.totalXof - Math.round((price.totalXof * promo.percent) / 100), locale), n: price.months })}</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
                    {price.savingsXof > 0 && (
                      <del className="text-lg font-semibold text-muted decoration-2"><span className="sr-only">{t('plans.regularPrice')} </span>{formatXof(Math.round((price.totalXof + price.savingsXof) / price.months), locale)}</del>
                    )}
                    <span className="font-display text-4xl font-extrabold"><span className="sr-only">{price.savingsXof > 0 ? `${t('plans.promoPrice')} ` : ''}</span>{formatXof(price.monthlyEquivalentXof, locale)}</span>
                    <span className="text-sm text-muted">{t(price.months === 0 ? 'plans.perWeek' : 'plans.perMonth')}</span>
                  </p>
                  <p className="text-sm text-muted">
                    {price.months === 0 ? t('plans.billedWeek') : price.months === 1 ? t('plans.billedMonthly') : t('plans.billedOnce', { total: formatXof(price.totalXof, locale), n: price.months })}
                    {price.discountPercent > 0 && <span className="ml-2 font-semibold text-success-ink">{t('plans.save', { amount: formatXof(price.savingsXof, locale), pct: price.discountPercent })}</span>}
                  </p>
                </div>
              )}
              {stars.length > 0 && (
                <ul aria-label={t('plans.starsLabel')} className="space-y-2 rounded-2xl bg-soft p-4 text-sm font-semibold">
                  {stars.map((l) => <li key={l.id} className="flex gap-3"><Sparkles className="mt-0.5 size-4 shrink-0 text-brand-ink" aria-hidden /><span>{l.text}</span></li>)}
                </ul>
              )}
              {showAll ? <ul id="plan-features" className="flex-1 space-y-3 text-sm">
                {stars.length > 0 && <li className="text-xs font-semibold tracking-wide text-muted uppercase">{t('plans.alsoIncluded')}</li>}
                {lines.map((l) => <li key={l.id} className="flex gap-3"><Check className="mt-0.5 size-4 shrink-0 text-success-ink" aria-hidden /><span>{l.text}</span></li>)}
              </ul> : <div className="flex-1" />}
              {!price && p.code !== 'FREE' ? null : action ? action(p, months) : (
                <Link href="/register"><Button className="w-full" size="lg" variant={p.featured ? 'primary' : 'outline'}>{t(p.code === 'FREE' ? 'plans.ctaFree' : 'plans.ctaPaid')}</Button></Link>
              )}
            </Card>
          );
        })}
      </div>
      {collapseFeatures && (
        <div className="text-center">
          <Button type="button" variant="outline" aria-expanded={showAll} aria-controls="plan-features" onClick={() => setShowAll((v) => !v)}>
            {t(showAll ? 'plans.hideFeatures' : 'plans.showFeatures')}<ChevronDown className={cn('size-4 transition-transform', showAll && 'rotate-180')} aria-hidden />
          </Button>
        </div>
      )}
      <p className="mx-auto max-w-2xl text-center text-sm text-muted">{t('plans.renewalNote')}</p>
    </div>
  );
}
