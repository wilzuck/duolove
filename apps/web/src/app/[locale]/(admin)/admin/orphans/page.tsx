'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageOff, RefreshCw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Dialog, Skeleton } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { api, post } from '@/lib/api';
import { useUi } from '@/lib/store';

interface Orphan { key: string; kind: 'blog' | 'photo' | 'verification' | 'chat' | 'other'; size: number; modifiedAt: string; thumb: boolean; url: string | null }
interface Scan { truncated: boolean; items: Orphan[]; count: number; totalSize: number; scanned: number; referenced: number; tooRecent: number; minAgeHours: number }
interface Result { deleted: string[]; skipped: string[]; freedBytes: number }

/** Images orphelines : fichiers du stockage qu'aucune ligne de la base ne référence. Suppression revérifiée côté serveur. */
export default function AdminOrphans() {
  const t = useTranslations();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const scan = useQuery({ queryKey: ['admin', 'orphans'], queryFn: () => api<Scan>('/admin/orphans'), refetchOnWindowFocus: false });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const d = scan.data;
  const size = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} ${t('admin.orphans.mb')}` : `${Math.max(1, Math.round(n / 1024))} ${t('admin.orphans.kb')}`);
  const items = d?.items ?? [];
  const toggle = (k: string) => setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const all = items.length > 0 && items.every((i) => sel.has(i.key));

  const remove = useMutation({
    // Lots de 200 (limite serveur).
    mutationFn: async () => {
      const keys = [...sel]; const total: Result = { deleted: [], skipped: [], freedBytes: 0 };
      for (let i = 0; i < keys.length; i += 200) {
        const r = await post<Result>('/admin/orphans/delete', { keys: keys.slice(i, i + 200) });
        total.deleted.push(...r.deleted); total.skipped.push(...r.skipped); total.freedBytes += r.freedBytes;
      }
      return total;
    },
    onSuccess: (r) => { toast('success', t('admin.orphans.deleted', { deleted: r.deleted.length, freed: size(r.freedBytes), skipped: r.skipped.length })); setSel(new Set()); setConfirm(false); void qc.invalidateQueries({ queryKey: ['admin', 'orphans'] }); },
    onError: (e) => { toast('error', err(e)); setConfirm(false); },
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-bold">{t('admin.orphans.title')}</h2><p className="max-w-2xl text-sm text-muted">{t('admin.orphans.subtitle')}</p></div>
        <Button variant="outline" onClick={() => { setSel(new Set()); void scan.refetch(); }} loading={scan.isFetching}><RefreshCw className="size-4" aria-hidden />{t('admin.orphans.rescan')}</Button>
      </header>
      {scan.isLoading && <Skeleton className="h-48" />}
      {scan.isError && <Alert variant="text">{err(scan.error)}</Alert>}
      {d && (
        <>
          <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="font-semibold">{t('admin.orphans.summary', { count: d.count, size: size(d.totalSize), scanned: d.scanned })}</p>
              {d.truncated && <p className="text-sm text-muted">{t('admin.orphans.truncated')}</p>}
              {d.tooRecent > 0 && <p className="text-sm text-muted">{t('admin.orphans.tooRecent', { count: d.tooRecent })}</p>}
            </div>
            {items.length > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="size-4 accent-[var(--color-brand)]" checked={all} onChange={() => setSel(all ? new Set() : new Set(items.map((i) => i.key)))} />{t('admin.orphans.selectAll')}</label>
                <Button disabled={sel.size === 0} onClick={() => setConfirm(true)}><Trash2 className="size-4" aria-hidden />{t('admin.orphans.deleteSelected', { count: sel.size })}</Button>
              </div>
            )}
          </Card>
          {items.length === 0 ? (
            <Card className="grid place-items-center gap-2 p-10 text-center text-muted"><ImageOff className="size-8" aria-hidden />{t('admin.orphans.empty')}</Card>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((i) => (
                <li key={i.key}>
                  <Card className={`flex gap-3 p-3 ${sel.has(i.key) ? 'ring-2 ring-brand' : ''}`}>
                    <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-soft text-muted">
                      {i.url ? <img src={i.url} alt="" loading="lazy" className="size-full object-cover" /> : <ImageOff className="size-6" aria-label={t('admin.orphans.private')} />}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2"><Badge tone="neutral">{t(`admin.orphans.kind.${i.kind}`)}</Badge>{i.thumb && <span className="text-xs text-muted">{t('admin.orphans.thumb')}</span>}</div>
                      <p className="truncate text-xs text-muted" title={i.key}>{i.key}</p>
                      <p className="text-xs text-muted">{size(i.size)} · {new Date(i.modifiedAt).toLocaleDateString()}</p>
                    </div>
                    <input type="checkbox" className="mt-1 size-4 shrink-0 accent-[var(--color-brand)]" aria-label={t('admin.orphans.select', { key: i.key })} checked={sel.has(i.key)} onChange={() => toggle(i.key)} />
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <Dialog open={confirm} onClose={() => setConfirm(false)} title={t('admin.orphans.confirmTitle')} closeLabel={t('common.close')}>
        <p className="text-sm">{t('admin.orphans.confirmText', { count: sel.size })}</p>
        <div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={() => setConfirm(false)}>{t('common.cancel')}</Button><Button loading={remove.isPending} onClick={() => remove.mutate()}>{t('admin.orphans.confirm')}</Button></div>
      </Dialog>
    </div>
  );
}
