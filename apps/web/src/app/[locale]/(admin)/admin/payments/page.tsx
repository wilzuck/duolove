'use client';
import { useLocale, useTranslations } from 'next-intl';
import { Badge, DataTableView, Skeleton } from '@duomatch/ui';
import { PageHeader, StatStrip, countOf, useAdminSummary } from '@/components/admin/PageParts';
import { useAdminList } from '@/hooks/useAdmin';
import { useTableLabels } from '@/hooks/useTableLabels';
import { formatDate, formatXof } from '@/lib/format';

interface Pay { id: string; displayName: string; amountXof: number; status: string; provider: string; failureReason: string | null; invoiceNumber: string | null; createdAt: string }

export default function AdminPayments() {
  const t = useTranslations();
  const locale = useLocale();
  const tableLabels = useTableLabels();
  const sum = useAdminSummary().data?.payments;
  const pays = useAdminList<Pay>(['pays'], '/admin/payments');
  const d = (v: string) => formatDate(v, locale, { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <div className="space-y-6">
      <PageHeader title={t('admin.nav.payments')} description={t('admin.pageDesc.payments')} />
      <StatStrip items={[
        { label: t('admin.strip.revenue30'), value: sum ? formatXof(sum.revenue30 ?? 0, locale) : undefined },
        { label: t('admin.strip.succeeded'), value: countOf(sum, 'SUCCEEDED'), tone: 'success' },
        { label: t('admin.strip.failed'), value: countOf(sum, 'FAILED'), tone: 'danger' },
        { label: t('admin.strip.pending'), value: countOf(sum, 'PENDING'), tone: 'warn' },
      ]} />
      <section aria-label={t('admin.billing.payments')}>
        {pays.isLoading ? <Skeleton className="h-32" /> : (
          <DataTableView
            minWidth="44rem" rows={pays.items} rowKey={(p) => p.id} empty={t('admin.empty')} labels={tableLabels} exportName="paiements"
            hasMore={pays.hasNextPage} onLoadMore={() => void pays.fetchNextPage()} loadingMore={pays.isFetchingNextPage}
            columns={[
              { key: 'name', header: t('admin.cols.name'), value: (p) => p.displayName, cellClassName: 'font-medium', cell: (p) => p.displayName },
              { key: 'amount', header: t('admin.cols.amount'), value: (p) => p.amountXof, cell: (p) => formatXof(p.amountXof, locale) },
              { key: 'status', header: t('admin.cols.status'), value: (p) => p.status, filter: { options: ['PENDING', 'SUCCEEDED', 'FAILED'].map((s) => ({ value: s, label: s })) }, cell: (p) => <Badge tone={p.status === 'SUCCEEDED' ? 'success' : p.status === 'FAILED' ? 'danger' : 'neutral'}>{p.status}</Badge> },
              { key: 'invoice', mobileHidden: true, header: t('admin.cols.invoice'), value: (p) => p.invoiceNumber ?? '', cellClassName: 'text-muted', cell: (p) => p.invoiceNumber ?? '—' },
              { key: 'date', header: t('admin.cols.date'), value: (p) => p.createdAt, cellClassName: 'text-muted', cell: (p) => d(p.createdAt) },
            ]}
          />
        )}
      </section>
    </div>
  );
}
