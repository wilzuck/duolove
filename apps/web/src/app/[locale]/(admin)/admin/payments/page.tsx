'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge, Button, DataTable, Dialog, Field, Skeleton, Textarea } from '@duomatch/ui';
import { useAdminList } from '@/hooks/useAdmin';
import { useApiError } from '@/hooks/useApiError';
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
          <DataTable
            minWidth="44rem" rows={pays.items} rowKey={(p) => p.id} empty={t('admin.empty')}
            columns={[
              { key: 'name', header: t('admin.cols.name'), cellClassName: 'font-medium', cell: (p) => p.displayName },
              { key: 'amount', header: t('admin.cols.amount'), cell: (p) => formatXof(p.amountXof, locale) },
              { key: 'status', header: t('admin.cols.status'), cell: (p) => <><Badge tone={p.status === 'SUCCEEDED' ? 'success' : p.status === 'FAILED' ? 'danger' : 'neutral'}>{p.status}</Badge>{p.refund && <Badge tone="gold" className="ml-1">{t(`admin.refunds.status.${p.refund}`)}</Badge>}</> },
              { key: 'invoice', header: t('admin.cols.invoice'), cellClassName: 'text-muted', cell: (p) => p.invoiceNumber ?? '—' },
              { key: 'date', header: t('admin.cols.date'), cellClassName: 'text-muted', cell: (p) => d(p.createdAt) },
              { key: 'action', header: t('admin.refunds.action'), srOnlyHeader: true, cell: (p) => p.status === 'SUCCEEDED' && !(p.refund && ACTIVE_REFUND.includes(p.refund)) && <Button size="sm" variant="outline" onClick={() => setTarget(p)}>{t('admin.refunds.request')}</Button> },
            ]}
          />
        )}
        {pays.hasNextPage && <div className="mt-3 text-center"><Button variant="outline" onClick={() => pays.fetchNextPage()}>{t('admin.more')}</Button></div>}
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
