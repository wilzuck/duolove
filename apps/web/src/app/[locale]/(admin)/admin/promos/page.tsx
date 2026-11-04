'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge, Button, Card, DataTable, Field, Input, Select, Skeleton } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { api, patch, post } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useUi } from '@/lib/store';

interface PromoRow { id: string; code: string; kind: 'PERCENT' | 'TOKENS'; percent: number | null; tokens: number | null; maxRedemptions: number | null; expiresAt: string | null; active: boolean; used: number }
const blank = { code: '', kind: 'PERCENT' as 'PERCENT' | 'TOKENS', value: '', max: '', expires: '' };

export default function AdminPromos() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const [f, setF] = useState(blank);
  const list = useQuery({ queryKey: ['admin', 'promos'], queryFn: () => api<PromoRow[]>('/admin/promos') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'promos'] });
  const create = useMutation({
    mutationFn: () => post('/admin/promos', {
      code: f.code.trim().toUpperCase(), kind: f.kind, ...(f.kind === 'PERCENT' ? { percent: Number(f.value) } : { tokens: Number(f.value) }),
      maxRedemptions: f.max ? Number(f.max) : null, expiresAt: f.expires ? new Date(`${f.expires}T23:59:59`).toISOString() : null,
    }),
    onSuccess: () => { toast('success', t('admin.promos.created')); setF(blank); void refresh(); },
    onError: (e) => toast('error', err(e)),
  });
  const toggle = useMutation({ mutationFn: (p: PromoRow) => patch(`/admin/promos/${p.id}`, { active: !p.active }), onSuccess: refresh, onError: (e) => toast('error', err(e)) });
  return (
    <div className="space-y-6">
      <header><h2 className="text-lg font-bold">{t('admin.promos.title')}</h2><p className="text-sm text-muted">{t('admin.promos.subtitle')}</p></header>
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">{t('admin.promos.new')}</h3>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <Field label={t('admin.promos.code')}>{(p) => <Input {...p} required minLength={3} maxLength={32} pattern="[A-Za-z0-9_\-]{3,32}" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />}</Field>
          <Field label={t('admin.promos.kind')}>{(p) => <Select {...p} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as 'PERCENT' | 'TOKENS', value: '' })}><option value="PERCENT">{t('admin.promos.kindPERCENT')}</option><option value="TOKENS">{t('admin.promos.kindTOKENS')}</option></Select>}</Field>
          <Field label={f.kind === 'PERCENT' ? t('admin.promos.percent') : t('admin.promos.tokens')}>{(p) => <Input {...p} required type="number" min={1} max={f.kind === 'PERCENT' ? 90 : 500} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />}</Field>
          <Field label={t('admin.promos.max')}>{(p) => <Input {...p} type="number" min={1} value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} />}</Field>
          <Field label={t('admin.promos.expires')}>{(p) => <Input {...p} type="date" value={f.expires} onChange={(e) => setF({ ...f, expires: e.target.value })} />}</Field>
          <div className="sm:col-span-2 lg:col-span-5"><Button type="submit" loading={create.isPending}>{t('admin.promos.create')}</Button></div>
        </form>
        <p className="mt-3 text-xs text-muted">{t('admin.promos.immutable')}</p>
      </Card>
      {list.isLoading && <Skeleton className="h-32" />}
      {list.data?.length === 0 && <p className="text-center text-muted">{t('admin.promos.empty')}</p>}
      {!!list.data?.length && (
        <DataTable
          rows={list.data} rowKey={(p) => p.id}
          columns={[
            { key: 'code', header: t('admin.promos.code'), cellClassName: 'font-mono font-semibold', cell: (p) => p.code },
            { key: 'kind', header: t('admin.promos.kind'), cell: (p) => t(`admin.promos.kind${p.kind}` as never) },
            { key: 'value', header: t('admin.promos.value'), cell: (p) => (p.kind === 'PERCENT' ? `${p.percent} %` : p.tokens) },
            { key: 'used', header: t('admin.promos.used'), cell: (p) => `${p.used}${p.maxRedemptions ? ` / ${p.maxRedemptions}` : ''}` },
            { key: 'expires', header: t('admin.promos.expires'), cell: (p) => (p.expiresAt ? formatDate(p.expiresAt, locale) : '—') },
            { key: 'status', header: t('admin.status'), srOnlyHeader: true, cell: (p) => <span className="flex items-center gap-2"><Badge tone={p.active ? 'success' : 'neutral'}>{p.active ? t('admin.promos.active') : t('admin.promos.inactive')}</Badge><Button size="sm" variant="outline" onClick={() => toggle.mutate(p)}>{p.active ? t('admin.promos.disable') : t('admin.promos.enable')}</Button></span> },
          ]}
        />
      )}
    </div>
  );
}
