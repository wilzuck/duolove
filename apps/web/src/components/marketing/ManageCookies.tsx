'use client';
import { useTranslations } from 'next-intl';
import { reopenConsent } from '@/lib/consent';

/** « Gérer les cookies » : rouvre le bandeau pour changer d'avis (accepter ou refuser la mesure d'audience). */
export function ManageCookies() {
  const t = useTranslations();
  return <button type="button" onClick={reopenConsent} className="underline-offset-4 hover:text-brand-ink hover:underline">{t('cookieNotice.manage')}</button>;
}
