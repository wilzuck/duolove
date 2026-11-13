'use client';
import { CloudOff, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { Button } from '@duomatch/ui';

/** Le serveur ne répond pas (panne, redéploiement, réseau) : message clair au lieu d'un écran de chargement sans fin.
 *  Nouvelle tentative automatique toutes les 15 secondes, et bouton pour réessayer tout de suite. */
export function ServiceUnavailable({ onRetry, retrying }: { onRetry: () => void; retrying?: boolean }) {
  const t = useTranslations();
  const retry = useRef(onRetry);
  useEffect(() => { retry.current = onRetry; }, [onRetry]);
  useEffect(() => {
    const id = window.setInterval(() => retry.current(), 15_000);  // minuteur stable : il n'est pas relancé à chaque affichage
    return () => window.clearInterval(id);
  }, []);
  return (
    <main role="alert" className="mx-auto grid min-h-[60dvh] max-w-md place-items-center px-4 py-16 text-center">
      <div className="space-y-4">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-soft text-brand-ink"><CloudOff className="size-7" aria-hidden /></span>
        <h1 className="text-2xl font-extrabold">{t('errorPage.offlineTitle')}</h1>
        <p className="text-muted">{t('errorPage.offlineText')}</p>
        <Button onClick={onRetry} loading={retrying}><RefreshCw className="size-4" aria-hidden />{t('errorPage.retry')}</Button>
      </div>
    </main>
  );
}
