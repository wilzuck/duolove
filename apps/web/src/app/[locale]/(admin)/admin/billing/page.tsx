'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, Card, Field, Input, Skeleton, Textarea } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { api, put } from '@/lib/api';
import { useUi } from '@/lib/store';

interface Billing { legalName: string; address: string; city: string; country: string; registration: string; email: string; phone: string; website: string; footerNote: string; vatPercent: number }
const TEXT = ['legalName', 'address', 'city', 'country', 'registration', 'email', 'phone', 'website'] as const;

/** Informations de l'émetteur imprimées sur chaque facture PDF. Ce qui n'est pas renseigné n'apparaît pas : rien n'est inventé. */
export default function AdminBilling() {
  const t = useTranslations();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const view = useQuery({ queryKey: ['admin', 'billing'], queryFn: () => api<Billing>('/admin/billing') });
  const [edit, setEdit] = useState<Partial<Billing>>({});
  const v = view.data;
  const f = v ? { ...v, ...edit } : null;
  const save = useMutation({
    mutationFn: () => put<Billing>('/admin/billing', { ...f, vatPercent: Number(f?.vatPercent) || 0 }),
    onSuccess: () => { toast('success', t('admin.billing.saved')); setEdit({}); void qc.invalidateQueries({ queryKey: ['admin', 'billing'] }); },
    onError: (e) => toast('error', err(e)),
  });
  return (
    <div className="space-y-6">
      <header><h2 className="text-lg font-bold">{t('admin.billing.title')}</h2><p className="text-sm text-muted">{t('admin.billing.subtitle')}</p></header>
      {!f ? <Skeleton className="h-64" /> : (
        <Card className="p-5">
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            {TEXT.map((k) => (
              <div key={k} className={k === 'registration' || k === 'address' ? 'sm:col-span-2' : ''}>
                <Field label={t(`admin.billing.f.${k}`)} hint={k === 'registration' ? t('admin.billing.f.registrationHint') : undefined}>{(p) => <Input {...p} autoComplete="off" value={f[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />}</Field>
              </div>
            ))}
            <Field label={t('admin.billing.f.vatPercent')} hint={t('admin.billing.f.vatHint')}>{(p) => <Input {...p} type="number" min={0} max={30} value={String(f.vatPercent)} onChange={(e) => setEdit({ ...edit, vatPercent: Number(e.target.value) })} />}</Field>
            <div className="sm:col-span-2"><Field label={t('admin.billing.f.footerNote')}>{(p) => <Textarea {...p} maxLength={300} value={f.footerNote} onChange={(e) => setEdit({ ...edit, footerNote: e.target.value })} />}</Field></div>
            <div className="sm:col-span-2"><Button type="submit" loading={save.isPending} disabled={Object.keys(edit).length === 0}>{t('admin.billing.save')}</Button></div>
          </form>
        </Card>
      )}
    </div>
  );
}
