'use client';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Flag, ShieldCheck, UserCheck } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { timeAgo } from '@/lib/format';
import { Card, Skeleton } from '@duomatch/ui';
import { api } from '@/lib/api';
import { formatXof } from '@/lib/format';

interface Overview {
  planDistribution: { plan: string; count: number }[]; recentSignups: { id: string; displayName: string; city: string; country: string; createdAt: string }[]; topCountries: { country: string; count: number }[];
  users: number; signups7: number; signups30: number; active7: number; profilesCompleted: number; likes: number; matches: number; activeConversations: number;
  activeSubscriptions: number; revenueXof: number; revenue30dXof: number; conversionRate: number; retentionD7: number; signupsPerDay: { day: string; count: number }[];
}

export default function AdminOverview() {
  const t = useTranslations();
  const locale = useLocale();
  const { data } = useQuery({ queryKey: ['admin', 'overview'], queryFn: () => api<Overview>('/admin/overview') });
  const badges = useQuery({ queryKey: ['admin', 'badges'], queryFn: () => api<{ reports: number; verifications: number; appeals: number }>('/admin/badges') });
  if (!data) return <Skeleton className="h-64" />;
  const n = (v: number) => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'fr-FR').format(v);
  const stats: [string, string][] = [
    ['users', n(data.users)], ['signups7', n(data.signups7)], ['signups30', n(data.signups30)], ['active7', n(data.active7)], ['profilesCompleted', n(data.profilesCompleted)], ['likes', n(data.likes)],
    ['matches', n(data.matches)], ['activeConversations', n(data.activeConversations)], ['activeSubscriptions', n(data.activeSubscriptions)], ['revenue', formatXof(data.revenueXof, locale)],
    ['revenue30', formatXof(data.revenue30dXof, locale)], ['conversion', `${data.conversionRate} %`], ['retention', `${data.retentionD7} %`],
  ];
  const max = Math.max(1, ...data.signupsPerDay.map((d) => d.count));
  const todo = badges.data;
  const planTotal = Math.max(1, data.planDistribution.reduce((a, p) => a + p.count, 0));
  const topMax = Math.max(1, ...data.topCountries.map((c) => c.count));
  return (
    <div className="space-y-6">
      <section aria-label={t('admin.todo')} className="grid gap-3 sm:grid-cols-3">
        {([['/admin/reports', Flag, 'reports', todo?.reports], ['/admin/moderation', UserCheck, 'verifications', todo?.verifications], ['/admin/moderation', ShieldCheck, 'appeals', todo?.appeals]] as const).map(([href, Icon, k, n]) => (
          <Link key={k} href={href} className="flex items-center gap-4 rounded-3xl border border-line bg-card p-4 shadow-soft transition hover:-translate-y-0.5">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-soft text-brand"><Icon className="size-5" aria-hidden /></span>
            <span><span className="block font-display text-2xl font-extrabold">{n ?? '–'}</span><span className="text-sm text-muted">{t(`admin.todoItems.${k}`)}</span></span>
          </Link>
        ))}
      </section>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {stats.map(([k, v]) => <Card key={k} className="p-4"><dt className="text-sm text-muted">{t(`admin.stats.${k}`)}</dt><dd className="mt-1 font-display text-2xl font-extrabold">{v}</dd></Card>)}
      </dl>
      <Card className="p-5"><h2 className="mb-4 font-bold">{t('admin.stats.signupsChart')}</h2>
        {data.signupsPerDay.length === 0 ? <p className="text-sm text-muted">{t('admin.empty')}</p> : (
          <ul className="flex h-40 items-end gap-2" aria-label={t('admin.stats.signupsChart')}>{data.signupsPerDay.map((d) => (
            <li key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1"><span className="text-xs font-semibold">{d.count}</span><span className="w-full rounded-t-lg bg-linear-to-t from-brand-strong to-brand-2" style={{ height: `${(d.count / max) * 100}%`, minHeight: 4 }} /><time className="text-[10px] text-muted" dateTime={d.day}>{d.day.slice(5)}</time></li>
          ))}</ul>
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5"><h2 className="mb-4 font-bold">{t('admin.plansTitle')}</h2>
          <ul className="space-y-3">{data.planDistribution.map((p) => (
            <li key={p.plan}><div className="mb-1 flex justify-between text-sm"><span>{t(`plans.${p.plan}.name` as never)}</span><span className="font-semibold">{p.count}</span></div><div className="h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-linear-to-r from-brand-2 to-brand-strong" style={{ width: `${(p.count / planTotal) * 100}%` }} /></div></li>
          ))}</ul></Card>
        <Card className="p-5"><h2 className="mb-4 font-bold">{t('admin.countriesTitle')}</h2>
          <ul className="space-y-3">{data.topCountries.map((c) => (
            <li key={c.country}><div className="mb-1 flex justify-between text-sm"><span>{c.country}</span><span className="font-semibold">{c.count}</span></div><div className="h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-navy" style={{ width: `${(c.count / topMax) * 100}%` }} /></div></li>
          ))}</ul></Card>
        <Card className="p-5"><h2 className="mb-4 font-bold">{t('admin.recentTitle')}</h2>
          <ul className="space-y-3">{data.recentSignups.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0"><span className="block truncate font-semibold">{u.displayName}</span><span className="text-muted">{u.city}, {u.country}</span></span><time className="shrink-0 text-xs text-muted" dateTime={u.createdAt}>{timeAgo(u.createdAt, locale)}</time></li>
          ))}</ul></Card>
      </div>
    </div>
  );
}
