'use client';
import { useMutation } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, Field, Input } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { post } from '@/lib/api';

/** Minuscules sans accents, tirets ni apostrophes : « Lomé » et « lome » sont la même ville (même repli que le serveur). */
export const foldCity = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[-']/g, ' ').trim();

/**
 * Affiché quand la ville saisie n'est pas encore ouverte : on propose la liste d'attente (l'inscription est refusée par le serveur de toute façon).
 * Une seule adresse, aucune création de compte ; la réponse du serveur est la même que l'adresse soit déjà inscrite ou non.
 */
export function WaitlistPanel({ openCities, city, country, email }: { openCities: string[]; city: string; country: string; email: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const err = useApiError();
  const [mail, setMail] = useState(email);
  const [error, setError] = useState<string | null>(null);
  const join = useMutation({ mutationFn: () => post('/waitlist', { email: mail.trim(), country, city: city.trim() }), onError: (e) => setError(err(e)) });
  const send = () => { setError(null); join.mutate(); };
  const list = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(openCities.slice(0, 3));
  return (
    <div role="status" className="space-y-3 rounded-2xl border border-brand/30 bg-soft p-4">
      <p className="flex items-start gap-2 text-sm font-medium text-brand-ink"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{t('auth.cityClosed', { cities: list, city: city.trim() })}</p>
      {join.isSuccess ? (
        <p className="text-sm font-semibold text-success-ink">{t('auth.waitlistDone')}</p>
      ) : (
        // Pas de <form> : ce bloc est affiché DANS le formulaire d'inscription (deux formulaires imbriqués soumettraient le mauvais).
        <div className="flex items-end gap-2">
          <div className="flex-1"><Field label={t('auth.email')} error={error ?? undefined}>{(p) => <Input {...p} type="email" autoComplete="email" value={mail} onChange={(e) => setMail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } }} />}</Field></div>
          <Button type="button" variant="secondary" loading={join.isPending} disabled={!/^\S+@\S+\.\S+$/.test(mail.trim())} onClick={send}>{t('auth.waitlistJoin')}</Button>
        </div>
      )}
    </div>
  );
}
