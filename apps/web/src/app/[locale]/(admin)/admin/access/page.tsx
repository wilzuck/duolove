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

interface AccessView { enabled: boolean; activatedAt: string | null; graceDays: number; trialDays: number; verifiedDiscountPercent: number; womenThreshold: number; women: { count: number; threshold: number; reached: boolean; notifiedAt: string | null; cities: { city: string | null; country: string | null; count: number }[] }; graceEndsAt: string | null; ready: boolean; notReadyReason: string | null; counts: { members: number; paying: number; free: number } }

/** Accès payant obligatoire (« modèle B ») : un interrupteur réversible. Réservé au super administrateur. */
export default function AdminAccess() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const view = useQuery({ queryKey: ['admin', 'access'], queryFn: () => api<AccessView>('/admin/access') });
  const v = view.data;
  const [edit, setEdit] = useState<{ grace?: string; trial?: string; discount?: string; threshold?: string }>({});
  const [confirm, setConfirm] = useState(false);
  const num = (x: string | undefined, def: number, min: number, max: number) => (x === undefined ? def : Math.min(max, Math.max(min, Math.round(Number(x)) || 0)));
  const graceDays = num(edit.grace, v?.graceDays ?? 30, 0, 365);
  const trialDays = num(edit.trial, v?.trialDays ?? 14, 0, 90);
  const discount = num(edit.discount, v?.verifiedDiscountPercent ?? 0, 0, 90);
  const threshold = num(edit.threshold, v?.womenThreshold ?? 200, 1, 1_000_000);
  const dirty = Object.keys(edit).length > 0;
  const save = useMutation({
    mutationFn: (enabled: boolean) => put<AccessView>('/admin/access', { enabled, graceDays, trialDays, verifiedDiscountPercent: discount, womenThreshold: threshold }),
    onSuccess: (r) => { toast('success', t(r.enabled ? 'admin.access.nowOn' : 'admin.access.nowOff')); setConfirm(false); setEdit({}); void qc.invalidateQueries({ queryKey: ['admin', 'access'] }); void qc.invalidateQueries({ queryKey: ['me'] }); },
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t('admin.access.trial')} hint={t('admin.access.trialHint')}>{(p) => <Input {...p} type="number" min={0} max={90} value={edit.trial ?? String(v.trialDays)} onChange={(e) => setEdit({ ...edit, trial: e.target.value })} />}</Field>
              <Field label={t('admin.access.grace')} hint={t('admin.access.graceHint')}>{(p) => <Input {...p} type="number" min={0} max={365} value={edit.grace ?? String(v.graceDays)} onChange={(e) => setEdit({ ...edit, grace: e.target.value })} />}</Field>
              <Field label={t('admin.access.discount')} hint={t('admin.access.discountHint')}>{(p) => <Input {...p} type="number" min={0} max={90} value={edit.discount ?? String(v.verifiedDiscountPercent)} onChange={(e) => setEdit({ ...edit, discount: e.target.value })} />}</Field>
              <Field label={t('admin.access.threshold')} hint={t('admin.access.thresholdHint')}>{(p) => <Input {...p} type="number" min={1} value={edit.threshold ?? String(v.womenThreshold)} onChange={(e) => setEdit({ ...edit, threshold: e.target.value })} />}</Field>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-3 text-sm font-semibold">{t('admin.access.switch')}
                <Switch checked={v.enabled} disabled={save.isPending || (!v.enabled && !v.ready)} label={t('admin.access.switch')} onChange={(on) => (on ? setConfirm(true) : save.mutate(false))} />
              </label>
              {dirty && <Button size="sm" variant="outline" loading={save.isPending} onClick={() => save.mutate(v.enabled)}>{t('admin.access.saveSettings')}</Button>}
            </div>
            {v.enabled && v.graceEndsAt && <p className="text-sm text-muted">{t('admin.access.graceEnds', { date: fmt(v.graceEndsAt) })}</p>}
          </Card>

          <Card className="space-y-3 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-semibold">{t('admin.access.womenTitle')}</h3>
              <p className="font-display text-2xl font-extrabold">{v.women.count} <span className="text-base font-semibold text-muted">/ {v.women.threshold}</span></p></div>
            <div className="h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-linear-to-r from-brand-2 to-brand-strong" style={{ width: `${Math.min(100, (v.women.count / Math.max(1, v.women.threshold)) * 100)}%` }} /></div>
            <p className="text-sm text-muted">{t(v.women.reached ? 'admin.access.womenReached' : 'admin.access.womenText')}{v.women.notifiedAt ? ` ${t('admin.access.womenNotified', { date: fmt(v.women.notifiedAt) })}` : ''}</p>
            {v.women.cities.length > 0 && <ul className="flex flex-wrap gap-2 text-sm">{v.women.cities.map((c) => <li key={`${c.city}-${c.country}`} className="rounded-full bg-soft px-3 py-1 text-brand-ink">{c.city ?? '—'}{c.country ? `, ${c.country}` : ''} · {c.count}</li>)}</ul>}
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
          <p className="text-sm">{t('admin.access.confirmText', { days: graceDays, trial: trialDays })}</p>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setConfirm(false)}>{t('common.cancel')}</Button><Button onClick={() => save.mutate(true)} loading={save.isPending}>{t('admin.access.confirm')}</Button></div>
        </div>
      </Dialog>
    </div>
  );
}
