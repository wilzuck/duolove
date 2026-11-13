'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShoppingBag } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button, Skeleton } from '@duomatch/ui';
import { PricingTable } from '@/components/marketing/PricingTable';
import { useApiError } from '@/hooks/useApiError';
import { usePay } from '@/hooks/usePay';
import { useSubscription } from '@/hooks/useQueries';
import { Link } from '@/i18n/navigation';
import { post } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { VerifiedDiscountCard } from '@/components/app/VerifiedDiscountCard';
import { PromoCard, type AppliedPromo } from '@/components/app/PromoCard';
import { useUi } from '@/lib/store';
import { useState } from 'react';
import { FeatureOffDialog } from '@/components/app/FeatureOffDialog';

export default function PremiumPage() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const { data } = useSubscription();
  const { pay, pending, variables } = usePay();
  const [promo, setPromo] = useState<AppliedPromo | null>(null);
  const resume = useMutation({ mutationFn: () => post('/subscriptions/resume'), onSuccess: () => qc.invalidateQueries({ queryKey: ['subscription'] }), onError: (e) => toast('error', err(e)) });
  if (!data) return <div className="mx-auto max-w-5xl p-4"><Skeleton className="h-96" /></div>;
  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6">
      <FeatureOffDialog flag="payments_enabled" />
      <header className="text-center"><h1 className="text-3xl font-extrabold md:text-4xl">{t('premium.title')}</h1><p className="mx-auto mt-2 max-w-xl text-muted">{t('premium.subtitle')}</p>
        {data.validUntil && <p className="mt-3 inline-block rounded-full bg-soft px-4 py-1.5 text-sm font-semibold text-brand-ink">{data.subscription?.cancelAtPeriodEnd ? t('premium.endsOn', { date: formatDate(data.validUntil, locale) }) : t('premium.renewsOn', { date: formatDate(data.validUntil, locale) })}</p>}
      </header>
      <VerifiedDiscountCard />
      <div className="mx-auto max-w-md"><PromoCard applied={promo} onApply={setPromo} /></div>
      <PricingTable promo={promo} current={data.plan} action={(p, months) => p.code === 'FREE'
        ? <Button variant="outline" size="lg" disabled className="w-full">{data.plan === 'FREE' ? t('plans.current') : t('plans.included')}</Button>
        : <Button size="lg" className="w-full" variant={p.featured ? 'primary' : 'dark'} loading={pending && variables?.key === `${p.code}-${months}`}
            onClick={() => pay({ key: `${p.code}-${months}`, body: { type: 'subscription', plan: p.code, months, promoCode: promo?.code } })}>{data.plan === p.code ? t('premium.extend', { duration: months === 0 ? t('plans.week') : t('plans.months', { n: months }) }) : t('premium.choose', { plan: p.name })}{promo ? ` · ${t('promo.discountBadge', { percent: promo.percent })}` : ''}</Button>} />
      {data.subscription?.cancelAtPeriodEnd && <p className="text-center"><Button variant="secondary" onClick={() => resume.mutate()}>{t('premium.resume')}</Button></p>}
      <p className="text-center"><Link href="/shop" className="inline-flex items-center gap-2 font-semibold text-brand-ink underline"><ShoppingBag className="size-4" aria-hidden />{t('shop.linkFromPremium')}</Link></p>
    </div>
  );
}
