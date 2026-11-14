'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Eye, Footprints, RefreshCw, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, Card, Skeleton } from '@duomatch/ui';
import { KpiCard, type Flow, type SeriesPoint } from '@/components/admin/DashboardParts';
import { PeriodPicker, periodQuery, type Period } from '@/components/admin/PeriodPicker';
import { PageHeader } from '@/components/admin/PageParts';
import { LineChart } from '@/components/admin/StatsCharts';
import { api } from '@/lib/api';

interface Row { key: string; views: number; visitors: number }
interface Audience {
  days: number; from: string; to: string; series: { visitors: SeriesPoint[]; views: SeriesPoint[] }; flows: { views: Flow; visitors: Flow };
  pages: Row[]; sources: Row[]; countries: Row[]; devices: Row[]; langs: Row[];
}
const PERIODS = [7, 30, 90, 180, 365] as const;

/** Classement avec barre proportionnelle aux pages vues. */
function Ranking({ title, hint, rows, label, n, empty }: { title: string; hint?: string; rows: Row[]; label: (k: string) => string; n: (v: number) => string; empty: string }) {
  const t = useTranslations();
  const max = Math.max(1, ...rows.map((r) => r.views));
  return (
    <Card className="p-5">
      <h2 className="font-bold">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      {rows.length === 0 ? <p className="mt-4 text-sm text-muted">{empty}</p> : (
        <table className="mt-3 w-full text-sm">
          <thead><tr className="text-left text-xs text-muted"><th className="py-1 font-medium"><span className="sr-only">{title}</span></th><th className="py-1 text-right font-medium">{t('admin.aud.views')}</th><th className="py-1 pl-3 text-right font-medium">{t('admin.aud.visitors')}</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-line">
                <td className="py-2 pr-2">
                  <span className="block truncate font-medium" title={r.key}>{label(r.key)}</span>
                  <span className="mt-1 block h-1.5 rounded-full bg-soft" aria-hidden><span className="block h-full rounded-full bg-brand-strong" style={{ width: `${(r.views / max) * 100}%` }} /></span>
                </td>
                <td className="py-2 text-right tabular-nums">{n(r.views)}</td>
                <td className="py-2 pl-3 text-right tabular-nums">{n(r.visitors)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export default function AdminAudience() {
  const t = useTranslations();
  const locale = useLocale();
  const [period, setPeriod] = useState<Period>({ days: 30 });
  const q = useQuery({ queryKey: ['admin', 'audience', period], queryFn: () => api<Audience>(`/admin/audience?${periodQuery(period)}`), placeholderData: keepPreviousData, refetchInterval: 120_000 });
  const d = q.data;
  const nf = new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'fr-FR', { maximumFractionDigits: 1 });
  const n = (v: number) => nf.format(v);
  const country = (k: string) => {
    if (k === '??') return t('admin.aud.unknown');
    try { return new Intl.DisplayNames([locale], { type: 'region' }).of(k) ?? k; } catch { return k; }
  };
  const source = (k: string) => (k === 'direct' ? t('admin.aud.direct') : k);
  const device = (k: string) => (['mobile', 'desktop', 'tablet'].includes(k) ? t(`admin.aud.device.${k as 'mobile'}`) : k);
  const lang = (k: string) => (k === 'en' ? 'English' : k === 'fr' ? 'Français' : k);
  const perVisitor = d && d.flows.visitors.current ? d.flows.views.current / d.flows.visitors.current : 0;
  return (
    <div className="space-y-6">
      <PageHeader title={t('admin.nav.audience')} description={t('admin.pageDesc.audience')}>
        <div className="flex flex-wrap items-center gap-3">
          <PeriodPicker presets={PERIODS} label={(p) => t(`admin.stats.p${p}` as never)} value={period} onChange={setPeriod} />
          <Button variant="outline" size="sm" onClick={() => void q.refetch()} loading={q.isFetching} aria-label={t('admin.dash.refresh')}>{!q.isFetching && <RefreshCw className="size-4" aria-hidden />}<span className="max-sm:sr-only">{t('admin.dash.refresh')}</span></Button>
        </div>
      </PageHeader>
      {!d ? <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-72" /></div> : (
        <>
          <section aria-label={t('admin.aud.kpis')} className="grid gap-3 sm:grid-cols-3">
            <KpiCard label={t('admin.aud.k.visitors')} value={n(d.flows.visitors.current)} flow={d.flows.visitors} series={d.series.visitors} icon={<Users className="size-5" />} hint={t('admin.aud.k.visitorsHint')} />
            <KpiCard label={t('admin.aud.k.views')} value={n(d.flows.views.current)} flow={d.flows.views} series={d.series.views} icon={<Eye className="size-5" />} />
            <KpiCard label={t('admin.aud.k.perVisitor')} value={n(perVisitor)} icon={<Footprints className="size-5" />} hint={t('admin.aud.k.perVisitorHint')} />
          </section>
          <LineChart title={t('admin.aud.chart')} subtitle={t('admin.aud.chartSub')} locale={locale} format={n} area
            lines={[{ key: 'views', label: t('admin.aud.views'), points: d.series.views, color: 'text-sky-500' }, { key: 'visitors', label: t('admin.aud.visitors'), points: d.series.visitors, color: 'text-brand-strong' }]} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Ranking title={t('admin.aud.pages')} rows={d.pages} label={(k) => k} n={n} empty={t('admin.aud.empty')} />
            <Ranking title={t('admin.aud.sources')} hint={t('admin.aud.sourcesHint')} rows={d.sources} label={source} n={n} empty={t('admin.aud.empty')} />
            <Ranking title={t('admin.aud.countries')} rows={d.countries} label={country} n={n} empty={t('admin.aud.empty')} />
            <div className="grid gap-4">
              <Ranking title={t('admin.aud.devices')} rows={d.devices} label={device} n={n} empty={t('admin.aud.empty')} />
              <Ranking title={t('admin.aud.langs')} rows={d.langs} label={lang} n={n} empty={t('admin.aud.empty')} />
            </div>
          </div>
          <p className="text-xs text-muted">{t('admin.aud.privacy')}</p>
        </>
      )}
    </div>
  );
}
