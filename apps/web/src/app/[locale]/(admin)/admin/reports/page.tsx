'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge, Button, Card, EmptyState, Select, Skeleton } from '@duomatch/ui';
import { useAdminList } from '@/hooks/useAdmin';
import { useApiError } from '@/hooks/useApiError';
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
  const [status, setStatus] = useState('OPEN');
  const list = useAdminList<Report>(['reports', status], `/admin/reports?status=${status}`);
  const resolve = useMutation({ mutationFn: ({ id, s }: { id: string; s: string }) => post(`/admin/reports/${id}/resolve`, { status: s }), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }), onError: (e) => toast('error', err(e)) });
  return (
    <div className="space-y-4">
      <Select aria-label={t('admin.status')} value={status} onChange={(e) => setStatus(e.target.value)} className="w-52">{['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'].map((s) => <option key={s} value={s}>{t(`admin.reportStatus.${s}`)}</option>)}</Select>
      {list.isLoading && <Skeleton className="h-40" />}
      {!list.isLoading && list.items.length === 0 && <EmptyState icon={<span aria-hidden>✅</span>} title={t('admin.noReports')} />}
      <ul className="space-y-3">{list.items.map((r) => (
        <li key={r.id}><Card className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2"><Badge tone="danger">{t(`report.reasons.${r.reason}` as never)}</Badge><span className="text-sm text-muted">{timeAgo(r.createdAt, locale)} · {t('admin.by', { name: r.reporter.displayName ?? '?' })}</span></div>
          <p><Link href={`/admin/users?focus=${r.target.id}`} className="font-semibold text-brand-ink underline">{r.target.displayName}</Link> <span className="text-sm text-muted">({t('admin.totalReports', { n: r.target.totalReports })})</span></p>
          {r.details && <p className="rounded-2xl bg-soft p-3 text-sm">{r.details}</p>}
          <div className="flex flex-wrap gap-2">
            {r.status !== 'REVIEWING' && <Button size="sm" variant="outline" onClick={() => resolve.mutate({ id: r.id, s: 'REVIEWING' })}>{t('admin.review')}</Button>}
            <Button size="sm" onClick={() => resolve.mutate({ id: r.id, s: 'RESOLVED' })}>{t('admin.resolve')}</Button>
            <Button size="sm" variant="ghost" onClick={() => resolve.mutate({ id: r.id, s: 'DISMISSED' })}>{t('admin.dismiss')}</Button>
          </div>
        </Card></li>
      ))}</ul>
      {list.hasNextPage && <div className="text-center"><Button variant="outline" onClick={() => list.fetchNextPage()}>{t('admin.more')}</Button></div>}
    </div>
  );
}
