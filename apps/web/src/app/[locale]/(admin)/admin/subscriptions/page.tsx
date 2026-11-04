'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Badge, Button, DataTable, Skeleton } from '@duomatch/ui';
import { useAdminList } from '@/hooks/useAdmin';
import { post } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useUi } from '@/lib/store';

interface Sub { id: string; displayName: string; plan: string; status: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; provider: string }

export default function AdminSubscriptions() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const subs = useAdminList<Sub>(['subs'], '/admin/subscriptions');
  const d = (v: string) => formatDate(v, locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const job = useMutation({ mutationFn: () => post<{ expired: number; reminded: number }>('/admin/jobs/expire-subscriptions'), onSuccess: (r) => { toast('success', t('admin.jobDone', { a: r.expired, b: r.reminded })); void qc.invalidateQueries({ queryKey: ['admin'] }); } });
  return (
    <div className="space-y-6">
      <div className="flex justify-end"><Button variant="outline" size="sm" onClick={() => job.mutate()} loading={job.isPending}>{t('admin.runExpiry')}</Button></div>
      <section aria-labelledby="subs"><h2 id="subs" className="mb-3 text-lg font-bold">{t('admin.billing.subscriptions')}</h2>
        {subs.isLoading ? <Skeleton className="h-32" /> : <DataTable
          rows={subs.items} rowKey={(s) => s.id} empty={t('admin.empty')}
          columns={[
            { key: 'name', header: t('admin.cols.name'), cellClassName: 'font-medium', cell: (s) => s.displayName },
            { key: 'plan', header: t('admin.cols.plan'), cell: (s) => s.plan },
            { key: 'status', header: t('admin.cols.status'), cell: (s) => <Badge tone={s.status === 'ACTIVE' ? 'success' : 'neutral'}>{s.status}</Badge> },
            { key: 'ends', header: t('admin.cols.ends'), cellClassName: 'text-muted', cell: (s) => `${s.currentPeriodEnd ? d(s.currentPeriodEnd) : '—'}${s.cancelAtPeriodEnd ? ` (${t('admin.cancelling')})` : ''}` },
          ]}
        />}
      </section>
    </div>
  );
}
