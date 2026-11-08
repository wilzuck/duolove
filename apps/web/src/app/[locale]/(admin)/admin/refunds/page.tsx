'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge, Button, Checkbox, DataTableView, Dialog, Field, Select, Skeleton, Textarea } from '@duomatch/ui';
import { useAdminList } from '@/hooks/useAdmin';
import { useApiError } from '@/hooks/useApiError';
import { useTableLabels } from '@/hooks/useTableLabels';
import { useMe } from '@/hooks/useQueries';
import { post } from '@/lib/api';
import { formatXof, timeAgo } from '@/lib/format';
import { useUi } from '@/lib/store';

interface Refund { id: string; paymentId: string; amountXof: number; reason: string; source: 'USER' | 'ADMIN'; status: string; requestedById: string; decisionNote: string | null; failureReason: string | null; creditsReversed: number; createdAt: string; provider: string; product: string | null; displayName: string }
const TONE = { REQUESTED: 'gold', PROCESSING: 'brand', COMPLETED: 'success', REJECTED: 'neutral', FAILED: 'danger' } as const;

export default function AdminRefunds() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const tableLabels = useTableLabels();
  const { data: me } = useMe();
  const [status, setStatus] = useState('REQUESTED');
  const [dlg, setDlg] = useState<{ r: Refund; kind: 'approve' | 'reject' } | null>(null);
  const [note, setNote] = useState('');
  const [manual, setManual] = useState(false);
  const list = useAdminList<Refund>(['refunds', status], `/admin/refunds?status=${status}`);
  const act = useMutation({
    mutationFn: () => post<{ status: string; failureReason?: string }>(`/admin/refunds/${dlg!.r.id}/${dlg!.kind}`, dlg!.kind === 'approve' ? { note: note || undefined, manual } : { note }),
    onSuccess: (r) => { toast(r.status === 'FAILED' ? 'error' : 'success', r.status === 'FAILED' ? `${t('admin.refunds.failed')} ${r.failureReason ?? ''}` : t('admin.refunds.done')); setDlg(null); setNote(''); setManual(false); void qc.invalidateQueries({ queryKey: ['admin'] }); },
    onError: (e) => toast('error', err(e)),
  });
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t('admin.refunds.intro')}</p>
      {list.isLoading ? <Skeleton className="h-40" /> : (
        <DataTableView
          minWidth="52rem" rows={list.items} rowKey={(r) => r.id} empty={t('admin.refunds.empty')} labels={tableLabels} exportName="remboursements"
          hasMore={list.hasNextPage} onLoadMore={() => void list.fetchNextPage()} loadingMore={list.isFetchingNextPage}
          toolbar={<Select aria-label={t('admin.status')} value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 w-auto">{['REQUESTED', 'COMPLETED', 'REJECTED', 'FAILED', 'PROCESSING'].map((s) => <option key={s} value={s}>{t(`admin.refunds.status.${s}`)}</option>)}</Select>}
          rowActions={(r) => r.status !== 'REQUESTED' ? [] : [
            { label: t('admin.refunds.approve'), icon: <Check className="size-4" aria-hidden />, disabled: r.source === 'ADMIN' && r.requestedById === me?.id, onSelect: () => setDlg({ r, kind: 'approve' }) },
            { label: t('admin.refunds.reject'), icon: <X className="size-4" aria-hidden />, tone: 'danger' as const, onSelect: () => setDlg({ r, kind: 'reject' }) },
          ]}
          columns={[
            { key: 'user', header: t('admin.cols.name'), value: (r) => r.displayName, cellClassName: 'font-medium', cell: (r) => <>{r.displayName}<span className="block text-xs text-muted">{r.product ?? '—'}</span></> },
            { key: 'amount', header: t('admin.cols.amount'), value: (r) => r.amountXof, cell: (r) => formatXof(r.amountXof, locale) },
            { key: 'status', header: t('admin.cols.status'), value: (r) => r.status, cell: (r) => <Badge tone={TONE[r.status as keyof typeof TONE] ?? 'neutral'}>{t(`admin.refunds.status.${r.status}`)}</Badge> },
            { key: 'source', mobileHidden: true, header: t('admin.cols.source'), value: (r) => r.source, filter: { options: (['USER', 'ADMIN'] as const).map((x) => ({ value: x, label: t(`admin.refunds.source.${x}`) })) }, cell: (r) => <Badge tone="neutral">{t(`admin.refunds.source.${r.source}`)}</Badge> },
            { key: 'reason', header: t('admin.cols.reason'), value: (r) => r.reason, cellClassName: 'max-w-xs whitespace-pre-wrap', cell: (r) => <>{r.reason}{r.decisionNote && <span className="mt-1 block text-xs text-muted">{t('admin.refunds.note')} {r.decisionNote}</span>}{r.failureReason && <span className="mt-1 block text-xs text-danger-ink">{r.failureReason}</span>}{r.status === 'COMPLETED' && r.creditsReversed > 0 && <span className="mt-1 block text-xs text-muted">{t('admin.refunds.creditsBack', { n: r.creditsReversed })}</span>}</> },
            { key: 'date', mobileHidden: true, header: t('admin.cols.date'), value: (r) => r.createdAt, cellClassName: 'text-muted', cell: (r) => `${timeAgo(r.createdAt, locale)} · ${r.provider}` },
          ]}
        />
      )}

      <Dialog open={!!dlg} onClose={() => setDlg(null)} title={dlg ? t(`admin.refunds.${dlg.kind}Title`) : ''} closeLabel={t('common.close')}>
        {dlg && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); act.mutate(); }}>
            <p className="text-sm text-muted">{dlg.kind === 'approve' ? t('admin.refunds.approveText', { amount: formatXof(dlg.r.amountXof, locale) }) : t('admin.refunds.rejectText')}</p>
            <Field label={t('admin.refunds.noteLabel')}>{(p) => <Textarea {...p} required={dlg.kind === 'reject'} minLength={dlg.kind === 'reject' ? 3 : undefined} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
            {dlg.kind === 'approve' && <Checkbox label={t('admin.refunds.manual')} checked={manual} onChange={(e) => setManual(e.target.checked)} />}
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDlg(null)}>{t('common.cancel')}</Button><Button type="submit" variant={dlg.kind === 'approve' ? 'primary' : 'danger'} loading={act.isPending}>{t(`admin.refunds.${dlg.kind}`)}</Button></div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
