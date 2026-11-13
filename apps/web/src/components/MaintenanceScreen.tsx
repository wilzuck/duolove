'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Construction } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { Button } from '@duomatch/ui';
import { api } from '@/lib/api';

export interface SiteStatus { maintenance: boolean; messageFr: string | null; messageEn: string | null; since: string | null }
export const useSiteStatus = () => useQuery({ queryKey: ['site', 'status'], queryFn: () => api<SiteStatus>('/site/status'), refetchInterval: 60_000, staleTime: 30_000, retry: false });
export const maintenanceMessage = (s: SiteStatus | undefined, locale: string) => (locale === 'en' ? s?.messageEn : s?.messageFr) || null;

/** Écran affiché aux membres pendant la maintenance. Vérifie toutes les 30 s si le site est revenu. */
export function MaintenanceScreen({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const status = useSiteStatus();
  const qc = useQueryClient();
  // Quand le site revient (cet écran disparaît), le bandeau de maintenance est mis à jour tout de suite.
  useEffect(() => () => { void qc.invalidateQueries({ queryKey: ['site', 'status'] }); }, [qc]);
  const retry = useRef(onRetry);
  useEffect(() => { retry.current = onRetry; }, [onRetry]);
  useEffect(() => { const id = window.setInterval(() => retry.current(), 30_000); return () => window.clearInterval(id); }, []);
  const msg = maintenanceMessage(status.data, locale);
  return (
    <main role="status" className="mx-auto grid min-h-[70dvh] max-w-md place-items-center px-4 py-16 text-center">
      <div className="space-y-4">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-soft text-brand-ink"><Construction className="size-8" aria-hidden /></span>
        <h1 className="text-2xl font-extrabold">{t('maintenance.title')}</h1>
        <p className="text-muted">{msg ?? t('maintenance.text')}</p>
        <p className="text-sm text-muted">{t('maintenance.auto')}</p>
        <Button variant="outline" onClick={onRetry}>{t('errorPage.retry')}</Button>
      </div>
    </main>
  );
}
