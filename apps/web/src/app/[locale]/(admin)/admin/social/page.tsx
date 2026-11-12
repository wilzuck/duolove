'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { Badge, Field, Input, Skeleton } from '@duomatch/ui';
import { SettingCard, Tile } from '@/components/admin/SettingCard';
import { useApiError } from '@/hooks/useApiError';
import { ApiError, api, put } from '@/lib/api';
import { useUi } from '@/lib/store';

type Key = 'facebook' | 'instagram' | 'tiktok' | 'whatsapp' | 'youtube' | 'x';
type Cfg = Record<Key, { enabled: boolean; urls: { fr: string; en: string } }>;
const KEYS: Key[] = ['facebook', 'instagram', 'tiktok', 'whatsapp', 'youtube', 'x'];
const PLACEHOLDER: Record<Key, string> = { facebook: 'https://www.facebook.com/crushduo', instagram: 'https://www.instagram.com/crushduo', tiktok: 'https://www.tiktok.com/@crushduo', whatsapp: 'https://whatsapp.com/channel/…', youtube: 'https://www.youtube.com/@crushduo', x: 'https://x.com/crushduo' };

type Net = Cfg[Key];

/** Un réseau : lecture seule (affiché ou masqué, adresses), « Modifier » ouvre l'édition de ce réseau seul ; le serveur reçoit toute la configuration. */
function NetworkCard({ k, all }: { k: Key; all: Cfg }) {
  const t = useTranslations();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const [d, setD] = useState<Net>(all[k]);
  const c = all[k];
  const save = useMutation({
    mutationFn: () => put<Cfg>('/admin/social', { ...all, [k]: d }),
    onSuccess: () => { toast('success', t('admin.social.saved')); void qc.invalidateQueries({ queryKey: ['admin', 'social'] }); void qc.invalidateQueries({ queryKey: ['social'] }); },
    onError: (e) => { if (!(e instanceof ApiError && (e.details as { network?: Key } | undefined)?.network)) toast('error', err(e)); },
  });
  // Le serveur désigne le champ fautif (réseau + langue) : l'erreur s'affiche sous ce champ.
  const bad = save.error instanceof ApiError ? (save.error.details as { network?: Key; locale?: 'fr' | 'en'; domain?: string } | undefined) : undefined;
  const fieldError = (lc: 'fr' | 'en') => (bad?.network === k && bad.locale === lc ? t('admin.social.badUrl', { domain: bad.domain ?? '' }) : undefined);
  const shown = c.enabled && (c.urls.fr || c.urls.en);
  return (
    <SettingCard
      title={t(`admin.social.${k}`)} icon={Share2} badge={<Badge tone={shown ? 'success' : 'neutral'}>{t(shown ? 'admin.social.shown' : 'admin.social.hidden')}</Badge>}
      onOpen={() => { setD(all[k]); save.reset(); }} onSave={() => save.mutateAsync()} saving={save.isPending} wide
      view={(
        <div className="flex flex-wrap gap-3">
          <Tile label={t('admin.social.urlFr')} value={<span className="text-base font-semibold break-all">{c.urls.fr || '—'}</span>} className="min-w-56 flex-1 rounded-2xl bg-soft px-4 py-3" />
          <Tile label={t('admin.social.urlEn')} value={<span className="text-base font-semibold break-all">{c.urls.en || (c.urls.fr ? t('admin.social.sameAsFr') : '—')}</span>} className="min-w-56 flex-1 rounded-2xl bg-soft px-4 py-3" />
        </div>
      )}
      editor={(
        <div className="space-y-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={d.enabled} onChange={(e) => setD({ ...d, enabled: e.target.checked })} />{t('admin.social.show')}
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('admin.social.urlFr')} error={fieldError('fr')}>{(p) => <Input {...p} type="url" inputMode="url" autoComplete="off" placeholder={PLACEHOLDER[k]} value={d.urls.fr} onChange={(e) => setD({ ...d, urls: { ...d.urls, fr: e.target.value } })} />}</Field>
            <Field label={t('admin.social.urlEn')} hint={t('admin.social.urlEnHint')} error={fieldError('en')}>{(p) => <Input {...p} type="url" inputMode="url" autoComplete="off" placeholder={PLACEHOLDER[k]} value={d.urls.en} onChange={(e) => setD({ ...d, urls: { ...d.urls, en: e.target.value } })} />}</Field>
          </div>
          <p className="text-sm text-muted">{t('admin.social.help')}</p>
        </div>
      )}
    />
  );
}

/** Réseaux sociaux du pied de page : affichage et adresse (français / anglais) de chaque réseau. Une langue sans adresse reprend celle de l'autre. */
export default function AdminSocial() {
  const t = useTranslations();
  const view = useQuery({ queryKey: ['admin', 'social'], queryFn: () => api<Cfg>('/admin/social') });
  return (
    <div className="space-y-6">
      <header><h2 className="text-lg font-bold">{t('admin.social.title')}</h2><p className="text-sm text-muted">{t('admin.social.subtitle')}</p></header>
      {view.isLoading && <Skeleton className="h-64" />}
      {view.data && <div className="space-y-4">{KEYS.map((k) => <NetworkCard key={k} k={k} all={view.data} />)}</div>}
    </div>
  );
}
