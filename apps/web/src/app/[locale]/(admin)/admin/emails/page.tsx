'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle, MailCheck, MailWarning, Percent } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge, Card, DataTableView, Skeleton, cn } from '@duomatch/ui';
import { KpiCard, type SeriesPoint } from '@/components/admin/DashboardParts';
import { PageHeader, StatusTabs } from '@/components/admin/PageParts';
import { LineChart } from '@/components/admin/StatsCharts';
import { useAdminList } from '@/hooks/useAdmin';
import { useTableLabels } from '@/hooks/useTableLabels';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';

const KINDS = ['verification', 'password_reset', 'magic_link', 'notification', 'newsletter', 'newsletter_confirm', 'newsletter_test', 'other'] as const;
interface Row { id: string; to: string; subject: string; kind: string; status: 'SENT' | 'FAILED'; provider: string; error: string | null; createdAt: string }
interface Stats {
  days: number; provider: 'brevo' | 'smtp' | 'dev'; sent: number; failed: number; successRate: number | null; byKind: { kind: string; sent: number; failed: number }[];
  series: { sent: SeriesPoint[]; failed: SeriesPoint[] }; lastFailure: Row | null;
}
const PERIODS = [7, 30, 90] as const;

function Banner({ tone, title, children }: { tone: 'warning' | 'danger'; title: string; children?: React.ReactNode }) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('rounded-2xl border px-4 py-3 text-sm', tone === 'danger' ? 'border-danger/30 bg-danger/10 text-danger-ink' : 'border-gold/40 bg-gold/10 text-gold-ink')}>
      <p className="flex items-center gap-2 font-bold"><AlertTriangle className="size-4 shrink-0" aria-hidden />{title}</p>
      {children && <div className="mt-1">{children}</div>}
    </div>
  );
}

