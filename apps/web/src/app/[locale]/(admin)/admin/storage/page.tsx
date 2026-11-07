'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CloudUpload, HardDrive } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Dialog, Field, Input, Skeleton } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { ApiError, api, post, put } from '@/lib/api';
import { useUi } from '@/lib/store';

interface StorageView { source: 'env' | 'db'; driver: 'local' | 's3'; endpoint: string | null; bucket: string | null; region: string; prefix: string; accessKeyIdMasked: string | null; hasSecret: boolean; localFiles: number; encryptionKeyConfigured: boolean; envDriver: string }
interface Migrated { copied: number; errors: number; remaining: number; localTotal: number; inBucket: number }

/** Stockage des fichiers (Cloudflare R2 ou autre stockage compatible S3). Réservé au super administrateur ; la clé secrète est en écriture seule. */
export default function AdminStorage() {
  const t = useTranslations();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const view = useQuery({ queryKey: ['admin', 'storage'], queryFn: () => api<StorageView>('/admin/storage') });
  const [form, setForm] = useState<{ endpoint: string; bucket: string; region: string; prefix: string; accessKeyId: string; secretAccessKey: string } | null>(null);
  const [confirmLocal, setConfirmLocal] = useState(false);
  const [progress, setProgress] = useState<Migrated | null>(null);
  const v = view.data;
  const f = form ?? { endpoint: v?.endpoint ?? '', bucket: v?.bucket ?? '', region: v?.region ?? 'auto', prefix: v?.prefix ?? '', accessKeyId: '', secretAccessKey: '' };
  const set = (k: keyof typeof f, val: string) => setForm({ ...f, [k]: val });
  // Le serveur explique la cause précise d'un échec de test (bucket absent, clé refusée…) : on l'ajoute au message traduit.
  const explain = (e: unknown) => (e instanceof ApiError && e.code === 'STORAGE_TEST_FAILED' ? `${err(e)} ${e.message}` : err(e));
  const body = () => ({ driver: 's3', endpoint: f.endpoint, bucket: f.bucket, region: f.region || 'auto', prefix: f.prefix, accessKeyId: f.accessKeyId || undefined, secretAccessKey: f.secretAccessKey || undefined });

  const test = useMutation({ mutationFn: () => post('/admin/storage/test', body()), onSuccess: () => toast('success', t('admin.storage.testOk')), onError: (e) => toast('error', explain(e)) });
  const save = useMutation({
    mutationFn: () => put<StorageView>('/admin/storage', body()),
    onSuccess: () => { toast('success', t('admin.storage.saved')); setForm(null); void qc.invalidateQueries({ queryKey: ['admin'] }); },
    onError: (e) => toast('error', explain(e)),
  });
  const toLocal = useMutation({
    mutationFn: () => put<StorageView>('/admin/storage', { driver: 'local' }),
    onSuccess: () => { toast('success', t('admin.storage.savedLocal')); setConfirmLocal(false); setForm(null); void qc.invalidateQueries({ queryKey: ['admin'] }); },
    onError: (e) => toast('error', err(e)),
  });
  const migrate = useMutation({
    mutationFn: async () => {
      let last: Migrated | null = null;
      for (let i = 0; i < 200; i++) {  // lots d'environ 20 s côté serveur ; on s'arrête dès qu'il n'y a plus rien à copier ou plus de progrès
        last = await post<Migrated>('/admin/storage/migrate');
        setProgress(last);
        if (last.remaining === 0 || last.copied === 0) break;
      }
      return last;
    },
    onSuccess: (r) => { toast(r && r.remaining === 0 ? 'success' : 'error', r && r.remaining === 0 ? t('admin.storage.migrateDone') : t('admin.storage.migratePartial')); void qc.invalidateQueries({ queryKey: ['admin'] }); },
    onError: (e) => toast('error', err(e)),
  });

  return (
    <div className="space-y-6">
      <header><h2 className="text-lg font-bold">{t('admin.storage.title')}</h2><p className="text-sm text-muted">{t('admin.storage.subtitle')}</p></header>
      {view.isLoading && <Skeleton className="h-64" />}
      {v && (
        <>
          <Card className="space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid size-10 place-items-center rounded-2xl bg-soft text-brand-ink">{v.driver === 's3' ? <CloudUpload className="size-5" aria-hidden /> : <HardDrive className="size-5" aria-hidden />}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{t(v.driver === 's3' ? 'admin.storage.driverS3' : 'admin.storage.driverLocal')}</p>
                <p className="text-sm text-muted">{t(v.source === 'db' ? 'admin.storage.sourceDb' : 'admin.storage.sourceEnv')} · {t('admin.storage.localFiles', { count: v.localFiles })}</p>
              </div>
              <Badge tone={v.driver === 's3' ? 'success' : 'neutral'}>{v.driver === 's3' ? t('admin.storage.active') : t('admin.storage.volume')}</Badge>
            </div>
            {!v.encryptionKeyConfigured && <Alert variant="text">{t('admin.storage.noKey')}</Alert>}
          </Card>

          <Card className="space-y-4 p-5">
            <h3 className="font-semibold">{t('admin.storage.formTitle')}</h3>
            <p className="text-sm text-muted">{t('admin.storage.formHelp')}</p>
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
              <div className="sm:col-span-2"><Field label={t('admin.storage.endpoint')} hint={t('admin.storage.endpointHint')}>{(p) => <Input {...p} type="url" inputMode="url" autoComplete="off" placeholder="https://identifiant.r2.cloudflarestorage.com" value={f.endpoint} onChange={(e) => set('endpoint', e.target.value)} required />}</Field></div>
              <Field label={t('admin.storage.bucket')}>{(p) => <Input {...p} autoComplete="off" value={f.bucket} onChange={(e) => set('bucket', e.target.value)} required />}</Field>
              <Field label={t('admin.storage.region')} hint={t('admin.storage.regionHint')}>{(p) => <Input {...p} autoComplete="off" value={f.region} onChange={(e) => set('region', e.target.value)} />}</Field>
              <Field label={t('admin.storage.prefix')} hint={t('admin.storage.prefixHint')}>{(p) => <Input {...p} autoComplete="off" value={f.prefix} onChange={(e) => set('prefix', e.target.value)} />}</Field>
              <span className="hidden sm:block" />
              <Field label={t('admin.storage.accessKey')} hint={v.accessKeyIdMasked ? t('admin.storage.keepHint', { masked: v.accessKeyIdMasked }) : undefined}>{(p) => <Input {...p} autoComplete="off" value={f.accessKeyId} onChange={(e) => set('accessKeyId', e.target.value)} required={!v.accessKeyIdMasked} />}</Field>
              <Field label={t('admin.storage.secret')} hint={v.hasSecret ? t('admin.storage.secretKeep') : t('admin.storage.secretHint')}>{(p) => <Input {...p} type="password" autoComplete="new-password" value={f.secretAccessKey} onChange={(e) => set('secretAccessKey', e.target.value)} required={!v.hasSecret} />}</Field>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button type="button" variant="outline" onClick={() => test.mutate()} loading={test.isPending}>{t('admin.storage.test')}</Button>
                <Button type="submit" loading={save.isPending}>{t('admin.storage.save')}</Button>
                {v.driver === 's3' && <Button type="button" variant="ghost" onClick={() => setConfirmLocal(true)}>{t('admin.storage.backToLocal')}</Button>}
              </div>
            </form>
          </Card>

          {v.driver === 's3' && (
            <Card className="space-y-3 p-5">
              <h3 className="font-semibold">{t('admin.storage.migrateTitle')}</h3>
              <p className="text-sm text-muted">{t('admin.storage.migrateHelp')}</p>
              {progress && <p role="status" className="text-sm font-medium">{t('admin.storage.progress', { copied: progress.inBucket, total: progress.localTotal, remaining: progress.remaining, errors: progress.errors })}</p>}
              <Button onClick={() => migrate.mutate()} loading={migrate.isPending} disabled={v.localFiles === 0}>{t('admin.storage.migrate')}</Button>
            </Card>
          )}
        </>
      )}
      <Dialog open={confirmLocal} onClose={() => setConfirmLocal(false)} title={t('admin.storage.backTitle')} closeLabel={t('common.close')}>
        <div className="space-y-4">
          <p className="text-sm">{t('admin.storage.backText')}</p>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setConfirmLocal(false)}>{t('common.cancel')}</Button><Button onClick={() => toLocal.mutate()} loading={toLocal.isPending}>{t('admin.storage.backConfirm')}</Button></div>
        </div>
      </Dialog>
    </div>
  );
}
