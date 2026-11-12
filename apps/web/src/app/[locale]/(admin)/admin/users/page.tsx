'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Clock, RotateCcw, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Badge, Button, DataTableView, Dialog, Field, Input, Select, Skeleton } from '@duomatch/ui';
import { PageHeader, StatStrip, countOf, useAdminSummary } from '@/components/admin/PageParts';
import { useAdminList } from '@/hooks/useAdmin';
import { useApiError } from '@/hooks/useApiError';
import { useTableLabels } from '@/hooks/useTableLabels';
import { useMe } from '@/hooks/useQueries';
import { COUNTRIES, countryFlag } from '@duomatch/types';
import { api, patch, post } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useUi } from '@/lib/store';

interface Row { id: string; displayName: string; email: string | null; role: string; status: string; city?: string; country?: string; lastCountry?: string | null; countryMismatch?: boolean; verified: boolean; plan: string; reports: number; createdAt: string; lastActiveAt: string }
interface Detail { lastCountry: string | null; id: string; email: string | null; role: string; status: string; suspendedUntil: string | null; plan: string; planValidUntil: string | null; profile: { displayName: string; bio: string; city: string; photos: { id: string; url: string; status: string }[] } | null; moderation: { id: string; type: string; reason: string; createdAt: string; expiresAt: string | null }[]; reports: { id: string; reason: string; status: string }[] }

