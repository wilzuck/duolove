'use client';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@duomatch/ui';
import { Link } from '@/i18n/navigation';
import { reloadOnceForChunkError } from '@/lib/chunkError';

/** Erreur dans une page : message Crushduo (au lieu de l'écran anglais par défaut), « Réessayer », et rechargement automatique après un déploiement. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations();
  const [reloading] = useState(() => reloadOnceForChunkError(error));
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="mx-auto grid min-h-[60dvh] max-w-md place-items-center px-4 py-16 text-center">
      <div className="space-y-4">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-soft text-brand-ink"><AlertTriangle className="size-7" aria-hidden /></span>
        <h1 className="text-2xl font-extrabold">{t(reloading ? 'errorPage.updating' : 'errorPage.title')}</h1>
        <p className="text-muted">{t(reloading ? 'errorPage.updatingText' : 'errorPage.text')}</p>
        {!reloading && (
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={() => reset()}><RefreshCw className="size-4" aria-hidden />{t('errorPage.retry')}</Button>
            <Button variant="outline" onClick={() => window.location.reload()}>{t('errorPage.reload')}</Button>
            <Link href="/"><Button variant="ghost">{t('errorPage.home')}</Button></Link>
          </div>
        )}
      </div>
    </main>
  );
}
