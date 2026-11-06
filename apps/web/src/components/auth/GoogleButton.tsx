'use client';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useSyncExternalStore } from 'react';

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

declare global {
  interface Window { google?: { accounts: { id: { initialize: (c: unknown) => void; renderButton: (el: HTMLElement, o: unknown) => void } } } }
}

const subscribeTheme = (cb: () => void) => {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', cb);
  return () => { obs.disconnect(); mq.removeEventListener('change', cb); };
};
const isDark = () => {
  const explicit = document.documentElement.dataset.theme;
  return explicit ? explicit === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
};

/** Connexion Google (Google Identity Services). Invisible tant que NEXT_PUBLIC_GOOGLE_CLIENT_ID n'est pas défini. */
export function GoogleButton({ onToken }: { onToken: (idToken: string) => void }) {
  const t = useTranslations();
  const ref = useRef<HTMLDivElement>(null);
  const dark = useSyncExternalStore(subscribeTheme, isDark, () => false);
  useEffect(() => {
    if (!CLIENT_ID || !ref.current) return;
    const el = ref.current;
    const init = () => {
      window.google?.accounts.id.initialize({ client_id: CLIENT_ID, callback: (r: { credential: string }) => onToken(r.credential) });
      window.google?.accounts.id.renderButton(el, { theme: dark ? 'filled_black' : 'outline', size: 'large', shape: 'pill', width: 320, text: 'continue_with' });
    };
    if (window.google) return init();
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) { existing.addEventListener('load', init, { once: true }); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = init;
    document.head.appendChild(s);
  }, [onToken, dark]);
  if (!CLIENT_ID) return null;
  return (
    <div className="space-y-4">
      <div ref={ref} className="flex justify-center [color-scheme:light]" aria-label={t('auth.google')} />
      <p className="flex items-center gap-3 text-xs text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">{t('auth.or')}</p>
    </div>
  );
}
