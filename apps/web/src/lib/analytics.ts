'use client';
import { analyticsGranted } from './consent';

type DataLayerWindow = Window & { dataLayer?: unknown[] };

/**
 * Inscription réussie → événement `sign_up` dans Google Tag Manager (balise GA4 à relier dans GTM : voir docs/STATUS.md, « Mesure des inscriptions »).
 * Rien n'est envoyé sans l'accord du visiteur ni si GTM n'est pas chargé (refus, bloqueur, ID absent). Aucune donnée personnelle : seulement la méthode.
 * La promesse se résout quand GTM a déclenché ses balises (avant que la page de confirmation, non mesurée, ne coupe la mesure) ou après `timeoutMs` au plus.
 */
export function trackSignUp(method: 'email' | 'google', timeoutMs = 1500): Promise<void> {
  if (typeof window === 'undefined' || !analyticsGranted()) return Promise.resolve();
  const dl = (window as DataLayerWindow).dataLayer;
  if (!Array.isArray(dl)) return Promise.resolve();
  return new Promise((resolve) => {
    let finished = false;
    const finish = () => { if (!finished) { finished = true; resolve(); } };
    const timer = setTimeout(finish, timeoutMs);
    try {
      dl.push({ event: 'sign_up', method, eventCallback: () => { clearTimeout(timer); finish(); }, eventTimeout: timeoutMs });
    } catch {
      clearTimeout(timer);
      finish();
    }
  });
}
