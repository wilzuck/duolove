'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bug, CheckCircle2, Copy, RotateCcw, Search, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge, Button, Card, Dialog, Input, Select, Skeleton, Tabs, Textarea } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { api, del, post } from '@/lib/api';
import { useUi } from '@/lib/store';

type Source = 'api' | 'job' | 'web' | 'web-server';
interface Row { id: string; source: Source; kind: string; message: string; path: string | null; method: string | null; status: number | null; count: number; regressed: boolean; firstSeenAt: string; lastSeenAt: string; resolvedAt: string | null; note: string | null; release: string | null }
interface Detail extends Row { stack: string | null; userAgent: string | null; lastUserId: string | null }
interface List { items: Row[]; open: number; openBySource: Partial<Record<Source, number>> }

const SOURCES: Source[] = ['api', 'job', 'web', 'web-server'];

/** Erreurs système : une ligne par erreur distincte (compteur, première et dernière fois), détail technique et rapport à copier pour la correction. */
export default function AdminErrors() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const [status, setStatus] = useState<'open' | 'resolved' | 'all'>('open');
  const [source, setSource] = useState('');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const list = useQuery({ queryKey: ['admin', 'errors', status, source, q], queryFn: () => api<List>(`/admin/errors?status=${status}${source ? `&source=${source}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`), refetchInterval: 30_000 });
  const detail = useQuery({ queryKey: ['admin', 'errors', 'one', openId], enabled: !!openId, queryFn: () => api<Detail>(`/admin/errors/${openId}`) });
  const fmt = (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['admin', 'errors'] }); void qc.invalidateQueries({ queryKey: ['admin', 'badges'] }); };
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'resolve' | 'reopen' | 'delete' }) =>
      action === 'delete' ? del(`/admin/errors/${id}`) : post(`/admin/errors/${id}/${action}`, action === 'resolve' ? { note } : {}),
    onSuccess: (_r, v) => { toast('success', t(`admin.errors.done.${v.action}`)); refresh(); if (v.action !== 'reopen') setOpenId(null); },
    onError: (e) => toast('error', err(e)),
  });
  const d = detail.data;
  const report = d ? [
    `Erreur Crushduo (${d.source}) : ${d.kind}`, `Message : ${d.message}`, d.path ? `Endroit : ${d.method ? `${d.method} ` : ''}${d.path}` : '',
    `Occurrences : ${d.count} (première ${d.firstSeenAt}, dernière ${d.lastSeenAt})`, d.release ? `Version : ${d.release}` : '', d.userAgent ? `Navigateur : ${d.userAgent}` : '',
    d.stack ? `\nTrace :\n${d.stack}` : '',
  ].filter(Boolean).join('\n') : '';

  return (
    <div className="space-y-6">
      <header><h2 className="text-lg font-bold">{t('admin.errors.title')}</h2><p className="max-w-2xl text-sm text-muted">{t('admin.errors.subtitle')}</p></header>
      {list.data && (
        <div className="grid gap-3 sm:grid-cols-4">
          {SOURCES.map((s) => (
            <Card key={s} className="p-4"><p className="text-xs text-muted">{t(`admin.errors.source.${s}`)}</p><p className="text-2xl font-extrabold">{list.data.openBySource[s] ?? 0}</p></Card>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Tabs label={t('admin.errors.title')} value={status} onChange={setStatus} tabs={[{ key: 'open', label: t('admin.errors.open') }, { key: 'resolved', label: t('admin.errors.resolved') }, { key: 'all', label: t('admin.errors.all') }]} />
        <Select aria-label={t('admin.errors.sourceFilter')} value={source} onChange={(e) => setSource(e.target.value)} className="w-auto">
          <option value="">{t('admin.errors.allSources')}</option>
          {SOURCES.map((s) => <option key={s} value={s}>{t(`admin.errors.source.${s}`)}</option>)}
        </Select>
        <label className="relative min-w-56 flex-1"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden /><Input aria-label={t('admin.errors.search')} placeholder={t('admin.errors.search')} value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" /></label>
      </div>
      {list.isLoading && <Skeleton className="h-48" />}
      {list.data && list.data.items.length === 0 && (
        <Card className="grid place-items-center gap-2 p-10 text-center text-muted"><CheckCircle2 className="size-8 text-success-ink" aria-hidden />{t(status === 'open' ? 'admin.errors.emptyOpen' : 'admin.errors.empty')}</Card>
      )}
      <ul className="space-y-2">
        {list.data?.items.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => { setOpenId(r.id); setNote(r.note ?? ''); }} className="w-full rounded-2xl border border-line bg-card p-4 text-left hover:border-brand/40">
              <div className="flex flex-wrap items-center gap-2">
                <Bug className="size-4 text-brand-ink" aria-hidden /><span className="font-semibold">{r.kind}</span>
                <Badge tone="neutral">{t(`admin.errors.source.${r.source}`)}</Badge>
                {r.regressed && <Badge tone="danger">{t('admin.errors.regressed')}</Badge>}
                {r.resolvedAt && <Badge tone="success">{t('admin.errors.resolvedBadge')}</Badge>}
                <span className="ml-auto text-sm font-semibold tabular-nums">{t('admin.errors.count', { n: r.count })}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm">{r.message}</p>
              <p className="mt-1 text-xs text-muted">{r.method ? `${r.method} ` : ''}{r.path ?? '—'} · {t('admin.errors.lastSeen', { date: fmt(r.lastSeenAt) })}</p>
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={!!openId} onClose={() => setOpenId(null)} title={d ? d.kind : t('common.loading')} closeLabel={t('common.close')}>
        {!d ? <Skeleton className="h-40" /> : (
          <div className="space-y-4 text-sm">
            <p className="font-medium">{d.message}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted">
              <dt>{t('admin.errors.where')}</dt><dd className="break-all text-fg">{d.method ? `${d.method} ` : ''}{d.path ?? '—'}</dd>
              <dt>{t('admin.errors.sourceLabel')}</dt><dd className="text-fg">{t(`admin.errors.source.${d.source}`)}</dd>
              <dt>{t('admin.errors.occurrences')}</dt><dd className="text-fg">{d.count} · {fmt(d.firstSeenAt)} → {fmt(d.lastSeenAt)}</dd>
              {d.release && <><dt>{t('admin.errors.release')}</dt><dd className="text-fg">{d.release}</dd></>}
              {d.userAgent && <><dt>{t('admin.errors.browser')}</dt><dd className="break-all text-fg">{d.userAgent}</dd></>}
            </dl>
            {d.stack && <pre className="max-h-64 overflow-auto rounded-xl bg-soft p-3 text-xs whitespace-pre-wrap">{d.stack}</pre>}
            <p className="rounded-xl bg-soft p-3 text-xs text-muted">{t('admin.errors.howToFix')}</p>
            <Button variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(report).then(() => toast('success', t('admin.errors.copied'))); }}><Copy className="size-4" aria-hidden />{t('admin.errors.copy')}</Button>
            {!d.resolvedAt && <Textarea aria-label={t('admin.errors.note')} placeholder={t('admin.errors.note')} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16" />}
            {d.resolvedAt && d.note && <p className="text-muted">{t('admin.errors.noteLabel')} {d.note}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => act.mutate({ id: d.id, action: 'delete' })}><Trash2 className="size-4" aria-hidden />{t('admin.errors.delete')}</Button>
              {d.resolvedAt
                ? <Button variant="outline" loading={act.isPending} onClick={() => act.mutate({ id: d.id, action: 'reopen' })}><RotateCcw className="size-4" aria-hidden />{t('admin.errors.reopen')}</Button>
                : <Button loading={act.isPending} onClick={() => act.mutate({ id: d.id, action: 'resolve' })}><CheckCircle2 className="size-4" aria-hidden />{t('admin.errors.resolve')}</Button>}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
