'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, Card, EmptyState, Skeleton, cn } from '@duomatch/ui';
import { useAdminList } from '@/hooks/useAdmin';
import { useApiError } from '@/hooks/useApiError';
import { api, post } from '@/lib/api';
import { useUi } from '@/lib/store';

const TABS = ['verifications', 'appeals', 'photos'] as const;

function Verifications() {
  const t = useTranslations();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const q = useQuery({ queryKey: ['admin', 'verifs'], queryFn: () => api<{ id: string; displayName: string }[]>('/admin/verifications') });
  const m = useMutation({ mutationFn: ({ id, approve }: { id: string; approve: boolean }) => post(`/admin/verifications/${id}/review`, { approve }), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }), onError: (e) => toast('error', err(e)) });
  if (!q.data) return <Skeleton className="h-40" />;
  if (!q.data.length) return <EmptyState icon={<CircleCheck className="size-8" aria-hidden />} title={t('admin.noVerifs')} />;
  return <ul className="grid gap-3 sm:grid-cols-2">{q.data.map((v) => (
    <li key={v.id}><Card className="space-y-3 p-4"><p className="font-semibold">{v.displayName}</p><img src={`/api/admin/verifications/${v.id}/selfie`} alt={t('admin.selfieAlt', { name: v.displayName })} className="aspect-[4/5] w-full rounded-2xl object-cover" />
      <div className="flex gap-2"><Button size="sm" onClick={() => m.mutate({ id: v.id, approve: true })}>{t('admin.approve')}</Button><Button size="sm" variant="outline" onClick={() => m.mutate({ id: v.id, approve: false })}>{t('admin.reject')}</Button></div></Card></li>
  ))}</ul>;
}

function Appeals() {
  const t = useTranslations();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const q = useQuery({ queryKey: ['admin', 'appeals'], queryFn: () => api<{ id: string; displayName: string; type: string; reason: string; appealText: string }[]>('/admin/appeals') });
  const m = useMutation({ mutationFn: ({ id, approve }: { id: string; approve: boolean }) => post(`/admin/appeals/${id}/decide`, { approve }), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }), onError: (e) => toast('error', err(e)) });
  if (!q.data) return <Skeleton className="h-40" />;
  if (!q.data.length) return <EmptyState icon={<CircleCheck className="size-8" aria-hidden />} title={t('admin.noAppeals')} />;
  return <ul className="space-y-3">{q.data.map((a) => (
    <li key={a.id}><Card className="space-y-2 p-5"><p className="font-semibold">{a.displayName} — {a.type}</p><p className="text-sm text-muted">{t('admin.sanctionReason')} {a.reason}</p><p className="rounded-2xl bg-soft p-3 text-sm">{a.appealText}</p>
      <div className="flex gap-2"><Button size="sm" onClick={() => m.mutate({ id: a.id, approve: true })}>{t('admin.accept')}</Button><Button size="sm" variant="outline" onClick={() => m.mutate({ id: a.id, approve: false })}>{t('admin.reject')}</Button></div></Card></li>
  ))}</ul>;
}

function Photos() {
  const t = useTranslations();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const list = useAdminList<{ id: string; url: string; displayName: string }>(['photos'], '/admin/photos?status=APPROVED');
  const m = useMutation({ mutationFn: (id: string) => post(`/admin/photos/${id}/reject`, { reason: 'inappropriate' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }), onError: (e) => toast('error', err(e)) });
  if (list.isLoading) return <Skeleton className="h-40" />;
  return (
    <div className="space-y-4">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">{list.items.map((p) => (
        <li key={p.id} className="space-y-1"><img src={p.url} alt={t('admin.photoAlt', { name: p.displayName })} className="aspect-[4/5] w-full rounded-2xl object-cover" /><p className="truncate text-xs text-muted">{p.displayName}</p><Button size="sm" variant="outline" className="w-full" onClick={() => m.mutate(p.id)}>{t('admin.reject')}</Button></li>
      ))}</ul>
      {list.hasNextPage && <div className="text-center"><Button variant="outline" onClick={() => list.fetchNextPage()}>{t('admin.more')}</Button></div>}
    </div>
  );
}

export default function AdminModeration() {
  const t = useTranslations();
  const [tab, setTab] = useState<(typeof TABS)[number]>('verifications');
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label={t('admin.tabs.moderation')} className="flex gap-2">{TABS.map((k) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('rounded-full px-4 py-2 text-sm font-semibold', tab === k ? 'bg-brand-strong text-white' : 'bg-soft text-brand-ink')}>{t(`admin.mod.${k}`)}</button>)}</div>
      <div role="tabpanel">{tab === 'verifications' ? <Verifications /> : tab === 'appeals' ? <Appeals /> : <Photos />}</div>
    </div>
  );
}
