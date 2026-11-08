'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CircleCheck, Crown, Flag, HeartHandshake, RefreshCw, ShieldCheck, UserCheck, Users, Wallet } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, Card, Skeleton, cn } from '@duomatch/ui';
import { KpiCard, Metric, TrendChart, type Flow, type SeriesPoint } from '@/components/admin/DashboardParts';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { formatXof, timeAgo } from '@/lib/format';

interface Overview {
  planDistribution: { plan: string; count: number }[]; recentSignups: { id: string; displayName: string; city: string; country: string; createdAt: string }[]; topCountries: { country: string; count: number }[];
  users: number; active7: number; profilesCompleted: number; activeConversations: number; activeSubscriptions: number; conversionRate: number; retentionD7: number; refundedXof: number;
  generatedAt: string;
  period: { days: 7 | 30 | 90; signups: Flow; likes: Flow; matches: Flow; messages: Flow; revenue: Flow; series: { signups: SeriesPoint[]; likes: SeriesPoint[]; matches: SeriesPoint[]; messages: SeriesPoint[]; revenue: SeriesPoint[] } };
}
const PERIODS = [7, 30, 90] as const;

export default function AdminOverview() {
  const t = useTranslations();
  const locale = useLocale();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const q = useQuery({ queryKey: ['admin', 'overview', days], queryFn: () => api<Overview>(`/admin/overview?days=${days}`), placeholderData: keepPreviousData, refetchInterval: 60_000 });
  const badges = useQuery({ queryKey: ['admin', 'badges'], queryFn: () => api<{ reports: number; verifications: number; appeals: number }>('/admin/badges'), refetchInterval: 60_000 });
  const data = q.data;
  const n = (v: number) => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'fr-FR').format(v);
  const xof = (v: number) => formatXof(v, locale);
  const todo = badges.data;
  const pending = (todo?.reports ?? 0) + (todo?.verifications ?? 0) + (todo?.appeals ?? 0);
  const planTotal = Math.max(1, data?.planDistribution.reduce((a, p) => a + p.count, 0) ?? 1);
  const topMax = Math.max(1, ...(data?.topCountries.map((c) => c.count) ?? [1]));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-extrabold">{t('admin.dash.title')}</h2>
        <div className="flex flex-wrap items-center gap-3">
          {data && <span className="text-xs text-muted">{t('admin.dash.updated', { time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(data.generatedAt)) })}</span>}
          <div role="group" aria-label={t('admin.dash.period')} className="inline-flex rounded-full border border-field-line bg-field p-1">
            {PERIODS.map((p) => (
              <button key={p} type="button" aria-pressed={days === p} onClick={() => setDays(p)}
                className={cn('rounded-full px-3.5 py-1.5 text-sm font-semibold transition', days === p ? 'bg-brand-strong text-white' : 'text-muted hover:bg-soft hover:text-fg')}>{t(`admin.dash.p${p}`)}</button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => { void q.refetch(); void badges.refetch(); }} loading={q.isFetching} aria-label={t('admin.dash.refresh')}>{!q.isFetching && <RefreshCw className="size-4" aria-hidden />}<span className="max-sm:sr-only">{t('admin.dash.refresh')}</span></Button>
        </div>
      </div>

      <section aria-labelledby="todo-h" className="space-y-3">
        <h3 id="todo-h" className="sr-only">{t('admin.dash.todo')}</h3>
        {todo && pending === 0 ? (
          <p className="flex items-center gap-3 rounded-3xl border border-line bg-card p-4 text-sm text-muted"><CircleCheck className="size-5 text-success-ink" aria-hidden />{t('admin.dash.allClear')}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {([['/admin/reports', Flag, 'reports', todo?.reports], ['/admin/moderation', UserCheck, 'verifications', todo?.verifications], ['/admin/moderation', ShieldCheck, 'appeals', todo?.appeals]] as const).map(([href, Icon, k, count]) => (
              <Link key={k} href={href} className={cn('flex items-center gap-4 rounded-3xl border bg-card p-4 shadow-soft transition hover:-translate-y-0.5', count ? 'border-brand-strong' : 'border-line')}>
                <span className="flex size-11 items-center justify-center rounded-2xl bg-soft text-brand"><Icon className="size-5" aria-hidden /></span>
                <span><span className="block font-display text-2xl font-extrabold">{count ?? '–'}</span><span className="text-sm text-muted">{t(`admin.todoItems.${k}`)}</span></span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {!data ? <div className="space-y-4"><Skeleton className="h-36" /><Skeleton className="h-64" /></div> : (
        <>
          <section aria-label={t('admin.dash.vsPrev', { days: data.period.days })} className="space-y-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard icon={<Users className="size-5" />} label={t('admin.dash.members')} value={n(data.users)} hint={t('admin.dash.membersHint', { n: n(data.period.signups.current) })} flow={data.period.signups} series={data.period.series.signups} />
              <KpiCard icon={<Wallet className="size-5" />} label={t('admin.dash.revenue')} value={xof(data.period.revenue.current)} hint={t('admin.dash.revenueHint')} flow={data.period.revenue} series={data.period.series.revenue} />
              <KpiCard icon={<HeartHandshake className="size-5" />} label={t('admin.dash.matches')} value={n(data.period.matches.current)} hint={t('admin.dash.matchesHint')} flow={data.period.matches} series={data.period.series.matches} />
              <KpiCard icon={<Crown className="size-5" />} label={t('admin.dash.subscribers')} value={n(data.activeSubscriptions)} hint={t('admin.dash.subscribersHint', { rate: data.conversionRate })} />
            </div>
            <p className="text-xs text-muted">{t('admin.dash.vsPrev', { days: data.period.days })}</p>
          </section>

          <section aria-labelledby="charts-h" className="space-y-3">
            <h3 id="charts-h" className="font-display text-lg font-bold">{t('admin.dash.growth')} · {t('admin.dash.revenueSection')}</h3>
            <div className="grid gap-4 lg:grid-cols-2">
              <TrendChart title={t('admin.dash.signupsChart')} points={data.period.series.signups} format={n} locale={locale} total={t('admin.dash.signupsTotal', { n: n(data.period.signups.current) })} delta={data.period.signups} />
              <TrendChart title={t('admin.dash.revenueChart')} points={data.period.series.revenue} format={xof} locale={locale} total={t('admin.dash.revenueTotal', { amount: xof(data.period.revenue.current), refunded: xof(data.refundedXof) })} delta={data.period.revenue} />
            </div>
          </section>

          <section aria-labelledby="eng-h" className="space-y-3">
            <div><h3 id="eng-h" className="font-display text-lg font-bold">{t('admin.dash.engagement')}</h3><p className="text-sm text-muted">{t('admin.dash.engagementHint')}</p></div>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label={t('admin.dash.likes')} value={n(data.period.likes.current)} flow={data.period.likes} />
              <Metric label={t('admin.dash.messages')} value={n(data.period.messages.current)} flow={data.period.messages} />
              <Metric label={t('admin.dash.active7')} value={n(data.active7)} hint={t('admin.dash.active7Hint')} />
              <Metric label={t('admin.dash.activeConv')} value={n(data.activeConversations)} hint={t('admin.dash.activeConvHint')} />
              <Metric label={t('admin.dash.completed')} value={n(data.profilesCompleted)} hint={t('admin.dash.completedHint')} />
              <Metric label={t('admin.dash.retention')} value={`${data.retentionD7} %`} hint={t('admin.dash.retentionHint')} />
              <Metric label={t('admin.dash.conversion')} value={`${data.conversionRate} %`} hint={t('admin.dash.conversionHint')} />
            </dl>
          </section>

          <section aria-labelledby="brk-h" className="space-y-3">
            <h3 id="brk-h" className="font-display text-lg font-bold">{t('admin.dash.breakdown')}</h3>
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="p-5"><h4 className="mb-4 font-bold">{t('admin.plansTitle')}</h4>
                <ul className="space-y-3">{data.planDistribution.map((p) => (
                  <li key={p.plan}><div className="mb-1 flex justify-between text-sm"><span>{t(`plans.${p.plan}.name` as never)}</span><span className="font-semibold">{n(p.count)} <span className="font-normal text-muted">({Math.round((p.count / planTotal) * 100)} %)</span></span></div><div className="h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-linear-to-r from-brand-2 to-brand-strong" style={{ width: `${(p.count / planTotal) * 100}%` }} /></div></li>
                ))}</ul></Card>
              <Card className="p-5"><h4 className="mb-4 font-bold">{t('admin.countriesTitle')}</h4>
                <ul className="space-y-3">{data.topCountries.map((c) => (
                  <li key={c.country}><div className="mb-1 flex justify-between text-sm"><span>{c.country}</span><span className="font-semibold">{n(c.count)}</span></div><div className="h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-navy" style={{ width: `${(c.count / topMax) * 100}%` }} /></div></li>
                ))}</ul></Card>
              <Card className="p-5"><h4 className="mb-4 font-bold">{t('admin.recentTitle')}</h4>
                <ul className="space-y-3">{data.recentSignups.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0"><span className="block truncate font-semibold">{u.displayName}</span><span className="text-muted">{u.city}, {u.country}</span></span><time className="shrink-0 text-xs text-muted" dateTime={u.createdAt}>{timeAgo(u.createdAt, locale)}</time></li>
                ))}</ul></Card>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
