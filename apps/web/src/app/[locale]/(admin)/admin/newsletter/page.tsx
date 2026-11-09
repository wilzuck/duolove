'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, Trash2, FlaskConical } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge, Button, Card, CrudTable, Dialog, Field, Input, Skeleton, Textarea } from '@duomatch/ui';
import { Metric } from '@/components/admin/DashboardParts';
import { PageHeader } from '@/components/admin/PageParts';
import { useApiError } from '@/hooks/useApiError';
import { useTableLabels } from '@/hooks/useTableLabels';
import { api, del, post, put } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { useUi } from '@/lib/store';

type Status = 'DRAFT' | 'SENDING' | 'SENT';
interface Campaign { id: string; subject: string; preheader: string; body: string; ctaLabel: string | null; ctaUrl: string | null; status: Status; recipients: number; sent: number; failed: number; createdAt: string; sentAt: string | null }
interface Overview { items: Campaign[]; subscribers: { ACTIVE: number; PENDING: number; UNSUBSCRIBED: number } }
const blank = { subject: '', preheader: '', body: '', ctaLabel: '', ctaUrl: '' };

export default function AdminNewsletter() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const labels = useTableLabels();
  const q = useQuery({ queryKey: ['admin', 'newsletter'], queryFn: () => api<Overview>('/admin/newsletter?limit=50'), refetchInterval: (query) => (query.state.data?.items.some((c) => c.status === 'SENDING') ? 3000 : false) });
  const [f, setF] = useState(blank);
  const [editId, setEditId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Campaign | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin', 'newsletter'] });
  const payload = () => ({ subject: f.subject, preheader: f.preheader, body: f.body, ctaLabel: f.ctaLabel || null, ctaUrl: f.ctaUrl || null });
  const save = useMutation({ mutationFn: () => (editId ? put(`/admin/newsletter/${editId}`, payload()) : post('/admin/newsletter', payload())), onSuccess: () => { toast('success', t('admin.nl.saved')); refresh(); }, onError: (e) => toast('error', err(e)) });
  const remove = useMutation({ mutationFn: (id: string) => del(`/admin/newsletter/${id}`), onSuccess: () => { toast('success', t('admin.nl.deleted')); refresh(); }, onError: (e) => toast('error', err(e)) });
  const test = useMutation({ mutationFn: (id: string) => post<{ ok: boolean; to: string }>(`/admin/newsletter/${id}/test`), onSuccess: (r) => toast(r.ok ? 'success' : 'error', t(r.ok ? 'admin.nl.testSent' : 'admin.nl.testFail', { to: r.to })), onError: (e) => toast('error', err(e)) });
  const send = useMutation({ mutationFn: (id: string) => post<{ recipients: number }>(`/admin/newsletter/${id}/send`), onSuccess: (r) => { setConfirm(null); toast('success', t('admin.nl.started', { n: r.recipients })); refresh(); }, onError: (e) => { setConfirm(null); toast('error', err(e)); } });
  const sub = q.data?.subscribers;
  const tone = (s: Status) => (s === 'SENT' ? 'success' : s === 'SENDING' ? 'brand' : 'neutral');
  return (
    <div className="space-y-5">
      <PageHeader title={t('admin.nav.newsletter')} description={t('admin.pageDesc.newsletter')} />
      {sub ? (
        <dl className="grid gap-3 sm:grid-cols-3">
          <Metric label={t('admin.nl.subActive')} value={String(sub.ACTIVE)} hint={t('admin.nl.subActiveHint')} />
          <Metric label={t('admin.nl.subPending')} value={String(sub.PENDING)} hint={t('admin.nl.subPendingHint')} />
          <Metric label={t('admin.nl.subUnsub')} value={String(sub.UNSUBSCRIBED)} />
        </dl>
      ) : <Skeleton className="h-24" />}
      <CrudTable<Campaign>
        title={t('admin.nl.campaigns')} description={t('admin.nl.help')} addLabel={t('admin.nl.new')} editLabel={t('admin.eng.edit')}
        dialogTitle={editId ? t('admin.nl.editTitle') : t('admin.nl.new')} submitLabel={t('admin.eng.save1')} cancelLabel={t('common.cancel')} closeLabel={t('common.close')}
        tableLabels={labels} submitting={save.isPending} rows={q.data?.items} rowKey={(c) => c.id} loading={<Skeleton className="h-40" />} empty={t('admin.nl.empty')} minWidth="46rem"
        onOpen={(c) => { setEditId(c?.id ?? null); setF(c ? { subject: c.subject, preheader: c.preheader, body: c.body, ctaLabel: c.ctaLabel ?? '', ctaUrl: c.ctaUrl ?? '' } : blank); }}
        onSubmit={() => save.mutateAsync()}
        rowActions={(c) => [
          { label: t('admin.nl.test'), icon: <FlaskConical className="size-4" aria-hidden />, onSelect: () => test.mutate(c.id) },
          ...(c.status === 'DRAFT' ? [{ label: t('admin.nl.send'), icon: <Send className="size-4" aria-hidden />, onSelect: () => setConfirm(c) }, { label: t('admin.nl.delete'), icon: <Trash2 className="size-4" aria-hidden />, tone: 'danger' as const, onSelect: () => remove.mutate(c.id) }] : []),
        ]}
        columns={[
          { key: 'subject', header: t('admin.nl.subject'), value: (c) => c.subject, filter: 'text', cell: (c) => <><span className="block font-semibold">{c.subject}</span>{c.preheader && <span className="block text-xs text-muted">{c.preheader}</span>}</> },
          { key: 'status', header: t('admin.status'), value: (c) => c.status, filter: { options: (['DRAFT', 'SENDING', 'SENT'] as const).map((s) => ({ value: s, label: t(`admin.nl.statuses.${s}`) })) }, cell: (c) => <Badge tone={tone(c.status)}>{t(`admin.nl.statuses.${c.status}`)}</Badge> },
          { key: 'progress', header: t('admin.nl.delivery'), value: (c) => c.sent, cell: (c) => c.status === 'DRAFT' ? <span className="text-muted">—</span> : (
            <span className="block min-w-32"><span className="text-sm font-semibold">{c.sent} / {c.recipients}</span>{c.failed > 0 && <span className="ml-2 text-xs font-semibold text-danger-ink">{t('admin.nl.failedN', { n: c.failed })}</span>}
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-soft"><span className="block h-full bg-brand-strong transition-all" style={{ width: `${c.recipients ? ((c.sent + c.failed) / c.recipients) * 100 : 0}%` }} /></span></span>) },
          { key: 'date', mobileHidden: true, header: t('admin.cols.date'), value: (c) => c.sentAt ?? c.createdAt, cellClassName: 'text-muted', cell: (c) => timeAgo(c.sentAt ?? c.createdAt, locale) },
        ]}
      >
        <Field label={t('admin.nl.subject')}>{(p) => <Input {...p} required minLength={3} maxLength={150} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />}</Field>
        <Field label={t('admin.nl.preheader')} hint={t('admin.nl.preheaderHint')}>{(p) => <Input {...p} maxLength={200} value={f.preheader} onChange={(e) => setF({ ...f, preheader: e.target.value })} />}</Field>
        <Field label={t('admin.nl.body')} hint={t('admin.nl.bodyHint')}>{(p) => <Textarea {...p} required minLength={10} rows={9} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />}</Field>
        <Field label={t('admin.nl.ctaLabel')}>{(p) => <Input {...p} maxLength={60} value={f.ctaLabel} onChange={(e) => setF({ ...f, ctaLabel: e.target.value })} />}</Field>
        <Field label={t('admin.nl.ctaUrl')} hint={t('admin.nl.ctaUrlHint')}>{(p) => <Input {...p} type="url" maxLength={500} placeholder="https://" value={f.ctaUrl} onChange={(e) => setF({ ...f, ctaUrl: e.target.value })} />}</Field>
      </CrudTable>
      <Card className="p-4 text-sm text-muted">{t('admin.nl.privacyNote')}</Card>
      <Dialog open={!!confirm} onClose={() => setConfirm(null)} title={t('admin.nl.sendTitle')} closeLabel={t('common.close')} dismissible={!send.isPending}>
        <p className="text-sm">{t('admin.nl.sendText', { n: sub?.ACTIVE ?? 0, subject: confirm?.subject ?? '' })}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirm(null)} disabled={send.isPending}>{t('common.cancel')}</Button>
          <Button loading={send.isPending} onClick={() => confirm && send.mutate(confirm.id)}><Send className="size-4" aria-hidden />{t('admin.nl.sendNow')}</Button>
        </div>
      </Dialog>
    </div>
  );
}
