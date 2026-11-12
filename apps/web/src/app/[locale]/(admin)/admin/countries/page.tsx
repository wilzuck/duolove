'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Globe2, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { COUNTRIES, countryFlag } from '@duomatch/types';
import { Badge, Card, Skeleton, Textarea } from '@duomatch/ui';
import { SettingCard } from '@/components/admin/SettingCard';
import { useApiError } from '@/hooks/useApiError';
import { formatDate } from '@/lib/format';
import { api, put } from '@/lib/api';
import { useUi } from '@/lib/store';

/** Pays de lancement : seules les inscriptions depuis ces pays sont acceptées ; les membres déjà inscrits ne sont jamais bloqués. */
export default function AdminCountries() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const view = useQuery({ queryKey: ['admin', 'countries'], queryFn: () => api<{ countries: string[] }>('/admin/launch-countries') });
  const [draft, setDraft] = useState<string[]>([]);
  const name = (c: (typeof COUNTRIES)[number]) => (locale === 'en' ? c.en : c.fr);
  const save = useMutation({
    mutationFn: () => put('/admin/launch-countries', { countries: draft }),
    onSuccess: () => { toast('success', t('admin.countries.saved')); void qc.invalidateQueries({ queryKey: ['admin', 'countries'] }); void qc.invalidateQueries({ queryKey: ['launch-countries'] }); },
    onError: (e) => toast('error', err(e)),
  });
  const cityView = useQuery({ queryKey: ['admin', 'cities'], queryFn: () => api<{ cities: string[] }>('/admin/launch-cities') });
  const wait = useQuery({ queryKey: ['admin', 'waitlist'], queryFn: () => api<{ total: number; cities: { country: string; city: string; count: number }[]; items: { id: string; email: string; country: string; city: string; createdAt: string }[] }>('/admin/waitlist') });
  const [cityDraft, setCityDraft] = useState('');
  const saveCities = useMutation({
    mutationFn: () => put('/admin/launch-cities', { cities: cityDraft.split('\n').map((c) => c.trim()).filter(Boolean) }),
    onSuccess: () => { toast('success', t('admin.countries.saved')); void qc.invalidateQueries({ queryKey: ['admin', 'cities'] }); void qc.invalidateQueries({ queryKey: ['launch-countries'] }); },
    onError: (e) => toast('error', err(e)),
  });
  const cities = cityView.data?.cities ?? [];
  const open = view.data?.countries ?? [];
  const toggle = (code: string) => setDraft((d) => (d.includes(code) ? d.filter((c) => c !== code) : [...d, code]));
  return (
    <div className="space-y-6">
      <header><h2 className="text-lg font-bold">{t('admin.countries.title')}</h2><p className="text-sm text-muted">{t('admin.countries.subtitle')}</p></header>
      {view.isLoading && <Skeleton className="h-40" />}
      {view.data && (
        <SettingCard
          title={t('admin.countries.open')} help={t('admin.countries.help')} icon={Globe2} badge={<Badge tone="success">{t('admin.countries.count', { n: open.length })}</Badge>}
          onOpen={() => setDraft(open)} onSave={() => save.mutateAsync()} saving={save.isPending} canSave={draft.length > 0}
          view={(
            <ul className="flex flex-wrap gap-2">
              {COUNTRIES.filter((c) => open.includes(c.code)).map((c) => <li key={c.code} className="rounded-2xl bg-soft px-4 py-2 font-semibold">{countryFlag(c.code)} {name(c)}</li>)}
            </ul>
          )}
          editor={(
            <fieldset className="space-y-3">
              <legend className="sr-only">{t('admin.countries.open')}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {COUNTRIES.map((c) => (
                  <label key={c.code} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-line px-4 py-3 hover:bg-soft">
                    <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={draft.includes(c.code)} onChange={() => toggle(c.code)} />
                    <span className="font-medium">{countryFlag(c.code)} {name(c)}</span>
                  </label>
                ))}
              </div>
              {draft.length === 0 && <p className="text-sm text-danger-ink" role="alert">{t('admin.countries.atLeastOne')}</p>}
            </fieldset>
          )}
        />
      )}
      {cityView.data && (
        <SettingCard
          title={t('admin.countries.citiesTitle')} help={t('admin.countries.citiesHelp')} icon={Building2} badge={<Badge tone={cities.length ? 'success' : 'neutral'}>{t('admin.countries.citiesCount', { n: cities.length })}</Badge>}
          onOpen={() => setCityDraft(cities.join('\n'))} onSave={() => saveCities.mutateAsync()} saving={saveCities.isPending} canSave
          view={cities.length ? <ul className="flex flex-wrap gap-2">{cities.map((c) => <li key={c} className="rounded-2xl bg-soft px-4 py-2 font-semibold">{c}</li>)}</ul> : <p className="text-sm text-muted">{t('admin.countries.citiesAll')}</p>}
          editor={<Textarea rows={8} aria-label={t('admin.countries.citiesTitle')} placeholder={t('admin.countries.citiesEditor')} value={cityDraft} onChange={(e) => setCityDraft(e.target.value)} />}
        />
      )}
      <Card className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div><h3 className="flex items-center gap-2 font-bold"><Users className="size-4 text-brand" aria-hidden />{t('admin.countries.waitlistTitle')}</h3><p className="mt-1 text-sm text-muted">{t('admin.countries.waitlistHelp')}</p></div>
          <Badge tone="brand">{t('admin.countries.waitlistTotal', { n: wait.data?.total ?? 0 })}</Badge>
        </div>
        {wait.isLoading && <Skeleton className="h-24" />}
        {wait.data && wait.data.total === 0 && <p className="text-sm text-muted">{t('admin.countries.waitlistEmpty')}</p>}
        {wait.data && wait.data.cities.length > 0 && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {wait.data.cities.slice(0, 12).map((c) => <li key={`${c.country}-${c.city}`} className="flex items-center justify-between rounded-2xl bg-soft px-4 py-2.5 text-sm"><span className="font-semibold">{countryFlag(c.country)} {c.city}</span><span className="font-mono text-muted">{c.count}</span></li>)}
          </ul>
        )}
        {wait.data && wait.data.items.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold text-brand-ink">{t('admin.countries.colEmail')}</summary>
            <ul className="mt-2 max-h-64 space-y-1 overflow-auto">
              {wait.data.items.slice(0, 200).map((i) => <li key={i.id} className="flex flex-wrap justify-between gap-2 border-b border-line py-1.5"><span>{i.email}</span><span className="text-muted">{i.city} · {formatDate(i.createdAt, locale)}</span></li>)}
            </ul>
          </details>
        )}
      </Card>
    </div>
  );
}
