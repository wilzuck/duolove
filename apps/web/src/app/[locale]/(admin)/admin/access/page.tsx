'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LockKeyhole, Unlock } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Dialog, Field, Input, Skeleton, Switch } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { api, put } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useUi } from '@/lib/store';

interface AccessView { enabled: boolean; activatedAt: string | null; graceDays: number; graceEndsAt: string | null; ready: boolean; notReadyReason: string | null; counts: { members: number; paying: number; free: number } }

/** Accès payant obligatoire (« modèle B ») : un interrupteur réversible. Réservé au super administrateur. */
export default function AdminAccess() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const view = useQuery({ queryKey: ['admin', 'access'], queryFn: () => api<AccessView>('/admin/access') });
  const v = view.data;
  const [grace, setGrace] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const graceDays = grace === null ? (v?.graceDays ?? 30) : Math.min(365, Math.max(0, Number(grace) || 0));
  const save = useMutation({
    mutationFn: (enabled: boolean) => put<AccessView>('/admin/access', { enabled, graceDays }),
    onSuccess: (r) => { toast('success', t(r.enabled ? 'admin.access.nowOn' : 'admin.access.nowOff')); setConfirm(false); setGrace(null); void qc.invalidateQueries({ queryKey: ['admin', 'access'] }); void qc.invalidateQueries({ queryKey: ['me'] }); },
    onError: (e) => { toast('error', err(e)); setConfirm(false); },
  });
  const fmt = (d: string) => formatDate(d, locale, { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      <header><h2 className="text-lg font-bold">{t('admin.access.title')}</h2><p className="text-sm text-muted">{t('admin.access.subtitle')}</p></header>
      {view.isLoading && <Skeleton className="h-64" />}
      {v && (
        <>
          <Card className="space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid size-10 place-items-center rounded-2xl bg-soft text-brand-ink">{v.enabled ? <LockKeyhole className="size-5" aria-hidden /> : <Unlock className="size-5" aria-hidden />}</span>
              <div className="min-w-0 flex-1"><p className="font-semibold">{t(v.enabled ? 'admin.access.on' : 'admin.access.off')}</p>
                <p className="text-sm text-muted">{v.enabled && v.activatedAt ? t('admin.access.since', { date: fmt(v.activatedAt) }) : t('admin.access.offText')}</p></div>
              <Badge tone={v.enabled ? 'success' : 'neutral'}>{t(v.enabled ? 'admin.access.badgeOn' : 'admin.access.badgeOff')}</Badge>
            </div>
            {!v.ready && <Alert variant="text">{t(v.notReadyReason === 'PAYMENTS_OFF' ? 'admin.access.notReadyFlag' : 'admin.access.notReadyProvider')}</Alert>}
            <div className="flex flex-wrap items-end gap-4">
              <Field label={t('admin.access.grace')} hint={t('admin.access.graceHint')}>{(p) => <Input {...p} type="number" min={0} max={365} className="w-32" value={grace ?? String(v.graceDays)} onChange={(e) => setGrace(e.target.value)} />}</Field>
              <label className="flex items-center gap-3 pb-2 text-sm font-semibold">{t('admin.access.switch')}
                <Switch checked={v.enabled} disabled={save.isPending || (!v.enabled && !v.ready)} label={t('admin.access.switch')} onChange={(on) => (on ? setConfirm(true) : save.mutate(false))} />
              </label>
              {v.enabled && (grace !== null && graceDays !== v.graceDays) && <Button size="sm" variant="outline" loading={save.isPending} onClick={() => save.mutate(true)}>{t('admin.access.saveGrace')}</Button>}
            </div>
            {v.enabled && v.graceEndsAt && <p className="text-sm text-muted">{t('admin.access.graceEnds', { date: fmt(v.graceEndsAt) })}</p>}
          </Card>

          <Card className="grid gap-4 p-5 sm:grid-cols-3">
            {([['members', v.counts.members], ['paying', v.counts.paying], ['free', v.counts.free]] as const).map(([k, n]) => (
              <div key={k}><p className="font-display text-2xl font-extrabold">{n}</p><p className="text-sm text-muted">{t(`admin.access.count.${k}`)}</p></div>
            ))}
          </Card>

          <Card className="space-y-2 p-5 text-sm">
            <h3 className="font-semibold">{t('admin.access.howTitle')}</h3>
            <ul className="list-disc space-y-1 pl-5 text-muted">{(['how1', 'how2', 'how3', 'how4', 'how5'] as const).map((k) => <li key={k}>{t(`admin.access.${k}`)}</li>)}</ul>
          </Card>
        </>
      )}
      <Dialog open={confirm} onClose={() => setConfirm(false)} title={t('admin.access.confirmTitle')} closeLabel={t('common.close')}>
        <div className="space-y-4">
          <p className="text-sm">{t('admin.access.confirmText', { days: graceDays })}</p>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setConfirm(false)}>{t('common.cancel')}</Button><Button onClick={() => save.mutate(true)} loading={save.isPending}>{t('admin.access.confirm')}</Button></div>
        </div>
      </Dialog>
    </div>
  );
}
