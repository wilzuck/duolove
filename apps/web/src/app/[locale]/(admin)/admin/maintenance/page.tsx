'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Construction, Eye, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge, Button, Card, Dialog, Field, Skeleton, Switch, Textarea } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { Link } from '@/i18n/navigation';
import { api, put } from '@/lib/api';
import { useUi } from '@/lib/store';

interface Maint { enabled: boolean; messageFr: string; messageEn: string; since: string | null }

/** Mode maintenance : ferme l'espace membre (l'équipe garde l'accès). Confirmation avant activation, journalisé. */
export default function AdminMaintenance() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const q = useQuery({ queryKey: ['admin', 'maintenance'], queryFn: () => api<Maint>('/admin/maintenance') });
  const [draft, setDraft] = useState<{ messageFr: string; messageEn: string } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const v = q.data;
  const msg = draft ?? { messageFr: v?.messageFr ?? '', messageEn: v?.messageEn ?? '' };
  const save = useMutation({
    mutationFn: (enabled: boolean) => put<Maint>('/admin/maintenance', { enabled, ...msg }),
    onSuccess: (r, enabled) => {
      qc.setQueryData(['admin', 'maintenance'], r); void qc.invalidateQueries({ queryKey: ['site', 'status'] });
      setDraft(null); setConfirm(false);
      toast('success', t(enabled === v?.enabled ? 'admin.maint.saved' : enabled ? 'admin.maint.savedOn' : 'admin.maint.savedOff'));
    },
    onError: (e) => toast('error', err(e)),
  });
  return (
    <div className="space-y-6">
      <header><h2 className="text-lg font-bold">{t('admin.maint.title')}</h2><p className="max-w-2xl text-sm text-muted">{t('admin.maint.subtitle')}</p></header>
      {!v ? <Skeleton className="h-48" /> : (
        <>
          <Card className={`flex items-center justify-between gap-4 p-5 transition-colors ${v.enabled ? 'border-2 border-gold bg-gold/10' : ''}`}>
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-soft text-brand-ink"><Construction className="size-5" aria-hidden /></span>
              <div>
                <p className="font-semibold">{t('admin.maint.switch')}</p>
                <p className="text-sm text-muted">{v.enabled && v.since ? t('admin.maint.on', { date: new Date(v.since).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }) }) : t('admin.maint.off')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge tone={v.enabled ? 'danger' : 'success'}>{t(v.enabled ? 'admin.maint.stateOn' : 'admin.maint.stateOff')}</Badge>
              <Switch checked={v.enabled} disabled={save.isPending} label={t('admin.maint.switch')} onChange={(on) => (on ? setConfirm(true) : save.mutate(false))} />
            </div>
          </Card>
          <Card className="grid gap-3 p-5 sm:grid-cols-2">
            <div><p className="mb-2 text-sm font-bold">{t('admin.maint.stayOpen')}</p>
              <ul className="space-y-1.5 text-sm">{(['team', 'public', 'payments', 'login'] as const).map((k) => <li key={k} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success-ink" aria-hidden />{t(`admin.maint.open.${k}`)}</li>)}</ul></div>
            <div><p className="mb-2 text-sm font-bold">{t('admin.maint.closed')}</p>
              <ul className="space-y-1.5 text-sm">{(['members', 'signup'] as const).map((k) => <li key={k} className="flex gap-2"><X className="mt-0.5 size-4 shrink-0 text-danger-ink" aria-hidden />{t(`admin.maint.close.${k}`)}</li>)}</ul></div>
          </Card>
          <Card className="space-y-4 p-5">
            <h3 className="font-bold">{t('admin.maint.messageTitle')}</h3>
            <Field label={t('admin.maint.messageFr')} hint={t('admin.maint.messageHint')}>{(p) => <Textarea {...p} maxLength={300} className="min-h-20" value={msg.messageFr} onChange={(e) => setDraft({ ...msg, messageFr: e.target.value })} />}</Field>
            <Field label={t('admin.maint.messageEn')} hint={t('admin.maint.messageHint')}>{(p) => <Textarea {...p} maxLength={300} className="min-h-20" value={msg.messageEn} onChange={(e) => setDraft({ ...msg, messageEn: e.target.value })} />}</Field>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" disabled={!draft} loading={save.isPending && !confirm} onClick={() => save.mutate(v.enabled)}>{t('admin.maint.save')}</Button>
              <Link href="/maintenance-preview" target="_blank" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-ink hover:underline"><Eye className="size-4" aria-hidden />{t('admin.maint.preview')}</Link>
            </div>
          </Card>
        </>
      )}
      <Dialog open={confirm} onClose={() => setConfirm(false)} title={t('admin.maint.confirmTitle')} closeLabel={t('common.close')}>
        <p className="text-sm">{t('admin.maint.confirmText')}</p>
        <div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={() => setConfirm(false)}>{t('admin.maint.cancel')}</Button><Button loading={save.isPending} onClick={() => save.mutate(true)}>{t('admin.maint.confirm')}</Button></div>
      </Dialog>
    </div>
  );
}
