'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Field, Input, Skeleton } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { api, put } from '@/lib/api';
import { useUi } from '@/lib/store';

type Key = 'facebook' | 'instagram' | 'tiktok' | 'whatsapp' | 'youtube' | 'x';
type Cfg = Record<Key, { enabled: boolean; urls: { fr: string; en: string } }>;
const KEYS: Key[] = ['facebook', 'instagram', 'tiktok', 'whatsapp', 'youtube', 'x'];
const PLACEHOLDER: Record<Key, string> = { facebook: 'https://www.facebook.com/crushduo', instagram: 'https://www.instagram.com/crushduo', tiktok: 'https://www.tiktok.com/@crushduo', whatsapp: 'https://whatsapp.com/channel/…', youtube: 'https://www.youtube.com/@crushduo', x: 'https://x.com/crushduo' };

/** Réseaux sociaux du pied de page : affichage et adresse (français / anglais) de chaque réseau. Une langue sans adresse reprend celle de l'autre. */
export default function AdminSocial() {
  const t = useTranslations();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const view = useQuery({ queryKey: ['admin', 'social'], queryFn: () => api<Cfg>('/admin/social') });
  const [draft, setDraft] = useState<Cfg | null>(null);
  const cfg = draft ?? view.data;
  const patch = (k: Key, v: Partial<Cfg[Key]>) => cfg && setDraft({ ...cfg, [k]: { ...cfg[k], ...v } });
  const save = useMutation({
    mutationFn: () => put<Cfg>('/admin/social', cfg),
    onSuccess: () => { toast('success', t('admin.social.saved')); setDraft(null); void qc.invalidateQueries({ queryKey: ['admin', 'social'] }); void qc.invalidateQueries({ queryKey: ['social'] }); },
    onError: (e) => toast('error', err(e)),
  });
  const failed = save.isError ? err(save.error) : null;

  return (
    <div className="space-y-6">
      <header><h2 className="text-lg font-bold">{t('admin.social.title')}</h2><p className="text-sm text-muted">{t('admin.social.subtitle')}</p></header>
      {view.isLoading && <Skeleton className="h-64" />}
      {cfg && (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          {KEYS.map((k) => {
            const c = cfg[k];
            const shown = c.enabled && (c.urls.fr || c.urls.en);
            return (
              <Card key={k} className="space-y-4 p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="min-w-0 flex-1 font-semibold">{t(`admin.social.${k}`)}</h3>
                  <Badge tone={shown ? 'success' : 'neutral'}>{t(shown ? 'admin.social.shown' : 'admin.social.hidden')}</Badge>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={c.enabled} onChange={(e) => patch(k, { enabled: e.target.checked })} />
                    {t('admin.social.show')}
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t('admin.social.urlFr')}>{(p) => <Input {...p} type="url" inputMode="url" autoComplete="off" placeholder={PLACEHOLDER[k]} value={c.urls.fr} onChange={(e) => patch(k, { urls: { ...c.urls, fr: e.target.value } })} />}</Field>
                  <Field label={t('admin.social.urlEn')} hint={t('admin.social.urlEnHint')}>{(p) => <Input {...p} type="url" inputMode="url" autoComplete="off" placeholder={PLACEHOLDER[k]} value={c.urls.en} onChange={(e) => patch(k, { urls: { ...c.urls, en: e.target.value } })} />}</Field>
                </div>
              </Card>
            );
          })}
          {failed && <Alert variant="text">{failed}</Alert>}
          <div className="flex items-center gap-3">
            <Button type="submit" loading={save.isPending} disabled={!draft}>{t('admin.social.save')}</Button>
            <p className="text-sm text-muted">{t('admin.social.help')}</p>
          </div>
        </form>
      )}
    </div>
  );
}
