'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Badge, Button, DataTableView, Dialog, Field, Input, Select, Skeleton } from '@duomatch/ui';
import { PageHeader, StatStrip, countOf, useAdminSummary } from '@/components/admin/PageParts';
import { useAdminList } from '@/hooks/useAdmin';
import { useApiError } from '@/hooks/useApiError';
import { useTableLabels } from '@/hooks/useTableLabels';
import { useMe } from '@/hooks/useQueries';
import { api, patch, post } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useUi } from '@/lib/store';

interface Row { id: string; displayName: string; email: string | null; role: string; status: string; city?: string; country?: string; verified: boolean; plan: string; reports: number; createdAt: string; lastActiveAt: string }
interface Detail { id: string; email: string | null; role: string; status: string; suspendedUntil: string | null; plan: string; profile: { displayName: string; bio: string; city: string; photos: { id: string; url: string; status: string }[] } | null; moderation: { id: string; type: string; reason: string; createdAt: string }[]; reports: { id: string; reason: string; status: string }[] }

export default function AdminUsers() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const { data: me } = useMe();
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const tableLabels = useTableLabels();
  const sum = useAdminSummary().data;
  const [sel, setSel] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [days, setDays] = useState(7);
  useEffect(() => { const id = setTimeout(() => setTerm(q.trim()), 300); return () => clearTimeout(id); }, [q]);
  const list = useAdminList<Row>(['users', term], `/admin/users?q=${encodeURIComponent(term)}`);
  const detail = useQuery({ queryKey: ['admin', 'user', sel], enabled: !!sel, queryFn: () => api<Detail>(`/admin/users/${sel}`) });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['admin'] }); setReason(''); };
  const act = useMutation({ mutationFn: ({ kind }: { kind: 'suspend' | 'ban' | 'unsuspend' }) => post(`/admin/users/${sel}/${kind}`, kind === 'suspend' ? { reason, days } : { reason }), onSuccess: () => { refresh(); toast('success', t('admin.done')); }, onError: (e) => toast('error', err(e)) });
  const role = useMutation({ mutationFn: (r: string) => patch(`/admin/users/${sel}/role`, { role: r }), onSuccess: refresh, onError: (e) => toast('error', err(e)) });
  const d = detail.data;
  const tone = (s: string) => (s === 'ACTIVE' ? 'success' : s === 'DELETED' ? 'neutral' : 'danger') as 'success' | 'neutral' | 'danger';

  return (
    <div className="space-y-4">
      <PageHeader title={t('admin.nav.users')} description={t('admin.pageDesc.users')} />
      <StatStrip items={[
        { label: t('admin.strip.total'), value: sum?.users.total },
        { label: t('admin.strip.active'), value: countOf(sum?.users, 'ACTIVE'), tone: 'success' },
        { label: t('admin.strip.suspended'), value: countOf(sum?.users, 'SUSPENDED'), tone: 'warn' },
        { label: t('admin.strip.banned'), value: countOf(sum?.users, 'BANNED'), tone: 'danger' },
      ]} />
      {list.isLoading ? <Skeleton className="h-64" /> : (
        <DataTableView
          minWidth="40rem" rows={list.items} rowKey={(u) => u.id} empty={t('admin.empty')} labels={tableLabels} exportName="utilisateurs"
          serverSearch={{ value: q, onChange: setQ }} hasMore={list.hasNextPage} onLoadMore={() => void list.fetchNextPage()} loadingMore={list.isFetchingNextPage}
          columns={[
            { key: 'name', header: t('admin.cols.name'), value: (u) => `${u.displayName} ${u.email ?? ''}`, cell: (u) => <><button className="text-left font-semibold text-brand-ink underline-offset-2 hover:underline" onClick={() => setSel(u.id)}>{u.displayName}</button><span className="block text-xs text-muted">{u.email ?? u.id.slice(0, 8)} · {u.role}</span></> },
            { key: 'status', header: t('admin.cols.status'), value: (u) => u.status, filter: { options: ['ACTIVE', 'SUSPENDED', 'BANNED', 'DELETED'].map((s) => ({ value: s, label: t(`admin.userStatus.${s}`) })) }, cell: (u) => <Badge tone={tone(u.status)}>{t(`admin.userStatus.${u.status}`)}</Badge> },
            { key: 'plan', header: t('admin.cols.plan'), value: (u) => u.plan, filter: { options: ['FREE', 'PREMIUM', 'VIP'].map((p) => ({ value: p, label: p })) }, cell: (u) => u.plan },
            { key: 'reports', mobileHidden: true, header: t('admin.cols.reports'), value: (u) => u.reports, cell: (u) => u.reports },
            { key: 'joined', mobileHidden: true, header: t('admin.cols.joined'), value: (u) => u.createdAt, cellClassName: 'text-muted', cell: (u) => formatDate(u.createdAt, locale, { day: 'numeric', month: 'short', year: 'numeric' }) },
          ]}
        />
      )}

      <Dialog open={!!sel} onClose={() => setSel(null)} title={d?.profile?.displayName ?? t('admin.user')} closeLabel={t('common.close')} className="w-[min(94vw,38rem)]">
        {!d ? <Skeleton className="h-40" /> : (
          <div className="space-y-4 text-sm">
            <p><Badge tone={tone(d.status)}>{t(`admin.userStatus.${d.status}`)}</Badge> <span className="text-muted">{d.email ?? ''} · {d.role} · {d.plan}</span></p>
            {d.profile && <p className="text-muted">{d.profile.city} — {d.profile.bio || t('admin.noBio')}</p>}
            {d.profile && d.profile.photos.length > 0 && <ul className="flex gap-2 overflow-x-auto">{d.profile.photos.map((p) => <li key={p.id}><img src={p.url} alt="" className="size-20 rounded-xl object-cover" /></li>)}</ul>}
            {d.reports.length > 0 && <div><h3 className="font-bold">{t('admin.tabs.reports')}</h3><ul className="list-disc pl-5 text-muted">{d.reports.map((r) => <li key={r.id}>{t(`report.reasons.${r.reason}` as never)} — {r.status}</li>)}</ul></div>}
            {d.moderation.length > 0 && <div><h3 className="font-bold">{t('admin.history')}</h3><ul className="list-disc pl-5 text-muted">{d.moderation.map((m) => <li key={m.id}>{m.type} — {m.reason}</li>)}</ul></div>}
            {d.role === 'USER' && (
              <div className="space-y-3 rounded-2xl bg-soft p-4">
                <Field label={t('admin.reason')}>{(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
                <Field label={t('admin.days')}>{(p) => <Input {...p} type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value) || 7)} />}</Field>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={reason.length < 3} onClick={() => act.mutate({ kind: 'suspend' })} loading={act.isPending}>{t('admin.suspend')}</Button>
                  <Button size="sm" variant="danger" disabled={reason.length < 3} onClick={() => act.mutate({ kind: 'ban' })}>{t('admin.ban')}</Button>
                  {(d.status === 'SUSPENDED' || d.status === 'BANNED') && <Button size="sm" variant="secondary" disabled={reason.length < 3} onClick={() => act.mutate({ kind: 'unsuspend' })}>{t('admin.unsuspend')}</Button>}
                </div>
              </div>
            )}
            {me?.role === 'SUPER_ADMIN' && d.id !== me.id && <Field label={t('admin.role')}>{(p) => <Select {...p} value={d.role} onChange={(e) => role.mutate(e.target.value)}>{['USER', 'MODERATOR', 'ADMIN'].map((r) => <option key={r}>{r}</option>)}</Select>}</Field>}
          </div>
        )}
      </Dialog>
    </div>
  );
}
