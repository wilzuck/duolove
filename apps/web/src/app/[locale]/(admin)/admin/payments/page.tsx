'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Undo2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge, Button, DataTableView, Dialog, Field, Skeleton, Textarea } from '@duomatch/ui';
import { useAdminList } from '@/hooks/useAdmin';
import { useApiError } from '@/hooks/useApiError';
import { useTableLabels } from '@/hooks/useTableLabels';
import { post } from '@/lib/api';
import { formatDate, formatXof } from '@/lib/format';
import { useUi } from '@/lib/store';

interface Pay { refund: string | null; id: string; displayName: string; amountXof: number; status: string; provider: string; failureReason: string | null; invoiceNumber: string | null; createdAt: string }
const ACTIVE_REFUND = ['REQUESTED', 'PROCESSING', 'COMPLETED'];

export default function AdminPayments() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const tableLabels = useTableLabels();
  const pays = useAdminList<Pay>(['pays'], '/admin/payments');
  const [target, setTarget] = useState<Pay | null>(null);
  const [reason, setReason] = useState('');
  const d = (v: string) => formatDate(v, locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const create = useMutation({
    mutationFn: () => post('/admin/refunds', { paymentId: target!.id, reason }),
    onSuccess: () => { toast('success', t('admin.refunds.created')); setTarget(null); setReason(''); void qc.invalidateQueries({ queryKey: ['admin'] }); },
    onError: (e) => toast('error', err(e)),
  });
  return (
    <div className="space-y-6">
      <section aria-labelledby="pays"><h2 id="pays" className="mb-3 text-lg font-bold">{t('admin.billing.payments')}</h2>
        {pays.isLoading ? <Skeleton className="h-32" /> : (
          <DataTableView
            minWidth="44rem" rows={pays.items} rowKey={(p) => p.id} empty={t('admin.empty')} labels={tableLabels} exportName="paiements"
            hasMore={pays.hasNextPage} onLoadMore={() => void pays.fetchNextPage()} loadingMore={pays.isFetchingNextPage}
            rowActions={(p) => (p.status === 'SUCCEEDED' && !(p.refund && ACTIVE_REFUND.includes(p.refund)) ? [{ label: t('admin.refunds.request'), icon: <Undo2 className="size-4" aria-hidden />, onSelect: () => setTarget(p) }] : [])}
            columns={[
              { key: 'name', header: t('admin.cols.name'), value: (p) => p.displayName, cellClassName: 'font-medium', cell: (p) => p.displayName },
              { key: 'amount', header: t('admin.cols.amount'), value: (p) => p.amountXof, cell: (p) => formatXof(p.amountXof, locale) },
              { key: 'status', header: t('admin.cols.status'), value: (p) => p.status, filter: { options: ['PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED'].map((s) => ({ value: s, label: s })) }, cell: (p) => <><Badge tone={p.status === 'SUCCEEDED' ? 'success' : p.status === 'FAILED' ? 'danger' : 'neutral'}>{p.status}</Badge>{p.refund && <Badge tone="gold" className="ml-1">{t(`admin.refunds.status.${p.refund}`)}</Badge>}</> },
              { key: 'invoice', mobileHidden: true, header: t('admin.cols.invoice'), value: (p) => p.invoiceNumber ?? '', cellClassName: 'text-muted', cell: (p) => p.invoiceNumber ?? '—' },
              { key: 'date', header: t('admin.cols.date'), value: (p) => p.createdAt, cellClassName: 'text-muted', cell: (p) => d(p.createdAt) },
            ]}
          />
        )}
      </section>
      <Dialog open={!!target} onClose={() => setTarget(null)} title={t('admin.refunds.requestTitle')} closeLabel={t('common.close')}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <p className="text-sm text-muted">{t('admin.refunds.requestText', { name: target?.displayName ?? '', amount: target ? formatXof(target.amountXof, locale) : '' })}</p>
          <Field label={t('admin.refunds.reasonLabel')}>{(p) => <Textarea {...p} required minLength={5} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setTarget(null)}>{t('common.cancel')}</Button><Button type="submit" loading={create.isPending}>{t('admin.refunds.request')}</Button></div>
        </form>
      </Dialog>
    </div>
  );
}