export default function AdminEmails() {
  const t = useTranslations();
  const locale = useLocale();
  const labels = useTableLabels();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [status, setStatus] = useState<'ALL' | 'SENT' | 'FAILED'>('ALL');
  const stats = useQuery({ queryKey: ['admin', 'emails', 'stats', days], queryFn: () => api<Stats>(`/admin/emails/stats?days=${days}`), placeholderData: keepPreviousData, refetchInterval: 60_000 });
  const list = useAdminList<Row>(['emails', status], `/admin/emails${status === 'ALL' ? '' : `?status=${status}`}`);
  const s = stats.data;
  const nf = new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'fr-FR');
  const kindName = (k: string) => t(`admin.em.kinds.${(KINDS as readonly string[]).includes(k) ? k : 'other'}` as never);
  return (
    <div className="space-y-6">
      <PageHeader title={t('admin.nav.emails')} description={t('admin.pageDesc.emails')}>
        <div role="group" aria-label={t('admin.dash.period')} className="inline-flex rounded-full border border-field-line bg-field p-1">
          {PERIODS.map((p) => <button key={p} type="button" aria-pressed={days === p} onClick={() => setDays(p)} className={cn('rounded-full px-3.5 py-1.5 text-sm font-semibold transition', days === p ? 'bg-brand-strong text-white' : 'text-muted hover:bg-soft hover:text-fg')}>{t(`admin.dash.p${p}`)}</button>)}
        </div>
      </PageHeader>
      {s?.provider === 'dev' && <Banner tone="warning" title={t('admin.em.noProviderTitle')}>{t('admin.em.noProvider')}</Banner>}
      {!s ? <Skeleton className="h-32" /> : (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <KpiCard label={t('admin.em.sent')} value={nf.format(s.sent)} icon={<MailCheck className="size-5" />} series={s.series.sent} hint={t('admin.em.provider', { name: s.provider === 'brevo' ? 'Brevo' : s.provider === 'smtp' ? 'SMTP' : t('admin.em.devProvider') })} />
            <KpiCard label={t('admin.em.failed')} value={nf.format(s.failed)} icon={<MailWarning className="size-5" />} series={s.series.failed} hint={t('admin.em.failedHint')} />
            <KpiCard label={t('admin.em.rate')} value={s.successRate == null ? t('admin.eng.m.none') : `${nf.format(s.successRate)} %`} icon={<Percent className="size-5" />} hint={t('admin.em.rateHint')} />
          </section>
          {s.lastFailure && (
            <Banner tone="danger" title={t('admin.em.lastFailure', { when: timeAgo(s.lastFailure.createdAt, locale) })}>
              <span className="block"><span className="font-semibold">{kindName(s.lastFailure.kind)}</span> · {s.lastFailure.to}</span>
              <span className="mt-1 block break-words font-mono text-xs">{s.lastFailure.error ?? t('admin.em.noError')}</span>
            </Banner>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <LineChart title={t('admin.em.chart')} locale={locale} format={(v) => nf.format(v)} lines={[{ key: 'sent', label: t('admin.em.sent'), points: s.series.sent, color: 'text-brand-strong' }, { key: 'failed', label: t('admin.em.failed'), points: s.series.failed, color: 'text-amber-500' }]} />
            <Card className="space-y-3 p-5">
              <h3 className="font-bold">{t('admin.em.byKind')}</h3>
              {s.byKind.length === 0 ? <p className="text-sm text-muted">{t('admin.dash.noData')}</p> : (
                <ul className="divide-y divide-line text-sm">
                  {s.byKind.map((k) => <li key={k.kind} className="flex items-center justify-between gap-3 py-2"><span>{kindName(k.kind)}</span><span className="text-muted"><span className="font-bold text-fg">{nf.format(k.sent)}</span> {t('admin.em.sentShort')}{k.failed > 0 && <span className="ml-2 font-semibold text-danger-ink">{t('admin.nl.failedN', { n: k.failed })}</span>}</span></li>)}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
      <section className="space-y-3">
        <StatusTabs label={t('admin.status')} value={status} onChange={setStatus} options={[{ key: 'ALL', label: t('admin.em.all') }, { key: 'SENT', label: t('admin.em.statuses.SENT') }, { key: 'FAILED', label: t('admin.em.statuses.FAILED') }]} />
        {list.isLoading ? <Skeleton className="h-40" /> : (
          <DataTableView
            minWidth="52rem" rows={list.items} rowKey={(r) => r.id} empty={t('admin.em.empty')} labels={labels} exportName="emails-envoyes"
            hasMore={list.hasNextPage} onLoadMore={() => void list.fetchNextPage()} loadingMore={list.isFetchingNextPage}
            columns={[
              { key: 'to', header: t('admin.em.to'), value: (r) => r.to, filter: 'text', cell: (r) => r.to },
              { key: 'subject', header: t('admin.em.subject'), value: (r) => r.subject, cellClassName: 'max-w-xs truncate', cell: (r) => r.subject },
              { key: 'kind', header: t('admin.em.kind'), value: (r) => r.kind, filter: { options: KINDS.map((k) => ({ value: k, label: kindName(k) })) }, cell: (r) => <Badge tone="neutral">{kindName(r.kind)}</Badge> },
              { key: 'status', header: t('admin.status'), value: (r) => r.status, cell: (r) => r.status === 'SENT' ? <Badge tone="success">{t('admin.em.statuses.SENT')}</Badge> : <span><Badge tone="danger"><AlertTriangle className="size-3" aria-hidden />{t('admin.em.statuses.FAILED')}</Badge>{r.error && <span className="mt-1 block max-w-xs break-words text-xs text-muted">{r.error}</span>}</span> },
              { key: 'date', mobileHidden: true, header: t('admin.cols.date'), value: (r) => r.createdAt, cellClassName: 'text-muted', cell: (r) => timeAgo(r.createdAt, locale) },
            ]}
          />
        )}
      </section>
    </div>
  );
}
