'use client';
import { useTranslations } from 'next-intl';
import { Spinner } from '@duomatch/ui';

/** Spinner centré : plein cadre pour un changement de page, `inline` pour un bloc de contenu (tableau, panneau). */
export function PageLoader({ inline }: { inline?: boolean }) {
  const t = useTranslations();
  return <div className={inline ? 'flex justify-center py-10' : 'flex min-h-[50dvh] items-center justify-center'}><Spinner size="lg" label={t('common.loading')} /></div>;
}
