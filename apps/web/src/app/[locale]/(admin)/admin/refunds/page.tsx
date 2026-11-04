'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge, Button, Card, Dialog, EmptyState, Field, Select, Skeleton, Textarea } from '@duomatch/ui';
import { useAdminList } from '@/hooks/useAdmin';
import { useApiError } from '@/hooks/useApiError';
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
      <Select aria-label={t('admin.status')} value={status} onChange={(e) => setStatus(e.target.value)} className="w-56">{['REQUESTED', 'COMPLETED', 'REJECTED', 'FAILED', 'PROCESSING'].map((s) => <option key={s} value={s}>{t(`admin.refunds.status.${s}`)}</option>)}</Select>
      {list.isLoading && <Skeleton className="h-40" />}
      {!list.isLoading && list.items.length === 0 && <EmptyState icon={<span aria-hidden>💸</span>} title={t('admin.refunds.empty')} />}
      <ul className="space-y-3">{list.items.map((r) => {
        const selfBlocked = r.source === 'ADMIN' && r.requestedById === me?.id;
        return (
          <li key={r.id}><Card className="space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-2"><Badge tone={TONE[r.status as keyof typeof TONE] ?? 'neutral'}>{t(`admin.refunds.status.${r.status}`)}</Badge><Badge tone="neutral">{t(`admin.refunds.source.${r.source}`)}</Badge><span className="text-sm text-muted">{timeAgo(r.createdAt, locale)} · {r.provider}</span></div>
            <p className="font-semibold">{r.displayName} — {r.product ?? '—'} — {formatXof(r.amountXof, locale)}</p>
            <p className="rounded-2xl bg-soft p-3 text-sm">{r.reason}</p>
            {r.decisionNote && <p className="text-sm text-muted">{t('admin.refunds.note')} {r.decisionNote}</p>}
            {r.failureReason && <p role="alert" className="text-sm text-danger-ink">{r.failureReason}</p>}
            {r.status === 'COMPLETED' && r.creditsReversed > 0 && <p className="text-sm text-muted">{t('admin.refunds.creditsBack', { n: r.creditsReversed })}</p>}
            {r.status === 'REQUESTED' && (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={selfBlocked} onClick={() => setDlg({ r, kind: 'approve' })}>{t('admin.refunds.approve')}</Button>
                <Button size="sm" variant="outline" onClick={() => setDlg({ r, kind: 'reject' })}>{t('admin.refunds.reject')}</Button>
                {selfBlocked && <span className="text-xs text-muted">{t('admin.refunds.needOther')}</span>}
              </div>
            )}
          </Card></li>
        );
      })}</ul>
      {list.hasNextPage && <div className="text-center"><Button variant="outline" onClick={() => list.fetchNextPage()}>{t('admin.more')}</Button></div>}

      <Dialog open={!!dlg} onClose={() => setDlg(null)} title={dlg ? t(`admin.refunds.${dlg.kind}Title`) : ''} closeLabel={t('common.close')}>
        {dlg && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); act.mutate(); }}>
            <p className="text-sm text-muted">{dlg.kind === 'approve' ? t('admin.refunds.approveText', { amount: formatXof(dlg.r.amountXof, locale) }) : t('admin.refunds.rejectText')}</p>
            <Field label={t('admin.refunds.noteLabel')}>{(p) => <Textarea {...p} required={dlg.kind === 'reject'} minLength={dlg.kind === 'reject' ? 3 : undefined} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
            {dlg.kind === 'approve' && <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-5 accent-brand-strong" checked={manual} onChange={(e) => setManual(e.target.checked)} /><span>{t('admin.refunds.manual')}</span></label>}
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDlg(null)}>{t('common.cancel')}</Button><Button type="submit" variant={dlg.kind === 'approve' ? 'primary' : 'danger'} loading={act.isPending}>{t(`admin.refunds.${dlg.kind}`)}</Button></div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
