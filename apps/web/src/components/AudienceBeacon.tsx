'use client';
import { useEffect } from 'react';
import { usePathname } from '@/i18n/navigation';
import { isAnalyticsPath } from '@/lib/consent';

/** Pages comptées par la mesure d'audience maison : les pages publiques (comme Google) et la connexion. Jamais l'espace membre. */
export const isAudiencePath = (p: string) => isAnalyticsPath(p) || /^\/login(\/|$)/.test(p);

let landing = true;
let last = '';

/**
 * Mesure d'audience maison, sans cookie ni stockage (backend/app/core/audience.py) : un petit appel par page publique vue.
 * Provenance (site précédent ou `utm_source`) envoyée seulement à l'arrivée. Aucun identifiant n'est créé dans le navigateur.
 */
export function AudienceBeacon() {
  const path = usePathname();
  useEffect(() => {
    const full = window.location.pathname;
    if (!isAudiencePath(path) || full === last || navigator.webdriver) return;
    last = full;
    const body: Record<string, unknown> = { path: full, landing };
    if (landing) {
      body.ref = document.referrer || null;
      body.utm = new URLSearchParams(window.location.search).get('utm_source');
      landing = false;
    }
    void fetch('/api/audience/hit', { method: 'POST', keepalive: true, credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => undefined);
  }, [path]);
  return null;
}
