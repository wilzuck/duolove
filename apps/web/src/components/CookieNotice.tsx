'use client';
import { Cookie } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@duomatch/ui';
import { Link, usePathname } from '@/i18n/navigation';
import { isAnalyticsPath, setConsent, useConsent } from '@/lib/consent';

/**
 * Demande d'accord pour la mesure d'audience (Google Tag Manager), sur les pages publiques seulement. « Refuser » est aussi simple que « Accepter » :
 * sans accord, rien n'est chargé et rien n'est envoyé à Google. Les cookies et stockages indispensables ne demandent aucun accord (voir /legal/cookies).
 */
export function CookieNotice() {
  const t = useTranslations();
  const path = usePathname();
  const consent = useConsent();
  if (consent !== 'unset' || !isAnalyticsPath(path)) return null;
  return (
    <section aria-label={t('cookieNotice.title')} className="fixed inset-x-3 bottom-20 z-40 mx-auto max-w-2xl rounded-2xl border border-line bg-card p-4 shadow-pop lg:bottom-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Cookie className="hidden size-6 shrink-0 text-brand sm:block" aria-hidden />
        <p className="flex-1 text-sm text-fg"><strong className="font-semibold">{t('cookieNotice.title')}</strong> — {t('cookieNotice.text')} <Link href="/legal/cookies" className="font-semibold text-brand-ink underline">{t('cookieNotice.more')}</Link></p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setConsent('denied')}>{t('cookieNotice.refuse')}</Button>
          <Button size="sm" onClick={() => setConsent('granted')}>{t('cookieNotice.accept')}</Button>
        </div>
      </div>
    </section>
  );
}
