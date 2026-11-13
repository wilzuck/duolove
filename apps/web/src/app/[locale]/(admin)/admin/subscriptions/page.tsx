'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Badge, Button, DataTableView, Skeleton } from '@duomatch/ui';
import { PageHeader, StatStrip, countOf, useAdminSummary } from '@/components/admin/PageParts';
import { useAdminList } from '@/hooks/useAdmin';
import { useTableLabels } from '@/hooks/useTableLabels';
import { post } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useUi } from '@/lib/store';

interface Sub { id: string; displayName: string; plan: string; status: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; provider: string }

export default function AdminSubscriptions() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const tableLabels = useTableLabels();
  const sum = useAdminSummary().data?.subscriptions;
  const subs = useAdminList<Sub>(['subs'], '/admin/subscriptions');
  const d = (v: string) => formatDate(v, locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const job = useMutation({ mutationFn: () => post<{ expired: number; reminded: number }>('/admin/jobs/expire-subscriptions'), onSuccess: (r) => { toast('success', t('admin.jobDone', { a: r.expired, b: r.reminded })); void qc.invalidateQueries({ queryKey: ['admin'] }); } });
  return (
    <div className="space-y-6">
      <PageHeader title={t('admin.nav.subscriptions')} description={t('admin.pageDesc.subscriptions')}>
        <Button variant="outline" size="sm" onClick={() => job.mutate()} loading={job.isPending}>{t('admin.runExpiry')}</Button>
      </PageHeader>
      <StatStrip items={[
        { label: t('admin.strip.subActive'), value: countOf(sum, 'ACTIVE'), tone: 'success' },
        { label: t('admin.strip.pastDue'), value: countOf(sum, 'PAST_DUE'), tone: 'warn' },
        { label: t('admin.strip.canceled'), value: countOf(sum, 'CANCELED') },
        { label: t('admin.strip.expired'), value: countOf(sum, 'EXPIRED') },
      ]} />
      <section aria-label={t('admin.billing.subscriptions')}>
        {subs.isLoading ? <Skeleton className="h-32" /> : <DataTableView
          rows={subs.items} rowKey={(s) => s.id} empty={t('admin.empty')} labels={tableLabels} exportName="abonnements"
          hasMore={subs.hasNextPage} onLoadMore={() => void subs.fetchNextPage()} loadingMore={subs.isFetchingNextPage}
          columns={[
            { key: 'name', header: t('admin.cols.name'), value: (s) => s.displayName, cellClassName: 'font-medium', cell: (s) => s.displayName },
            { key: 'plan', header: t('admin.cols.plan'), value: (s) => s.plan, filter: { options: ['PREMIUM', 'VIP', 'GOLD'].map((p) => ({ value: p, label: p })) }, cell: (s) => s.plan },
            { key: 'status', header: t('admin.cols.status'), value: (s) => s.status, filter: { options: ['PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED'].map((x) => ({ value: x, label: x })) }, cell: (s) => <Badge tone={s.status === 'ACTIVE' ? 'success' : 'neutral'}>{s.status}</Badge> },
            { key: 'ends', header: t('admin.cols.ends'), value: (s) => s.currentPeriodEnd ?? '', cellClassName: 'text-muted', cell: (s) => `${s.currentPeriodEnd ? d(s.currentPeriodEnd) : '—'}${s.cancelAtPeriodEnd ? ` (${t('admin.cancelling')})` : ''}` },
          ]}
        />}
      </section>
    </div>
  );
}
