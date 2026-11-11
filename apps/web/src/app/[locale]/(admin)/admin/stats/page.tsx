'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CreditCard, Heart, HeartHandshake, Radio, RefreshCw, Smartphone, UserPlus, Wallet } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, Card, Skeleton, cn } from '@duomatch/ui';
import { KpiCard, Metric, TrendChart, type Flow, type SeriesPoint } from '@/components/admin/DashboardParts';
import { PeriodPicker, periodQuery, type Period } from '@/components/admin/PeriodPicker';
import { PageHeader } from '@/components/admin/PageParts';
import { LineChart } from '@/components/admin/StatsCharts';
import { api } from '@/lib/api';
import { formatXof } from '@/lib/format';

type Key = 'signups' | 'members' | 'likes' | 'passes' | 'matches' | 'crushSearches' | 'crushInvites' | 'crushAccepted' | 'subscriptions' | 'messages' | 'revenue' | 'installs';
interface Stats {
  days: number; generatedAt: string; series: Record<Key, SeriesPoint[]>; flows: Record<Exclude<Key, 'members'>, Flow>; totals: { members: number; activeSubscriptions: number }; installs: { total: number; ios: number; android: number; desktop: number };
  crushAcceptRate: number | null; matchRate: number | null; planDistribution: { plan: string; count: number }[];
}
interface Health { activeMembers: number; gender: { men: number; women: number; other: number }; threshold: number; thinPoolShare: number | null; medianPool: number | null; topCities: { city: string; country: string; active: number; men: number; women: number }[] }
interface Sat {
  matchRate: number | null; firstResponseRate: number | null; conversations: number; reciprocalConversations: number; reports: number; reportsOpen: number; premiumConversionRate: number | null;
  retention: { d7: { cohort: number; rate: number | null }; d30: { cohort: number; rate: number | null } };
  calls: { started: number; answerRate: number }; speed: { pairs: number; mutualRate: number }; dates: { proposed: number; acceptRate: number | null; feedbackCount: number; feedbackAverage: number | null };
}
const PERIODS = [7, 30, 90, 180, 365] as const;
export default function AdminStats() {
  const t = useTranslations();
  const locale = useLocale();
  const [period, setPeriod] = useState<Period>({ days: 30 });
  const q = useQuery({ queryKey: ['admin', 'stats', period], queryFn: () => api<Stats>(`/admin/stats?${periodQuery(period)}`), placeholderData: keepPreviousData, refetchInterval: 120_000 });
  const health = useQuery({ queryKey: ['admin', 'stats', 'health'], queryFn: () => api<Health>('/admin/stats/health'), refetchInterval: 300_000 });
  const sat = useQuery({ queryKey: ['admin', 'engagement', 'metrics'], queryFn: () => api<Sat>('/admin/engagement/metrics'), refetchInterval: 300_000 });
  const h = health.data;
  const m = sat.data;
  const d = q.data;
  const nf = new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'fr-FR');
  const n = (v: number) => nf.format(v);
  const xof = (v: number) => formatXof(v, locale);
  const pct = (v: number | null) => (v == null ? t('admin.eng.m.none') : `${nf.format(v)} %`);
  const plansTotal = Math.max(1, d?.planDistribution.reduce((a, p) => a + p.count, 0) ?? 1);
  const day = (iso: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso));
  const periodLabel = 'from' in period ? t('admin.stats.range', { from: day(period.from), to: day(period.to) }) : t('admin.stats.lastDays', { n: period.days });
  return (
    <div className="space-y-6">
      <PageHeader title={t('admin.nav.stats')} description={t('admin.pageDesc.stats')}>
        <div className="flex flex-wrap items-center gap-3">
          <PeriodPicker presets={PERIODS} label={(p) => t(`admin.stats.p${p}`)} value={period} onChange={setPeriod} />
          <Button variant="outline" size="sm" onClick={() => void q.refetch()} loading={q.isFetching} aria-label={t('admin.dash.refresh')}>{!q.isFetching && <RefreshCw className="size-4" aria-hidden />}<span className="max-sm:sr-only">{t('admin.dash.refresh')}</span></Button>
        </div>
      </PageHeader>
      {!d ? <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-72" /></div> : (
        <>
          <section aria-label={t('admin.stats.kpis')} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <KpiCard label={t('admin.stats.k.signups')} value={n(d.flows.signups.current)} flow={d.flows.signups} series={d.series.signups} icon={<UserPlus className="size-5" />} hint={t('admin.stats.k.signupsHint', { total: n(d.totals.members) })} />
            <KpiCard label={t('admin.stats.k.likes')} value={n(d.flows.likes.current)} flow={d.flows.likes} series={d.series.likes} icon={<Heart className="size-5" />} />
            <KpiCard label={t('admin.stats.k.matches')} value={n(d.flows.matches.current)} flow={d.flows.matches} series={d.series.matches} icon={<HeartHandshake className="size-5" />} hint={t('admin.stats.k.matchesHint', { rate: pct(d.matchRate) })} />
            <KpiCard label={t('admin.stats.k.crush')} value={n(d.flows.crushInvites.current)} flow={d.flows.crushInvites} series={d.series.crushInvites} icon={<Radio className="size-5" />} hint={t('admin.stats.k.crushHint', { rate: pct(d.crushAcceptRate) })} />
            <KpiCard label={t('admin.stats.k.subs')} value={n(d.flows.subscriptions.current)} flow={d.flows.subscriptions} series={d.series.subscriptions} icon={<CreditCard className="size-5" />} hint={t('admin.stats.k.subsHint', { n: n(d.totals.activeSubscriptions) })} />
            <KpiCard label={t('admin.stats.k.installs')} value={n(d.flows.installs.current)} flow={d.flows.installs} series={d.series.installs} icon={<Smartphone className="size-5" />} hint={t('admin.stats.k.installsHint', { total: n(d.installs.total), ios: n(d.installs.ios), android: n(d.installs.android), desktop: n(d.installs.desktop) })} />
            <KpiCard label={t('admin.stats.k.revenue')} value={xof(d.flows.revenue.current)} flow={d.flows.revenue} series={d.series.revenue} icon={<Wallet className="size-5" />} />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <LineChart title={t('admin.stats.c.members')} subtitle={t('admin.stats.c.membersSub', { n: n(d.totals.members) })} locale={locale} format={n} lines={[{ key: 'members', label: t('admin.stats.c.members'), points: d.series.members, color: 'text-brand-strong' }]} />
            <TrendChart title={t('admin.stats.c.signups')} points={d.series.signups} format={n} locale={locale} total={t('admin.stats.c.total', { n: n(d.flows.signups.current), period: periodLabel })} delta={d.flows.signups} />
            <LineChart title={t('admin.stats.c.likes')} subtitle={t('admin.stats.c.likesSub', { period: periodLabel })} locale={locale} format={n} delta={d.flows.likes}
              lines={[{ key: 'likes', label: t('admin.stats.l.likes'), points: d.series.likes, color: 'text-brand-strong' }, { key: 'passes', label: t('admin.stats.l.passes'), points: d.series.passes, color: 'text-sky-500' }]} />
            <TrendChart title={t('admin.stats.c.matches')} points={d.series.matches} format={n} locale={locale} total={t('admin.stats.c.total', { n: n(d.flows.matches.current), period: periodLabel })} delta={d.flows.matches} />
            <LineChart title={t('admin.stats.c.crush')} subtitle={t('admin.stats.c.crushSub', { rate: pct(d.crushAcceptRate) })} locale={locale} format={n}
              lines={[{ key: 'crushSearches', label: t('admin.stats.l.searches'), points: d.series.crushSearches, color: 'text-violet-500' }, { key: 'crushInvites', label: t('admin.stats.l.invites'), points: d.series.crushInvites, color: 'text-brand-strong' }, { key: 'crushAccepted', label: t('admin.stats.l.accepted'), points: d.series.crushAccepted, color: 'text-emerald-500' }]} />
            <TrendChart title={t('admin.stats.c.subs')} points={d.series.subscriptions} format={n} locale={locale} total={t('admin.stats.c.total', { n: n(d.flows.subscriptions.current), period: periodLabel })} delta={d.flows.subscriptions} />
            <TrendChart title={t('admin.stats.c.revenue')} points={d.series.revenue} format={xof} locale={locale} total={t('admin.stats.c.total', { n: xof(d.flows.revenue.current), period: periodLabel })} delta={d.flows.revenue} />
            <TrendChart title={t('admin.stats.c.messages')} points={d.series.messages} format={n} locale={locale} total={t('admin.stats.c.total', { n: n(d.flows.messages.current), period: periodLabel })} delta={d.flows.messages} />
          </div>


          <section aria-labelledby="health-h" className="space-y-4">
            <div><h3 id="health-h" className="font-display text-lg font-extrabold">{t('admin.stats.h.title')}</h3><p className="text-sm text-muted">{t('admin.stats.h.help')}</p></div>
            {!h ? <Skeleton className="h-40" /> : (
              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="space-y-4 p-5">
                  <h4 className="font-bold">{t('admin.stats.h.balance')}</h4>
                  {h.activeMembers === 0 ? <p className="text-sm text-muted">{t('admin.dash.noData')}</p> : (() => {
                    const tot = Math.max(1, h.activeMembers);
                    const minority = Math.min(h.gender.men, h.gender.women);
                    const ratio = minority > 0 ? Math.max(h.gender.men, h.gender.women) / minority : null;
                    const seg = [['bg-brand-strong', t('admin.stats.h.women'), h.gender.women], ['bg-sky-500', t('admin.stats.h.men'), h.gender.men], ['bg-muted/50', t('admin.stats.h.other'), h.gender.other]] as const;
                    return (
                      <>
                        <div className="flex h-3 overflow-hidden rounded-full bg-soft" role="img" aria-label={seg.map(([, l, v]) => `${l} ${Math.round((v / tot) * 100)} %`).join(', ')}>{seg.map(([c, l, v]) => <span key={l} className={c} style={{ width: `${(v / tot) * 100}%` }} />)}</div>
                        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">{seg.map(([c, l, v]) => <li key={l} className="flex items-center gap-2"><span className={cn('size-2.5 rounded-full', c)} aria-hidden /><span className="text-muted">{l}</span><span className="font-bold">{n(v)} · {Math.round((v / tot) * 100)} %</span></li>)}</ul>
                        <p className={cn('text-sm font-semibold', ratio != null && ratio <= 1.5 ? 'text-success-ink' : 'text-danger-ink')}>{ratio == null ? t('admin.stats.h.noMinority') : t('admin.stats.h.ratio', { n: nf.format(Math.round(ratio * 10) / 10) })}</p>
                      </>
                    );
                  })()}
                </Card>
                <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  <Metric label={t('admin.stats.h.active')} value={n(h.activeMembers)} hint={t('admin.stats.h.activeHint')} />
                  <Metric label={t('admin.stats.h.thin', { n: h.threshold })} value={pct(h.thinPoolShare)} hint={t('admin.stats.h.thinHint')} />
                  <Metric label={t('admin.stats.h.median')} value={h.medianPool == null ? t('admin.eng.m.none') : n(h.medianPool)} hint={t('admin.stats.h.medianHint')} />
                </dl>
                <Card className="space-y-3 p-5 lg:col-span-2">
                  <h4 className="font-bold">{t('admin.stats.h.cities')}</h4>
                  <ul className="divide-y divide-line">
                    {h.topCities.map((c) => (
                      <li key={`${c.city}-${c.country}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-2 text-sm sm:grid-cols-[1fr_8rem_auto]">
                        <span className="font-semibold">{c.city} <span className="font-normal text-muted">{c.country}</span></span>
                        <span className="hidden h-2 overflow-hidden rounded-full bg-soft sm:flex" aria-hidden><span className="bg-brand-strong" style={{ width: `${(c.women / Math.max(1, c.active)) * 100}%` }} /><span className="bg-sky-500" style={{ width: `${(c.men / Math.max(1, c.active)) * 100}%` }} /></span>
                        <span className="text-right text-muted"><span className="font-bold text-fg">{n(c.active)}</span> {t('admin.stats.h.activeShort')} · {t('admin.stats.h.womenShort', { n: c.women })} · {t('admin.stats.h.menShort', { n: c.men })}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            )}
          </section>

          <section aria-labelledby="sat-h" className="space-y-4">
            <div><h3 id="sat-h" className="font-display text-lg font-extrabold">{t('admin.stats.s.title')}</h3><p className="text-sm text-muted">{t('admin.stats.s.help')}</p></div>
            {!m ? <Skeleton className="h-40" /> : (
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                <Metric label={t('admin.stats.s.match')} value={pct(m.matchRate)} hint={t('admin.stats.s.matchHint')} />
                <Metric label={t('admin.stats.s.reply')} value={pct(m.firstResponseRate)} hint={t('admin.stats.s.replyHint')} />
                <Metric label={t('admin.stats.s.mutual')} value={pct(m.conversations ? Math.round((m.reciprocalConversations / m.conversations) * 100) : null)} hint={t('admin.stats.s.mutualHint')} />
                <Metric label={t('admin.stats.s.d7')} value={pct(m.retention.d7.rate)} hint={t('admin.stats.s.cohort', { n: m.retention.d7.cohort })} />
                <Metric label={t('admin.stats.s.d30')} value={pct(m.retention.d30.rate)} hint={t('admin.stats.s.cohort', { n: m.retention.d30.cohort })} />
                <Metric label={t('admin.stats.s.dateNote')} value={m.dates.feedbackAverage == null ? t('admin.eng.m.none') : `${nf.format(m.dates.feedbackAverage)} / 5`} hint={t('admin.stats.s.dateNoteHint', { n: m.dates.feedbackCount })} />
                <Metric label={t('admin.stats.s.dateAccept')} value={pct(m.dates.acceptRate)} hint={t('admin.stats.s.dateAcceptHint', { n: m.dates.proposed })} />
                <Metric label={t('admin.stats.s.calls')} value={m.calls.started ? pct(Math.round(m.calls.answerRate * 100)) : t('admin.eng.m.none')} hint={t('admin.stats.s.callsHint', { n: m.calls.started })} />
                <Metric label={t('admin.stats.s.speed')} value={m.speed.pairs ? pct(Math.round(m.speed.mutualRate * 100)) : t('admin.eng.m.none')} hint={t('admin.stats.s.speedHint', { n: m.speed.pairs })} />
                <Metric label={t('admin.stats.s.premium')} value={pct(m.premiumConversionRate)} hint={t('admin.stats.s.premiumHint')} />
                <Metric label={t('admin.stats.s.reports')} value={n(m.reportsOpen)} hint={t('admin.stats.s.reportsHint', { n: m.reports })} />
              </dl>
            )}
          </section>

          <Card className="space-y-4 p-5">
            <h3 className="font-bold">{t('admin.stats.plans')}</h3>
            <div className="flex h-3 overflow-hidden rounded-full bg-soft" role="img" aria-label={t('admin.stats.plans')}>
              {d.planDistribution.map((p, i) => <span key={p.plan} className={['bg-brand-strong', 'bg-brand-strong-2', 'bg-brand/50', 'bg-brand/25'][i % 4]} style={{ width: `${(p.count / plansTotal) * 100}%` }} />)}
            </div>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {d.planDistribution.map((p, i) => <li key={p.plan} className="flex items-center gap-2"><span className={cn('size-2.5 rounded-full', ['bg-brand-strong', 'bg-brand-strong-2', 'bg-brand/50', 'bg-brand/25'][i % 4])} aria-hidden /><span className="text-muted">{p.plan}</span><span className="font-bold">{n(p.count)}</span></li>)}
            </ul>
          </Card>
          <p className="text-xs text-muted">{t('admin.stats.note')}</p>
        </>
      )}
    </div>
  );
}
