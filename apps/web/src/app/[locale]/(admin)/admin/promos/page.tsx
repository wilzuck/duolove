'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, MegaphoneOff, Power, PowerOff, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge, CrudTable, Field, Input, Select, Switch } from '@duomatch/ui';
import { PageLoader } from '@/components/PageLoader';
import { useApiError } from '@/hooks/useApiError';
import { useTableLabels } from '@/hooks/useTableLabels';
import { api, del, patch, post } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useUi } from '@/lib/store';

interface PromoRow { id: string; code: string; kind: 'PERCENT' | 'TOKENS'; percent: number | null; tokens: number | null; maxRedemptions: number | null; expiresAt: string | null; active: boolean; featured: boolean; claimHours: number | null; used: number }
const blank = { code: '', kind: 'PERCENT' as 'PERCENT' | 'TOKENS', value: '', max: '', expires: '', featured: false, hours: '' };

export default function AdminPromos() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const tableLabels = useTableLabels();
  const [f, setF] = useState(blank);
  const [editing, setEditing] = useState<PromoRow | null>(null);
  const list = useQuery({ queryKey: ['admin', 'promos'], queryFn: () => api<PromoRow[]>('/admin/promos') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'promos'] });
  const create = useMutation({
    mutationFn: () => post('/admin/promos', {
      code: f.code.trim().toUpperCase(), kind: f.kind, ...(f.kind === 'PERCENT' ? { percent: Number(f.value) } : { tokens: Number(f.value) }),
      maxRedemptions: f.max ? Number(f.max) : null, expiresAt: f.expires ? new Date(`${f.expires}T23:59:59`).toISOString() : null, featured: f.featured, claimHours: f.hours ? Number(f.hours) : null,
    }),
    onSuccess: () => { toast('success', t('admin.promos.created')); void refresh(); },
    onError: (e) => toast('error', err(e)),
  });
  // Seuls le plafond, la date d'expiration, le délai et la mise en avant se modifient : le code, le type et la valeur sont figés (voir la note du formulaire).
  const edit = useMutation({
    mutationFn: (r: PromoRow) => patch(`/admin/promos/${r.id}`, { maxRedemptions: f.max ? Number(f.max) : null, expiresAt: f.expires ? new Date(`${f.expires}T23:59:59`).toISOString() : null, featured: f.featured, claimHours: f.hours ? Number(f.hours) : null }),
    onSuccess: () => { toast('success', t('admin.promos.saved')); void refresh(); },
    onError: (e) => toast('error', err(e)),
  });
  const remove = useMutation({ mutationFn: (p: PromoRow) => del(`/admin/promos/${p.id}`), onSuccess: () => { toast('success', t('admin.promos.deleted')); void refresh(); }, onError: (e) => toast('error', err(e)) });
  const toggle = useMutation({ mutationFn: (p: PromoRow) => patch(`/admin/promos/${p.id}`, { active: !p.active }), onSuccess: refresh, onError: (e) => toast('error', err(e)) });
  const feature = useMutation({ mutationFn: (p: PromoRow) => patch(`/admin/promos/${p.id}`, { featured: !p.featured }), onSuccess: refresh, onError: (e) => toast('error', err(e)) });
  return (
    <CrudTable
      title={t('admin.promos.title')} description={t('admin.promos.subtitle')}
      addLabel={t('admin.promos.new')} editLabel={t('admin.promos.edit')} dialogTitle={t(editing ? 'admin.promos.editTitle' : 'admin.promos.new')} submitLabel={t(editing ? 'admin.promos.save' : 'admin.promos.create')}
      exportName="codes-promo" tableLabels={tableLabels} cancelLabel={t('common.cancel')} closeLabel={t('common.close')}
      onOpen={(r) => { setEditing(r); setF(r ? { code: r.code, kind: r.kind, value: String(r.kind === 'PERCENT' ? r.percent : r.tokens), max: r.maxRedemptions ? String(r.maxRedemptions) : '', expires: r.expiresAt ? r.expiresAt.slice(0, 10) : '', featured: r.featured, hours: r.claimHours ? String(r.claimHours) : '' } : blank); }}
      onSubmit={(r) => (r ? edit.mutateAsync(r) : create.mutateAsync())} submitting={create.isPending || edit.isPending}
      footnote={t(editing ? 'admin.promos.lockedHint' : 'admin.promos.immutable')}
      rows={list.data} rowKey={(p) => p.id} loading={<PageLoader inline />} empty={t('admin.promos.empty')}
      rowActions={(p) => [{ label: p.featured ? t('admin.promos.unfeature') : t('admin.promos.feature'), icon: p.featured ? <MegaphoneOff className="size-4" aria-hidden /> : <Megaphone className="size-4" aria-hidden />, onSelect: () => feature.mutate(p) }, { label: t('admin.promos.delete'), icon: <Trash2 className="size-4" aria-hidden />, tone: 'danger' as const, onSelect: () => remove.mutate(p) }, { label: p.active ? t('admin.promos.disable') : t('admin.promos.enable'), icon: p.active ? <PowerOff className="size-4" aria-hidden /> : <Power className="size-4" aria-hidden />, onSelect: () => toggle.mutate(p) }]}
      columns={[
        { key: 'code', header: t('admin.promos.code'), value: (p) => p.code, filter: 'text', cellClassName: 'font-mono font-semibold', cell: (p) => p.code },
        { key: 'kind', header: t('admin.promos.kind'), value: (p) => p.kind, filter: { options: [{ value: 'PERCENT', label: t('admin.promos.kindPERCENT') }, { value: 'TOKENS', label: t('admin.promos.kindTOKENS') }] }, cell: (p) => t(`admin.promos.kind${p.kind}` as never) },
        { key: 'value', header: t('admin.promos.value'), value: (p) => (p.kind === 'PERCENT' ? p.percent : p.tokens), cell: (p) => (p.kind === 'PERCENT' ? `${p.percent} %` : p.tokens) },
        { key: 'used', mobileHidden: true, header: t('admin.promos.used'), value: (p) => p.used, cell: (p) => `${p.used}${p.maxRedemptions ? ` / ${p.maxRedemptions}` : ''}` },
        { key: 'expires', mobileHidden: true, header: t('admin.promos.expires'), value: (p) => p.expiresAt ?? '', cell: (p) => (p.expiresAt ? formatDate(p.expiresAt, locale) : '—') },
        { key: 'status', header: t('admin.status'), value: (p) => (p.active ? 'active' : 'inactive'), filter: { options: [{ value: 'active', label: t('admin.promos.active') }, { value: 'inactive', label: t('admin.promos.inactive') }] }, cell: (p) => <span className="inline-flex flex-wrap gap-1"><Badge tone={p.active ? 'success' : 'neutral'}>{p.active ? t('admin.promos.active') : t('admin.promos.inactive')}</Badge>{p.featured && <Badge tone="brand">{t('admin.promos.featured')}</Badge>}{p.claimHours ? <Badge tone="neutral">{t('admin.promos.hoursBadge', { n: p.claimHours })}</Badge> : null}</span> },
      ]}
    >
      <Field label={t('admin.promos.code')}>{(p) => <Input {...p} required disabled={!!editing} minLength={3} maxLength={32} pattern="[A-Za-z0-9_\-]{3,32}" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />}</Field>
      <Field label={t('admin.promos.kind')}>{(p) => <Select {...p} disabled={!!editing} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as 'PERCENT' | 'TOKENS', value: '' })}><option value="PERCENT">{t('admin.promos.kindPERCENT')}</option><option value="TOKENS">{t('admin.promos.kindTOKENS')}</option></Select>}</Field>
      <Field label={f.kind === 'PERCENT' ? t('admin.promos.percent') : t('admin.promos.tokens')}>{(p) => <Input {...p} required disabled={!!editing} type="number" min={1} max={f.kind === 'PERCENT' ? 90 : 500} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />}</Field>
      <Field label={t('admin.promos.max')}>{(p) => <Input {...p} type="number" min={1} value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} />}</Field>
      <Field label={t('admin.promos.expires')}>{(p) => <Input {...p} type="date" value={f.expires} onChange={(e) => setF({ ...f, expires: e.target.value })} />}</Field>
      <div className="sm:col-span-2"><Field label={t('admin.promos.hours')} hint={t('admin.promos.hoursHint')}>{(p) => <Input {...p} type="number" min={1} max={720} value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} />}</Field></div>
      <div className="flex items-start justify-between gap-4 rounded-2xl bg-soft p-4 sm:col-span-2">
        <div><p className="text-sm font-semibold">{t('admin.promos.featuredLabel')}</p><p className="mt-0.5 text-sm text-muted">{t('admin.promos.featuredHint')}</p></div>
        <Switch checked={f.featured} onChange={(v) => setF({ ...f, featured: v })} label={t('admin.promos.featuredLabel')} />
      </div>
    </CrudTable>
  );
}
