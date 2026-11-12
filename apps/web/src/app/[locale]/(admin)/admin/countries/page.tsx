'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { COUNTRIES, countryFlag } from '@duomatch/types';
import { Badge, Skeleton } from '@duomatch/ui';
import { SettingCard } from '@/components/admin/SettingCard';
import { useApiError } from '@/hooks/useApiError';
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
    </div>
  );
}
