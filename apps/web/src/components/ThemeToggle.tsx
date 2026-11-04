'use client';
import { Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import { IconButton } from '@duomatch/ui';

const subscribe = (cb: () => void) => {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => obs.disconnect();
};
const isDark = () => {
  const explicit = document.documentElement.dataset.theme;
  return explicit ? explicit === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
};

/** Bascule clair/sombre ; le choix est mémorisé (préférence locale, sans impact serveur). */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations();
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  const toggle = () => {
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('duomatch-theme', next); } catch { /* Silence assumé : stockage indisponible (navigation privée), le thème reste appliqué pour la session. */ }
  };
  return (
    <IconButton label={dark ? t('common.themeLight') : t('common.themeDark')} onClick={toggle} className={className}>
      {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </IconButton>
  );
}
