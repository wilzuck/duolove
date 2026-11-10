'use client';
import { Download, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import { Button } from '@duomatch/ui';
import { Link } from '@/i18n/navigation';
import { useInstall } from '@/hooks/useInstall';

const KEY = 'duomatch-install-later';
const PAUSE_MS = 14 * 24 * 3600 * 1000; // « Plus tard » : on ne redemande pas avant deux semaines
const subs = new Set<() => void>();
const subscribe = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };
/** Vrai pendant la pause choisie. Côté serveur : vrai (masqué), pour ne pas faire clignoter la bannière à l'affichage. */
const pausedNow = () => { try { return Date.now() - Number(localStorage.getItem(KEY) ?? 0) < PAUSE_MS; } catch { return false; } };

/**
 * Proposition discrète d'installer l'application, seulement sur téléphone ou tablette et si elle n'est pas déjà installée.
 * Android/Chrome : le bouton ouvre la fenêtre d'installation ; iPhone/iPad (pas d'installation par bouton) : il mène au pas-à-pas.
 */
export function InstallBanner() {
  const t = useTranslations();
  const { canPrompt, installed, platform, install } = useInstall();
  const later = useSyncExternalStore(subscribe, pausedNow, () => true);
  if (installed || later || platform === 'desktop' || !(canPrompt || platform === 'ios')) return null;
  const dismiss = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch { /* navigation privée : la bannière reviendra à la prochaine visite */ } subs.forEach((f) => f()); };
  return (
    <aside aria-label={t('install.banner.title')} className="mx-4 mt-3 flex items-center gap-3 rounded-2xl border border-line bg-card p-3 shadow-soft lg:hidden">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-soft text-brand-ink"><Download className="size-5" aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-tight">{t('install.banner.title')}</p>
        <p className="text-xs text-muted">{t('install.banner.text')}</p>
      </div>
      {canPrompt ? (
        <Button size="sm" onClick={() => void install().then((r) => { if (r === 'accepted') dismiss(); })}>{t('install.banner.cta')}</Button>
      ) : (
        <Link href="/install"><Button size="sm" variant="secondary">{t('install.banner.how')}</Button></Link>
      )}
      <button type="button" onClick={dismiss} aria-label={t('install.banner.later')} className="rounded-full p-2 text-muted hover:bg-soft hover:text-fg"><X className="size-4" aria-hidden /></button>
    </aside>
  );
}
