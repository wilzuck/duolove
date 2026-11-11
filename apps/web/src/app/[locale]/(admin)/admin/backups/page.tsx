'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, DatabaseBackup, ShieldAlert } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Dialog, Field, Skeleton } from '@duomatch/ui';
import { PasswordInput } from '@/components/PasswordInput';
import { Link } from '@/i18n/navigation';
import { useApiError } from '@/hooks/useApiError';
import { api, post } from '@/lib/api';
import { useUi } from '@/lib/store';

interface Run { ok: boolean; at: string; trigger: 'manual' | 'nightly'; key?: string; bytes?: number; error?: string }
interface Overview {
  configured: boolean; toolAvailable: boolean;
  status: { running: boolean; last: Run | null; lastOk: Run | null; ageHours: number | null; stale: boolean; staleAfterHours: number };
  items: { key: string; name: string; bytes: number; createdAt: string }[];
}
const size = (n: number) => (n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);

/** Sauvegardes de la base (R2) : état, sauvegarde à la demande, téléchargement protégé par le mot de passe. Les administrateurs sont prévenus par e-mail en cas d'échec. */
export default function AdminBackups() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const [target, setTarget] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const q = useQuery({ queryKey: ['admin', 'backups'], queryFn: () => api<Overview>('/admin/backups'), refetchInterval: (query) => (query.state.data?.status.running ? 3000 : 60_000) });
  const when = (iso: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(iso)) + ' UTC';
  const run = useMutation({
    mutationFn: () => post('/admin/backups/run'),
    onSuccess: () => { toast('info', t('admin.backups.started')); void qc.invalidateQueries({ queryKey: ['admin', 'backups'] }); },
    onError: (e) => toast('error', err(e)),
  });
  const download = useMutation({
    mutationFn: () => post<{ url: string }>('/admin/backups/download', { key: target, password }),
    onSuccess: (r) => { setTarget(null); setPassword(''); window.location.assign(r.url); },
    onError: (e) => toast('error', err(e)),
  });
  const d = q.data;
  const st = d?.status;
  return (
    <div className="space-y-6">
      <header><h2 className="text-lg font-bold">{t('admin.backups.title')}</h2><p className="text-sm text-muted">{t('admin.backups.subtitle')}</p></header>
      {q.isLoading && <Skeleton className="h-64" />}
      {d && st && (
        <>
          {!d.configured && <Alert variant="text">{t('admin.backups.notConfigured')} <Link href="/admin/storage" className="font-semibold underline">{t('admin.nav.storage')}</Link></Alert>}
          {d.configured && st.stale && <Alert variant="text"><ShieldAlert className="mr-1 inline size-4" aria-hidden />{st.lastOk ? t('admin.backups.stale', { hours: st.staleAfterHours }) : t('admin.backups.none')}</Alert>}
          {st.last && !st.last.ok && <Alert variant="text">{t('admin.backups.failed', { when: when(st.last.at), error: st.last.error ?? '' })}</Alert>}

          <Card className="space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid size-10 place-items-center rounded-2xl bg-soft text-brand-ink"><DatabaseBackup className="size-5" aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{st.lastOk ? t('admin.backups.lastOk', { when: when(st.lastOk.at) }) : t('admin.backups.neverOk')}</p>
                <p className="text-sm text-muted">{t('admin.backups.schedule')}</p>
              </div>
              <Badge tone={st.running ? 'brand' : st.stale ? 'neutral' : 'success'}>{t(st.running ? 'admin.backups.running' : st.stale ? 'admin.backups.late' : 'admin.backups.upToDate')}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => run.mutate()} loading={run.isPending || st.running} disabled={!d.configured || !d.toolAvailable}>{t('admin.backups.runNow')}</Button>
              {!d.toolAvailable && <p className="text-sm text-muted">{t('admin.backups.noTool')}</p>}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 font-semibold">{t('admin.backups.list')}</h3>
            {d.items.length === 0 ? <p className="text-sm text-muted">{t('admin.backups.empty')}</p> : (
              <ul className="divide-y divide-line">
                {d.items.map((b) => (
                  <li key={b.key} className="flex flex-wrap items-center gap-3 py-3">
                    <span className="min-w-0 flex-1"><span className="block font-medium">{when(b.createdAt)}</span><span className="block truncate font-mono text-xs text-muted">{b.name}</span></span>
                    <span className="text-sm text-muted">{size(b.bytes)}</span>
                    <Button size="sm" variant="outline" onClick={() => { setTarget(b.key); setPassword(''); }}><Download className="size-4" aria-hidden />{t('admin.backups.download')}</Button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-xs text-muted">{t('admin.backups.note')}</p>
          </Card>
        </>
      )}
      <Dialog open={!!target} onClose={() => setTarget(null)} title={t('admin.backups.dlTitle')} closeLabel={t('common.close')}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); download.mutate(); }}>
          <p className="text-sm">{t('admin.backups.dlWarn')}</p>
          <Field label={t('admin.backups.dlPassword')}>{(p) => <PasswordInput {...p} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}</Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setTarget(null)}>{t('common.cancel')}</Button><Button type="submit" loading={download.isPending} disabled={!password}>{t('admin.backups.dlConfirm')}</Button></div>
        </form>
      </Dialog>
    </div>
  );
}
