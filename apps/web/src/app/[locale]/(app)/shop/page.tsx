'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Coins, Rocket, Star } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { BOOST_MINUTES, type CreditType } from '@duomatch/types';
import { Badge, Button, Card, cn, Skeleton } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { usePay } from '@/hooks/usePay';
import { keys, useCatalog, useMe, useMyProfile } from '@/hooks/useQueries';
import { api, post } from '@/lib/api';
import { formatDate, formatXof, timeAgo } from '@/lib/format';
import { Link } from '@/i18n/navigation';
import { PromoCard, discounted, type AppliedPromo } from '@/components/app/PromoCard';
import { useUi } from '@/lib/store';
import { useState } from 'react';
import { FeatureOffDialog } from '@/components/app/FeatureOffDialog';
import { SectionTabs } from '@/components/app/SectionTabs';
import { useScrollToHash } from '@/hooks/useScrollToHash';

const BOOSTS = ['BOOST_30', 'BOOST_120', 'BOOST_1440'] as const;

export default function ShopPage() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const { data: me } = useMe();
  const { data: profile } = useMyProfile();
  const { data: catalog } = useCatalog();
  const { pay, pending, variables } = usePay();
  const [promo, setPromo] = useState<AppliedPromo | null>(null);
  const wallet = useQuery({ queryKey: ['credits'], queryFn: () => api<{ balances: Record<CreditType, number>; transactions: { id: string; type: CreditType; delta: number; reason: string; createdAt: string }[] }>('/credits') });
  const activate = useMutation({
    mutationFn: (creditType: string) => post('/boosts/activate', { creditType }),
    onSuccess: () => { toast('success', t('shop.boostActivated')); void qc.invalidateQueries({ queryKey: ['credits'] }); void qc.invalidateQueries({ queryKey: keys.profile }); void qc.invalidateQueries({ queryKey: keys.me }); },
    onError: (e) => toast('error', err(e)),
  });
  useScrollToHash(!!catalog && !!wallet.data && !!me);  // « Acheter » depuis la barre du haut : arrive directement sur la bonne section
  if (!catalog || !wallet.data || !me) return <div className="mx-auto max-w-4xl space-y-4 p-4"><Skeleton className="h-32" /><Skeleton className="h-64" /></div>;
  const b = wallet.data.balances;
  // Trois familles d'achat distinctes : jetons Crush, boosts de visibilité, Super Likes.
  const groups = [
    { kind: 'TOKEN_PACK', title: t('shop.groupTokens'), text: t('shop.groupTokensText') },
    { kind: 'BOOST', title: t('shop.groupBoosts'), text: t('shop.groupBoostsText') },
    { kind: 'SUPER_LIKE_PACK', title: t('shop.groupSuperLikes'), text: t('shop.groupSuperLikesText') },
  ] as const;
  const boostedUntil = profile?.boostedUntil && new Date(profile.boostedUntil) > new Date() ? profile.boostedUntil : null;
  const label = (c: CreditType) => (c === 'SUPER_LIKE' ? t('shop.superLikes') : c === 'MATCH_TOKEN' ? t('shop.tokens') : t('shop.boostOf', { n: BOOST_MINUTES[c as keyof typeof BOOST_MINUTES] >= 60 ? BOOST_MINUTES[c as keyof typeof BOOST_MINUTES] / 60 : BOOST_MINUTES[c as keyof typeof BOOST_MINUTES], unit: BOOST_MINUTES[c as keyof typeof BOOST_MINUTES] >= 60 ? t('shop.hours') : t('shop.minutes') }));

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-4">
      <SectionTabs />
      <FeatureOffDialog flag="payments_enabled" />
      <header><h1 className="text-2xl font-extrabold">{t('shop.title')}</h1><p className="mt-1 text-muted">{t('shop.subtitle')}</p></header>

      <section aria-labelledby="bal"><h2 id="bal" className="mb-3 font-bold">{t('shop.balances')}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4"><p className="flex items-center gap-2 text-sm text-muted"><Star className="size-4 text-violet-700" aria-hidden />{t('shop.superLikes')}</p><p className="mt-1 font-display text-3xl font-extrabold">{b.SUPER_LIKE}</p><p className="text-xs text-muted">{t('shop.superLikesIncluded', { n: me.entitlement.limits.superLikesWeekly })}</p></Card>
          <Card className="p-4"><p className="flex items-center gap-2 text-sm text-muted"><Coins className="size-4 text-amber-500" aria-hidden />{t('shop.tokens')}</p><p className="mt-1 font-display text-3xl font-extrabold">{b.MATCH_TOKEN}</p><Link href="/match" className="text-xs font-semibold text-brand-ink hover:underline">{t('shop.tokensUse')}</Link></Card>
          {BOOSTS.map((c) => (
            <Card key={c} className="p-4"><p className="flex items-center gap-2 text-sm text-muted"><Rocket className="size-4 text-brand" aria-hidden />{label(c)}</p><p className="mt-1 font-display text-3xl font-extrabold">{b[c]}</p>
              <Button size="sm" variant="outline" className="mt-2" disabled={b[c] < 1 || activate.isPending} onClick={() => activate.mutate(c)}>{t('shop.activate')}</Button></Card>
          ))}
        </div>
        {boostedUntil && <p role="status" className="mt-3 rounded-2xl bg-soft p-3 text-sm font-medium text-brand-ink">{t('shop.boostActive', { date: formatDate(boostedUntil, locale, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) })}</p>}
        <p className="mt-2 text-xs text-muted">{t('shop.creditsNote')}</p>
      </section>

      <PromoCard applied={promo} onApply={setPromo} />

      {groups.map((g) => {
        const items = catalog.products.filter((p) => p.kind === g.kind);
        if (items.length === 0) return null;
        return (
          <section key={g.kind} aria-labelledby={`prod-${g.kind}`}>
            <h2 id={`prod-${g.kind}`} className="font-bold">{g.title}</h2>
            <p className="mb-3 text-sm text-muted">{g.text}</p>
            <ul className="grid gap-3 sm:grid-cols-3">
              {items.map((p) => {
                const mins = BOOST_MINUTES[p.creditType as keyof typeof BOOST_MINUTES];
                const big = p.kind === 'BOOST' ? t(mins >= 60 ? 'plans.hoursShort' : 'plans.minutesShort', { n: mins >= 60 ? mins / 60 : mins }) : String(p.quantity);
                const what = p.kind === 'BOOST' ? t('plans.boostLabel') : p.kind === 'SUPER_LIKE_PACK' ? t('plans.superLikesLabel') : t('plans.tokensLabel');
                const busy = pending && variables?.key === p.code;
                return (
                  <li key={p.code} className="flex flex-col items-center gap-1 rounded-3xl border border-line bg-card p-6 text-center shadow-soft">
                    <span className={cn('font-display text-5xl font-extrabold', p.kind === 'SUPER_LIKE_PACK' ? 'text-violet-700' : 'text-brand-ink')}>{big}</span>
                    <span className="font-semibold">{what}</span>
                    {p.kind === 'BOOST' && <span className="text-sm text-muted">{t('plans.boostDuration')}</span>}
                    {p.kind !== 'BOOST' && p.quantity > 1 && <span className="text-sm text-muted">{t('plans.perUnit', { price: formatXof(Math.round((promo ? discounted(p.priceXof, promo.percent) : p.priceXof) / p.quantity), locale) })}</span>}
                    <span className={cn('mt-3 rounded-full px-4 py-1.5 text-lg font-bold', p.kind === 'SUPER_LIKE_PACK' ? 'bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200' : 'bg-soft text-brand-ink')}>
                      {promo ? <><s className="mr-1.5 text-sm font-medium opacity-60">{formatXof(p.priceXof, locale)}</s>{formatXof(discounted(p.priceXof, promo.percent), locale)}</> : formatXof(p.priceXof, locale)}
                    </span>
                    <Button size="sm" className={cn('mt-3 w-full', p.kind === 'SUPER_LIKE_PACK' && 'bg-none bg-violet-700 text-white hover:bg-violet-800')} loading={busy} onClick={() => pay({ key: p.code, body: { type: 'product', code: p.code, promoCode: promo?.code } })}>{t('plans.order')}</Button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <Link href="/referral" className="block"><Card className="flex items-center justify-between gap-3 p-4 hover:bg-soft"><span className="font-semibold">{t('referral.link')}</span><span aria-hidden>→</span></Card></Link>

      <section aria-labelledby="hist"><h2 id="hist" className="mb-3 font-bold">{t('shop.history')}</h2>
        {wallet.data.transactions.length === 0 ? <p className="text-sm text-muted">{t('shop.noHistory')}</p> : (
          <Card className="divide-y divide-line px-5">{wallet.data.transactions.map((x) => (
            <div key={x.id} className="flex items-center justify-between py-3 text-sm"><span>{label(x.type)} <Badge tone="neutral">{t(`shop.reason.${x.reason}` as never)}</Badge></span><span className="flex items-center gap-3"><span className={x.delta > 0 ? 'font-bold text-success-ink' : 'font-bold text-danger-ink'}>{x.delta > 0 ? '+' : ''}{x.delta}</span><time className="text-xs text-muted" dateTime={x.createdAt}>{timeAgo(x.createdAt, locale)}</time></span></div>
          ))}</Card>
        )}
      </section>
    </div>
  );
}
