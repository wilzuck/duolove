'use client';
import { Cookie } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import { Button } from '@duomatch/ui';
import { Link } from '@/i18n/navigation';

const KEY = 'duomatch.cookiesNotice';
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
/** Affiché tant que le visiteur n'a pas pris connaissance du message ; masqué côté serveur (pas d'éclair pour les visiteurs déjà informés). */
const unseen = () => { try { return localStorage.getItem(KEY) !== '1'; } catch { return true; /* stockage indisponible : le message reste visible */ } };

/** Information (et non demande de consentement) : seuls des cookies et stockages indispensables sont utilisés, voir /legal/cookies. */
export function CookieNotice() {
  const t = useTranslations();
  const show = useSyncExternalStore(subscribe, unseen, () => false);
  if (!show) return null;
  const dismiss = () => { try { localStorage.setItem(KEY, '1'); } catch { /* Silence assumé : le message réapparaîtra à la prochaine visite. */ } listeners.forEach((l) => l()); };
  return (
    <section aria-label={t('cookieNotice.title')} className="fixed inset-x-3 bottom-20 z-40 mx-auto max-w-2xl rounded-2xl border border-line bg-card p-4 shadow-pop lg:bottom-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Cookie className="hidden size-6 shrink-0 text-brand sm:block" aria-hidden />
        <p className="flex-1 text-sm text-fg"><strong className="font-semibold">{t('cookieNotice.title')}</strong> — {t('cookieNotice.text')} <Link href="/legal/cookies" className="font-semibold text-brand-ink underline">{t('cookieNotice.more')}</Link></p>
        <Button size="sm" onClick={dismiss}>{t('cookieNotice.ok')}</Button>
      </div>
    </section>
  );
}
