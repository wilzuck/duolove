'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PauseCircle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { del } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useUi } from '@/lib/store';

/** Rappel discret, toujours accompagné d'un geste pour reprendre : on n'est jamais retenu en pause. */
export function PauseBanner({ endsAt }: { endsAt?: string | null }) {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const resume = useMutation({
    mutationFn: () => del('/engagement/me/pause'),
    onSuccess: () => { toast('success', t('rhythm.resumed')); void qc.invalidateQueries(); },
    onError: (e) => toast('error', err(e)),
  });
  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-3 bg-soft px-4 py-2.5 text-sm">
      <PauseCircle className="size-4 text-brand-ink" aria-hidden />
      <span><strong>{t('rhythm.bannerTitle')}</strong> · {t('rhythm.bannerText', { date: endsAt ? formatDate(endsAt, locale) : '' })}</span>
      <Button size="sm" onClick={() => resume.mutate()} loading={resume.isPending}>{t('rhythm.resume')}</Button>
    </div>
  );
}
