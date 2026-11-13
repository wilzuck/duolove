'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Construction } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge, Button, Card, Dialog, Field, Skeleton, Switch, Textarea } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
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
          <Card className="flex items-center justify-between gap-4 p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-soft text-brand-ink"><Construction className="size-5" aria-hidden /></span>
              <div>
                <p className="font-semibold">{t('admin.maint.switch')}</p>
                <p className="text-sm text-muted">{v.enabled && v.since ? t('admin.maint.on', { date: new Date(v.since).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }) }) : t('admin.maint.off')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {v.enabled && <Badge tone="danger">ON</Badge>}
              <Switch checked={v.enabled} disabled={save.isPending} label={t('admin.maint.switch')} onChange={(on) => (on ? setConfirm(true) : save.mutate(false))} />
            </div>
          </Card>
          <Card className="space-y-4 p-5">
            <Field label={t('admin.maint.messageFr')} hint={t('admin.maint.messageHint')}>{(p) => <Textarea {...p} maxLength={300} className="min-h-20" value={msg.messageFr} onChange={(e) => setDraft({ ...msg, messageFr: e.target.value })} />}</Field>
            <Field label={t('admin.maint.messageEn')} hint={t('admin.maint.messageHint')}>{(p) => <Textarea {...p} maxLength={300} className="min-h-20" value={msg.messageEn} onChange={(e) => setDraft({ ...msg, messageEn: e.target.value })} />}</Field>
            <Button variant="outline" disabled={!draft} loading={save.isPending && !confirm} onClick={() => save.mutate(v.enabled)}>{t('admin.maint.save')}</Button>
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
