'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Power, PowerOff } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge, CrudTable, Field, Input, Select } from '@duomatch/ui';
import { PageLoader } from '@/components/PageLoader';
import { useApiError } from '@/hooks/useApiError';
import { useTableLabels } from '@/hooks/useTableLabels';
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
  const tableLabels = useTableLabels();
  const [f, setF] = useState(blank);
  const list = useQuery({ queryKey: ['admin', 'promos'], queryFn: () => api<PromoRow[]>('/admin/promos') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'promos'] });
  const create = useMutation({
    mutationFn: () => post('/admin/promos', {
      code: f.code.trim().toUpperCase(), kind: f.kind, ...(f.kind === 'PERCENT' ? { percent: Number(f.value) } : { tokens: Number(f.value) }),
      maxRedemptions: f.max ? Number(f.max) : null, expiresAt: f.expires ? new Date(`${f.expires}T23:59:59`).toISOString() : null,
    }),
    onSuccess: () => { toast('success', t('admin.promos.created')); void refresh(); },
    onError: (e) => toast('error', err(e)),
  });
  const toggle = useMutation({ mutationFn: (p: PromoRow) => patch(`/admin/promos/${p.id}`, { active: !p.active }), onSuccess: refresh, onError: (e) => toast('error', err(e)) });
  return (
    <CrudTable
      title={t('admin.promos.title')} description={t('admin.promos.subtitle')}
      addLabel={t('admin.promos.new')} dialogTitle={t('admin.promos.new')} submitLabel={t('admin.promos.create')}
      exportName="codes-promo" tableLabels={tableLabels} cancelLabel={t('common.cancel')} closeLabel={t('common.close')}
      onOpen={() => setF(blank)} onSubmit={() => create.mutateAsync()} submitting={create.isPending}
      footnote={t('admin.promos.immutable')}
      rows={list.data} rowKey={(p) => p.id} loading={<PageLoader inline />} empty={t('admin.promos.empty')}
      rowActions={(p) => [{ label: p.active ? t('admin.promos.disable') : t('admin.promos.enable'), icon: p.active ? <PowerOff className="size-4" aria-hidden /> : <Power className="size-4" aria-hidden />, onSelect: () => toggle.mutate(p) }]}
      columns={[
        { key: 'code', header: t('admin.promos.code'), value: (p) => p.code, filter: 'text', cellClassName: 'font-mono font-semibold', cell: (p) => p.code },
        { key: 'kind', header: t('admin.promos.kind'), value: (p) => p.kind, filter: { options: [{ value: 'PERCENT', label: t('admin.promos.kindPERCENT') }, { value: 'TOKENS', label: t('admin.promos.kindTOKENS') }] }, cell: (p) => t(`admin.promos.kind${p.kind}` as never) },
        { key: 'value', header: t('admin.promos.value'), value: (p) => (p.kind === 'PERCENT' ? p.percent : p.tokens), cell: (p) => (p.kind === 'PERCENT' ? `${p.percent} %` : p.tokens) },
        { key: 'used', mobileHidden: true, header: t('admin.promos.used'), value: (p) => p.used, cell: (p) => `${p.used}${p.maxRedemptions ? ` / ${p.maxRedemptions}` : ''}` },
        { key: 'expires', mobileHidden: true, header: t('admin.promos.expires'), value: (p) => p.expiresAt ?? '', cell: (p) => (p.expiresAt ? formatDate(p.expiresAt, locale) : '—') },
        { key: 'status', header: t('admin.status'), value: (p) => (p.active ? 'active' : 'inactive'), filter: { options: [{ value: 'active', label: t('admin.promos.active') }, { value: 'inactive', label: t('admin.promos.inactive') }] }, cell: (p) => <Badge tone={p.active ? 'success' : 'neutral'}>{p.active ? t('admin.promos.active') : t('admin.promos.inactive')}</Badge> },
      ]}
    >
      <Field label={t('admin.promos.code')}>{(p) => <Input {...p} required minLength={3} maxLength={32} pattern="[A-Za-z0-9_\-]{3,32}" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />}</Field>
      <Field label={t('admin.promos.kind')}>{(p) => <Select {...p} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as 'PERCENT' | 'TOKENS', value: '' })}><option value="PERCENT">{t('admin.promos.kindPERCENT')}</option><option value="TOKENS">{t('admin.promos.kindTOKENS')}</option></Select>}</Field>
      <Field label={f.kind === 'PERCENT' ? t('admin.promos.percent') : t('admin.promos.tokens')}>{(p) => <Input {...p} required type="number" min={1} max={f.kind === 'PERCENT' ? 90 : 500} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />}</Field>
      <Field label={t('admin.promos.max')}>{(p) => <Input {...p} type="number" min={1} value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} />}</Field>
      <Field label={t('admin.promos.expires')}>{(p) => <Input {...p} type="date" value={f.expires} onChange={(e) => setF({ ...f, expires: e.target.value })} />}</Field>
    </CrudTable>
  );
}