/** Nom du pays (drapeau compris) à partir de son code ISO ; le code lui-même s'il est inconnu. */
const countryName = (code: string | null | undefined, locale: string) => {
  const c = COUNTRIES.find((x) => x.code === code);
  return c ? `${countryFlag(c.code)} ${locale === 'en' ? c.en : c.fr}` : (code ?? '—');
};

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
  const [mismatch, setMismatch] = useState(false);  // seulement les membres dont le pays de connexion diffère du pays déclaré
  const [reason, setReason] = useState('');
  const [days, setDays] = useState(7);
  useEffect(() => { const id = setTimeout(() => setTerm(q.trim()), 300); return () => clearTimeout(id); }, [q]);
  const list = useAdminList<Row>(['users', term, mismatch], `/admin/users?q=${encodeURIComponent(term)}${mismatch ? '&mismatch=true' : ''}`);
  const detail = useQuery({ queryKey: ['admin', 'user', sel], enabled: !!sel, queryFn: () => api<Detail>(`/admin/users/${sel}`) });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['admin'] }); setReason(''); };
  const act = useMutation({ mutationFn: ({ kind }: { kind: 'suspend' | 'ban' | 'unsuspend' }) => post(`/admin/users/${sel}/${kind}`, kind === 'suspend' ? { reason, days } : { reason }), onSuccess: () => { refresh(); toast('success', t('admin.done')); }, onError: (e) => toast('error', err(e)) });
  const role = useMutation({ mutationFn: (r: string) => patch(`/admin/users/${sel}/role`, { role: r }), onSuccess: refresh, onError: (e) => toast('error', err(e)) });
  const [grantPlan, setGrantPlan] = useState<'PREMIUM' | 'VIP'>('PREMIUM');
  const [grantDays, setGrantDays] = useState(30);
  const grant = useMutation({ mutationFn: () => post(`/admin/users/${sel}/grant-plan`, { plan: grantPlan, days: grantDays, reason }), onSuccess: () => { refresh(); toast('success', t('admin.done')); }, onError: (e) => toast('error', err(e)) });
  const resetTf = useMutation({ mutationFn: () => post<{ wasEnabled: boolean }>(`/admin/users/${sel}/two-factor/reset`, { reason }), onSuccess: (r) => { refresh(); toast('success', r.wasEnabled ? t('admin.twoFactorResetDone') : t('admin.twoFactorNone')); }, onError: (e) => toast('error', err(e)) });
  const revoke = useMutation({ mutationFn: () => post(`/admin/users/${sel}/revoke-plan`, { reason }), onSuccess: () => { refresh(); toast('success', t('admin.done')); }, onError: (e) => toast('error', err(e)) });
  const d = detail.data;

  // Actions groupées : on coche des comptes, on choisit l'action, puis une fenêtre demande le motif (obligatoire). Les comptes du personnel sont ignorés par le serveur.
  type BulkKind = 'suspend' | 'ban' | 'unsuspend' | 'delete';
  const [bulk, setBulk] = useState<{ kind: BulkKind; rows: Row[]; resolve: () => void; reject: () => void } | null>(null);
  const [bulkReason, setBulkReason] = useState('');
  const [bulkDays, setBulkDays] = useState(7);
  const closeBulk = () => { bulk?.reject(); setBulk(null); setBulkReason(''); };
  const runBulk = useMutation({
    mutationFn: () => post<{ done: string[]; failed: { id: string; code: string }[] }>('/admin/users/bulk', { ids: bulk!.rows.map((r) => r.id), action: bulk!.kind, reason: bulkReason.trim(), ...(bulk!.kind === 'suspend' ? { days: bulkDays } : {}) }),
    onSuccess: (r) => {
      toast(r.failed.length ? 'info' : 'success', t('admin.bulk.result', { done: r.done.length, failed: r.failed.length }));
      void qc.invalidateQueries({ queryKey: ['admin'] });
      bulk?.resolve(); setBulk(null); setBulkReason('');
    },
    onError: (e) => toast('error', err(e)),
  });
  const isAdmin = me?.role === 'ADMIN' || me?.role === 'SUPER_ADMIN';
  const askBulk = (kind: BulkKind) => (rows: Row[]) => new Promise<void>((resolve, reject) => { setBulk({ kind, rows, resolve, reject }); });
  const canSanction = (rows: Row[]) => rows.some((r) => r.role === 'USER');
  const bulkActions = [
    { key: 'suspend', label: t('admin.suspend'), icon: <Clock className="size-4" aria-hidden />, onRun: askBulk('suspend'), enabled: canSanction },
    { key: 'unsuspend', label: t('admin.unsuspend'), icon: <RotateCcw className="size-4" aria-hidden />, onRun: askBulk('unsuspend'), enabled: canSanction },
    { key: 'ban', label: t('admin.ban'), icon: <Ban className="size-4" aria-hidden />, tone: 'danger' as const, onRun: askBulk('ban'), enabled: canSanction },
    ...(isAdmin ? [{ key: 'delete', label: t('admin.bulk.delete'), icon: <Trash2 className="size-4" aria-hidden />, tone: 'danger' as const, onRun: askBulk('delete'), enabled: canSanction }] : []),
  ];
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
      <label className="flex w-fit items-center gap-2 text-sm"><input type="checkbox" checked={mismatch} onChange={(e) => setMismatch(e.target.checked)} className="size-4 accent-brand-strong" />{t('admin.users.mismatchFilter')}</label>
      {list.isLoading ? <Skeleton className="h-64" /> : (
        <DataTableView
          bulkActions={bulkActions} minWidth="40rem" rows={list.items} rowKey={(u) => u.id} empty={t('admin.empty')} labels={tableLabels} exportName="utilisateurs"
          serverSearch={{ value: q, onChange: setQ }} hasMore={list.hasNextPage} onLoadMore={() => void list.fetchNextPage()} loadingMore={list.isFetchingNextPage}
          columns={[
            { key: 'name', header: t('admin.cols.name'), value: (u) => `${u.displayName} ${u.email ?? ''}`, cell: (u) => <><button className="text-left font-semibold text-brand-ink underline-offset-2 hover:underline" onClick={() => setSel(u.id)}>{u.displayName}</button><span className="block text-xs text-muted">{u.email ?? u.id.slice(0, 8)} · {u.role}</span></> },
            { key: 'status', header: t('admin.cols.status'), value: (u) => u.status, filter: { options: ['ACTIVE', 'SUSPENDED', 'BANNED', 'DELETED'].map((s) => ({ value: s, label: t(`admin.userStatus.${s}`) })) }, cell: (u) => <><Badge tone={tone(u.status)}>{t(`admin.userStatus.${u.status}`)}</Badge>{u.countryMismatch && <Badge tone="gold" className="ml-1">{t('admin.users.mismatchBadge', { declared: countryName(u.country, locale), seen: countryName(u.lastCountry, locale) })}</Badge>}</> },
            { key: 'plan', header: t('admin.cols.plan'), value: (u) => u.plan, filter: { options: ['FREE', 'PREMIUM', 'VIP'].map((p) => ({ value: p, label: p })) }, cell: (u) => u.plan },
            { key: 'reports', mobileHidden: true, header: t('admin.cols.reports'), value: (u) => u.reports, cell: (u) => u.reports },
            { key: 'joined', mobileHidden: true, header: t('admin.cols.joined'), value: (u) => u.createdAt, cellClassName: 'text-muted', cell: (u) => formatDate(u.createdAt, locale, { day: 'numeric', month: 'short', year: 'numeric' }) },
          ]}
        />
      )}

      <Dialog open={!!bulk} onClose={() => !runBulk.isPending && closeBulk()} title={bulk ? t(`admin.bulk.title.${bulk.kind}`) : ''} closeLabel={t('common.close')} className="w-[min(94vw,30rem)]" dismissible={!runBulk.isPending}>
        {bulk && (
          <form className="space-y-4 text-sm" onSubmit={(e) => { e.preventDefault(); runBulk.mutate(); }}>
            <p>{t('admin.bulk.message', { count: bulk.rows.length })}</p>
            {bulk.kind === 'delete' && <p className="rounded-2xl bg-danger-soft px-4 py-3 font-medium text-danger-ink">{t('admin.bulk.deleteWarning')}</p>}
            <Field label={t('admin.reason')} hint={bulkReason.trim().length < 3 ? t('admin.reasonNeeded') : undefined}>{(p) => <Input {...p} value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} required minLength={3} maxLength={300} autoFocus />}</Field>
            {bulk.kind === 'suspend' && <Field label={t('admin.days')}>{(p) => <Input {...p} type="number" min={1} max={365} value={bulkDays} onChange={(e) => setBulkDays(Math.min(365, Math.max(1, Number(e.target.value) || 7)))} />}</Field>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeBulk} disabled={runBulk.isPending}>{t('common.cancel')}</Button>
              <Button type="submit" variant={bulk.kind === 'suspend' || bulk.kind === 'unsuspend' ? 'primary' : 'danger'} loading={runBulk.isPending} disabled={bulkReason.trim().length < 3}>{t(`admin.bulk.confirm.${bulk.kind}`)}</Button>
            </div>
          </form>
        )}
      </Dialog>

      <Dialog open={!!sel} onClose={() => setSel(null)} title={d?.profile?.displayName ?? t('admin.user')} closeLabel={t('common.close')} className="w-[min(94vw,38rem)]">
        {!d ? <Skeleton className="h-40" /> : (
          <div className="space-y-4 text-sm">
            <p><Badge tone={tone(d.status)}>{t(`admin.userStatus.${d.status}`)}</Badge> <span className="text-muted">{d.email ?? ''} · {d.role} · {d.plan}{d.planValidUntil ? ` (${t('admin.grant.until', { date: formatDate(d.planValidUntil, locale, { day: 'numeric', month: 'short', year: 'numeric' }) })})` : ''}</span></p>
            {d.status === 'SUSPENDED' && d.suspendedUntil && <p className="font-medium text-danger-ink">{t('admin.suspendedUntil', { date: formatDate(d.suspendedUntil, locale, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) })}</p>}
            {d.profile && <p className="text-muted">{d.profile.city} — {d.profile.bio || t('admin.noBio')}</p>}
            {d.lastCountry && <p className="text-muted">{t('admin.users.countryLine', { seen: countryName(d.lastCountry, locale) })}</p>}
            {d.profile && d.profile.photos.length > 0 && <ul className="flex gap-2 overflow-x-auto">{d.profile.photos.map((p) => <li key={p.id}><img src={p.url} alt="" className="size-20 rounded-xl object-cover" /></li>)}</ul>}
            {d.reports.length > 0 && <div><h3 className="font-bold">{t('admin.tabs.reports')}</h3><ul className="list-disc pl-5 text-muted">{d.reports.map((r) => <li key={r.id}>{t(`report.reasons.${r.reason}` as never)} — {r.status}</li>)}</ul></div>}
            {d.moderation.length > 0 && <div><h3 className="font-bold">{t('admin.history')}</h3><ul className="list-disc pl-5 text-muted">{d.moderation.map((m) => <li key={m.id}><span className="font-medium text-fg">{t(`admin.modTypes.${m.type}` as never)}</span> · <time dateTime={m.createdAt}>{formatDate(m.createdAt, locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>{m.expiresAt ? ` → ${t('admin.grant.until', { date: formatDate(m.expiresAt, locale, { day: 'numeric', month: 'short', year: 'numeric' }) })}` : ''} — {m.reason}</li>)}</ul></div>}
            {d.role === 'USER' && (
              <div className="space-y-3 rounded-2xl bg-soft p-4">
                <Field label={t('admin.reason')} hint={reason.trim().length < 3 ? t('admin.reasonNeeded') : undefined}>{(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} />}</Field>
                <Field label={t('admin.days')}>{(p) => <Input {...p} type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value) || 7)} />}</Field>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={reason.trim().length < 3} onClick={() => act.mutate({ kind: 'suspend' })} loading={act.isPending}>{t('admin.suspend')}</Button>
                  <Button size="sm" variant="danger" disabled={reason.trim().length < 3} onClick={() => act.mutate({ kind: 'ban' })}>{t('admin.ban')}</Button>
                  {(d.status === 'SUSPENDED' || d.status === 'BANNED') && <Button size="sm" variant="secondary" disabled={reason.trim().length < 3} onClick={() => act.mutate({ kind: 'unsuspend' })}>{t('admin.unsuspend')}</Button>}
                  {isAdmin && <Button size="sm" variant="outline" disabled={reason.trim().length < 3} loading={resetTf.isPending} onClick={() => resetTf.mutate()}>{t('admin.twoFactorReset')}</Button>}
                </div>
              </div>
            )}
            {me && (me.role === 'ADMIN' || me.role === 'SUPER_ADMIN') && (
              <div className="space-y-3 rounded-2xl bg-soft p-4">
                <h3 className="font-bold">{t('admin.grant.title')}</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('admin.grant.plan')}>{(p) => <Select {...p} value={grantPlan} onChange={(e) => setGrantPlan(e.target.value as 'PREMIUM' | 'VIP')}>{['PREMIUM', 'VIP'].map((x) => <option key={x}>{x}</option>)}</Select>}</Field>
                  <Field label={t('admin.days')}>{(p) => <Input {...p} type="number" min={1} max={365} value={grantDays} onChange={(e) => setGrantDays(Math.min(365, Math.max(1, Number(e.target.value) || 30)))} />}</Field>
                </div>
                <Field label={t('admin.grant.reason')}>{(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={reason.trim().length < 3} onClick={() => grant.mutate()} loading={grant.isPending}>{t('admin.grant.give')}</Button>
                  {d.plan !== 'FREE' && <Button size="sm" variant="outline" disabled={reason.trim().length < 3} onClick={() => revoke.mutate()} loading={revoke.isPending}>{t('admin.grant.revoke')}</Button>}
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
