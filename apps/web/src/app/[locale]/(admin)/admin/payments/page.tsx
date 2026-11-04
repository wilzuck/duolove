'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge, Button, Dialog, Field, Skeleton, Textarea } from '@duomatch/ui';
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
          <div className="overflow-x-auto rounded-3xl border border-line bg-card"><table className="w-full min-w-[44rem] text-left text-sm"><thead className="border-b border-line text-muted"><tr>{['name', 'amount', 'status', 'invoice', 'date'].map((h) => <th key={h} scope="col" className="px-4 py-3">{t(`admin.cols.${h}`)}</th>)}<th scope="col" className="px-4 py-3"><span className="sr-only">{t('admin.refunds.action')}</span></th></tr></thead>
            <tbody>{pays.items.map((p) => (
              <tr key={p.id} className="border-b border-line last:border-0"><td className="px-4 py-3 font-medium">{p.displayName}</td><td className="px-4 py-3">{formatXof(p.amountXof, locale)}</td>
                <td className="px-4 py-3"><Badge tone={p.status === 'SUCCEEDED' ? 'success' : p.status === 'FAILED' ? 'danger' : 'neutral'}>{p.status}</Badge>{p.refund && <Badge tone="gold" className="ml-1">{t(`admin.refunds.status.${p.refund}`)}</Badge>}</td>
                <td className="px-4 py-3 text-muted">{p.invoiceNumber ?? '—'}</td><td className="px-4 py-3 text-muted">{d(p.createdAt)}</td>
                <td className="px-4 py-3">{p.status === 'SUCCEEDED' && !(p.refund && ACTIVE_REFUND.includes(p.refund)) && <Button size="sm" variant="outline" onClick={() => setTarget(p)}>{t('admin.refunds.request')}</Button>}</td></tr>
            ))}</tbody></table>{pays.items.length === 0 && <p className="p-6 text-center text-muted">{t('admin.empty')}</p>}</div>
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
