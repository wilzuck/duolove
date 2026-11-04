'use client';
import { useQuery } from '@tanstack/react-query';
import { Copy, Share2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button, Card, Skeleton } from '@duomatch/ui';
import { api } from '@/lib/api';
import { SITE_NAME } from '@/lib/site';
import { useUi } from '@/lib/store';

interface ReferralSummary {
  code: string; invited: number; pending: number; rewarded: number; tokensEarned: number;
  limits: { referrerTokens: number; refereeTokens: number; maxRewarded: number }; referredBy: { status: string } | null;
}

export default function ReferralPage() {
  const t = useTranslations();
  const locale = useLocale();
  const toast = useUi((s) => s.toast);
  const { data } = useQuery({ queryKey: ['referral'], queryFn: () => api<ReferralSummary>('/referral/me') });
  if (!data) return <div className="mx-auto max-w-2xl space-y-4 p-4"><Skeleton className="h-40" /><Skeleton className="h-32" /></div>;
  const link = `${typeof window === 'undefined' ? '' : window.location.origin}${locale === 'en' ? '/en' : ''}/register?ref=${data.code}`;
  const text = t('referral.shareText', { site: SITE_NAME, code: data.code });
  const copy = async () => { try { await navigator.clipboard.writeText(link); toast('success', t('referral.copied')); } catch { /* presse-papiers indisponible */ } };
  const share = async () => { try { if (navigator.share) await navigator.share({ text, url: link }); else await copy(); } catch { /* partage annulé */ } };
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-4">
      <header><h1 className="text-2xl font-extrabold">{t('referral.title')}</h1><p className="mt-1 text-muted">{t('referral.subtitle')}</p></header>

      <Card className="space-y-4 p-5">
        <div><p className="text-sm text-muted">{t('referral.yourCode')}</p><p data-testid="referral-code" className="mt-1 font-display text-3xl font-extrabold tracking-widest">{data.code}</p></div>
        <div><p className="text-sm text-muted">{t('referral.yourLink')}</p><p className="mt-1 break-all rounded-2xl bg-soft p-3 text-sm">{link}</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={copy}><Copy className="mr-2 size-4" aria-hidden />{t('referral.copy')}</Button>
          <Button onClick={share}><Share2 className="mr-2 size-4" aria-hidden />{t('referral.share')}</Button>
        </div>
      </Card>

      <section aria-labelledby="how"><h2 id="how" className="mb-3 font-bold">{t('referral.how')}</h2>
        <Card className="p-5"><ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>{t('referral.step1')}</li><li>{t('referral.step2')}</li>
          <li>{t('referral.step3', { referrer: data.limits.referrerTokens, referee: data.limits.refereeTokens })}</li>
        </ol><p className="mt-3 text-xs text-muted">{t('referral.limit', { n: data.limits.maxRewarded })}</p></Card>
      </section>

      <section aria-label={t('referral.title')} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([['invited', data.invited], ['pending', data.pending], ['rewarded', data.rewarded], ['earned', data.tokensEarned]] as const).map(([k, v]) => (
          <Card key={k} className="p-4"><p className="text-sm text-muted">{t(`referral.${k}`)}</p><p className="mt-1 font-display text-3xl font-extrabold">{v}</p></Card>
        ))}
      </section>
      {data.referredBy && <p className="text-sm text-muted">{t('referral.referredBy')}</p>}
    </div>
  );
}
