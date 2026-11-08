'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Eye, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge, DataTableView, Skeleton } from '@duomatch/ui';
import { PageHeader, StatusTabs, countOf, useAdminSummary } from '@/components/admin/PageParts';
import { useAdminList } from '@/hooks/useAdmin';
import { useApiError } from '@/hooks/useApiError';
import { useTableLabels } from '@/hooks/useTableLabels';
import { post } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { useUi } from '@/lib/store';
import { Link } from '@/i18n/navigation';

interface Report { id: string; reason: string; details: string | null; status: string; createdAt: string; reporter: { displayName?: string }; target: { id: string; displayName?: string; status: string; totalReports: number } }

export default function AdminReports() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const tableLabels = useTableLabels();
  const sum = useAdminSummary().data;
  const [status, setStatus] = useState('OPEN');
  const list = useAdminList<Report>(['reports', status], `/admin/reports?status=${status}`);
  const resolve = useMutation({ mutationFn: ({ id, s }: { id: string; s: string }) => post(`/admin/reports/${id}/resolve`, { status: s }), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }), onError: (e) => toast('error', err(e)) });
  return (
    <div className="space-y-4">
      <PageHeader title={t('admin.nav.reports')} description={t('admin.pageDesc.reports')} />
      <StatusTabs label={t('admin.status')} value={status} onChange={setStatus} options={['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'].map((s) => ({ key: s, label: t(`admin.reportStatus.${s}`), count: countOf(sum?.reports, s) }))} />
      {list.isLoading ? <Skeleton className="h-40" /> : (
        <DataTableView
          minWidth="48rem" rows={list.items} rowKey={(r) => r.id} empty={t('admin.noReports')} labels={tableLabels} exportName="signalements"
          hasMore={list.hasNextPage} onLoadMore={() => void list.fetchNextPage()} loadingMore={list.isFetchingNextPage}
          rowActions={(r) => [
            ...(r.status !== 'REVIEWING' ? [{ label: t('admin.review'), icon: <Eye className="size-4" aria-hidden />, onSelect: () => resolve.mutate({ id: r.id, s: 'REVIEWING' }) }] : []),
            { label: t('admin.resolve'), icon: <Check className="size-4" aria-hidden />, onSelect: () => resolve.mutate({ id: r.id, s: 'RESOLVED' }) },
            { label: t('admin.dismiss'), icon: <X className="size-4" aria-hidden />, onSelect: () => resolve.mutate({ id: r.id, s: 'DISMISSED' }) },
          ]}
          columns={[
            { key: 'reason', header: t('admin.cols.reason'), value: (r) => r.reason, filter: { options: ['FAKE_PROFILE', 'SCAM', 'HARASSMENT', 'INAPPROPRIATE_CONTENT', 'UNDERAGE', 'SPAM', 'OTHER'].map((x) => ({ value: x, label: t(`report.reasons.${x}` as never) })) }, cell: (r) => <Badge tone="danger">{t(`report.reasons.${r.reason}` as never)}</Badge> },
            { key: 'target', header: t('admin.cols.target'), value: (r) => r.target.displayName ?? '', cell: (r) => <><Link href={`/admin/users?focus=${r.target.id}`} className="font-semibold text-brand-ink underline">{r.target.displayName}</Link><span className="block text-xs text-muted">{t('admin.totalReports', { n: r.target.totalReports })}</span></> },
            { key: 'reporter', mobileHidden: true, header: t('admin.cols.reporter'), value: (r) => r.reporter.displayName ?? '', cell: (r) => r.reporter.displayName ?? '?' },
            { key: 'details', header: t('admin.cols.message'), value: (r) => r.details ?? '', cellClassName: 'max-w-xs whitespace-pre-wrap', cell: (r) => r.details ?? '—' },
            { key: 'date', mobileHidden: true, header: t('admin.cols.date'), value: (r) => r.createdAt, cellClassName: 'text-muted', cell: (r) => timeAgo(r.createdAt, locale) },
          ]}
        />
      )}
    </div>
  );
}
