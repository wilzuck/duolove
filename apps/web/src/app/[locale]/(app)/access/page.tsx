'use client';
import { useQuery } from '@tanstack/react-query';
import { HeartHandshake, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, Skeleton } from '@duomatch/ui';
import { FeatureOffDialog } from '@/components/app/FeatureOffDialog';
import { PromoCard, type AppliedPromo } from '@/components/app/PromoCard';
import { VerifiedDiscountCard } from '@/components/app/VerifiedDiscountCard';
import { PricingTable } from '@/components/marketing/PricingTable';
import { usePay } from '@/hooks/usePay';
import { useMe, useSubscription } from '@/hooks/useQueries';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { markPlanChoiceSeen } from '@/lib/planChoice';

interface Preview { required: boolean; locked: boolean; graceEndsAt: string | null; trialDays: number; city: string | null; counts: { city: number; country: number; activeWeek: number; total: number } }

/** Page d'accès payant : le membre a créé son profil, il choisit sa formule pour entrer. Aucun profil, photo ni nom d'autrui n'est montré : seulement des nombres. */
export default function AccessPage() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const welcome = useSearchParams().get('welcome') === '1';
  const { data: me } = useMe();
  const sub = useSubscription().data;
  const { pay, pending, variables } = usePay();
  const [promo, setPromo] = useState<AppliedPromo | null>(null);
  const pv = useQuery({ queryKey: ['access', 'preview'], queryFn: () => api<Preview>('/access/preview') });
  const c = pv.data?.counts;
  if (!me || !sub || !pv.data) return <div className="mx-auto max-w-5xl p-4"><Skeleton className="h-96" /></div>;
  const stats = [
    c && c.city > 0 && pv.data.city ? { icon: Users, text: t('access.inCity', { n: c.city, city: pv.data.city }) } : c && c.country > 0 ? { icon: Users, text: t('access.inCountry', { n: c.country }) } : null,
    c && c.activeWeek > 0 ? { icon: HeartHandshake, text: t('access.activeWeek', { n: c.activeWeek }) } : null,
  ].filter((x): x is { icon: typeof Users; text: string } => !!x);
  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6">
      <FeatureOffDialog flag="payments_enabled" />
      <header className="text-center">
        <h1 className="text-3xl font-extrabold md:text-4xl">{t(welcome ? 'access.welcomeTitle' : 'access.title')}</h1>
        <p className="mx-auto mt-2 max-w-xl text-muted">{t(pv.data.locked ? 'access.subtitle' : 'access.subtitleOpen')}</p>
      </header>
      {stats.length > 0 && (
        <Card className="mx-auto flex max-w-xl flex-col gap-3 p-5">
          {stats.map(({ icon: Icon, text }) => <p key={text} className="flex items-center gap-3 font-semibold"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-soft text-brand-ink"><Icon className="size-4" aria-hidden /></span>{text}</p>)}
          <p className="text-sm text-muted">{t('access.profileReady', { n: me.profile?.completeness ?? 0 })}</p>
        </Card>
      )}
      {!pv.data.locked && pv.data.trialDays > 0 && (
        <Card className="mx-auto flex max-w-xl flex-col items-center gap-3 border-2 border-brand p-5 text-center shadow-pop">
          <h2 className="text-xl font-extrabold">{welcome || !pv.data.graceEndsAt ? t('access.trialTitle', { n: pv.data.trialDays }) : t('access.trialRunning', { date: formatDate(pv.data.graceEndsAt, locale, { day: 'numeric', month: 'long' }) })}</h2>
          <p className="text-sm text-muted">{t('access.trialText')}</p>
          <Button size="lg" className="w-full" onClick={() => { markPlanChoiceSeen(); router.replace('/discover'); }}>{welcome ? t('access.trialStart', { n: pv.data.trialDays }) : t('access.trialContinue')}</Button>
        </Card>
      )}
      <VerifiedDiscountCard />
      <div className="mx-auto max-w-md"><PromoCard applied={promo} onApply={setPromo} /></div>
      <PricingTable hideFree current={sub.plan} action={(p, months) => (
        <Button size="lg" className="w-full" variant={p.featured ? 'primary' : 'dark'} loading={pending && variables?.key === `${p.code}-${months}`}
          onClick={() => pay({ key: `${p.code}-${months}`, body: { type: 'subscription', plan: p.code, months, promoCode: promo?.code } })}>{t('premium.choose', { plan: p.name })}</Button>
      )} />
      <p className="mx-auto max-w-xl text-center text-sm text-muted">{t('access.note')}</p>
    </div>
  );
}
