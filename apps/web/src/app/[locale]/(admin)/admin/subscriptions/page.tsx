'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Badge, Button, Skeleton } from '@duomatch/ui';
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
        {subs.isLoading ? <Skeleton className="h-32" /> : <div className="overflow-x-auto rounded-3xl border border-line bg-card"><table className="w-full min-w-[36rem] text-left text-sm"><thead className="border-b border-line text-muted"><tr>{['name', 'plan', 'status', 'ends'].map((h) => <th key={h} scope="col" className="px-4 py-3">{t(`admin.cols.${h}`)}</th>)}</tr></thead>
          <tbody>{subs.items.map((s) => <tr key={s.id} className="border-b border-line last:border-0"><td className="px-4 py-3 font-medium">{s.displayName}</td><td className="px-4 py-3">{s.plan}</td><td className="px-4 py-3"><Badge tone={s.status === 'ACTIVE' ? 'success' : 'neutral'}>{s.status}</Badge></td><td className="px-4 py-3 text-muted">{s.currentPeriodEnd ? d(s.currentPeriodEnd) : '—'}{s.cancelAtPeriodEnd ? ` (${t('admin.cancelling')})` : ''}</td></tr>)}</tbody></table>{subs.items.length === 0 && <p className="p-6 text-center text-muted">{t('admin.empty')}</p>}</div>}
      </section>
    </div>
  );
}
