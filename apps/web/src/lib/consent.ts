'use client';
import { useSyncExternalStore } from 'react';

/** Choix du visiteur pour la mesure d'audience (Google Tag Manager) : « granted », « denied » ou absent. Stocké seulement dans ce navigateur. */
const KEY = 'duomatch.analytics';
export type Consent = 'granted' | 'denied' | 'unset';
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const stored = (): Consent => { try { const v = localStorage.getItem(KEY); return v === 'granted' || v === 'denied' ? v : 'unset'; } catch { return 'unset'; } };
/** « Gérer les cookies » : le bandeau revient, mais le choix déjà enregistré reste en place jusqu'à la nouvelle décision (pour savoir s'il faut effacer les cookies Google). */
let reopened = false;
const read = (): Consent => (reopened ? 'unset' : stored());
const notify = () => listeners.forEach((l) => l());

/** `unset` côté serveur : aucun bandeau ni script n'est rendu avant l'hydratation. */
export const useConsent = (): Consent => useSyncExternalStore(subscribe, read, () => 'unset');

/** Pages publiques où la mesure peut tourner : jamais l'espace membre (découverte, messages, profils, paiement, administration). */
export const isAnalyticsPath = (p: string) => p === '/' || /^\/(how-it-works|pricing|about|blog|contact|help|install|legal|newsletter|share|register)(\/|$)/.test(p);

const clearGoogleCookies = () => {
  for (const c of document.cookie.split(';')) {
    const name = c.split('=')[0]!.trim();
    if (name === '_ga' || name.startsWith('_ga_') || name === '_gid' || name.startsWith('_gat')) {
      for (const domain of [location.hostname, `.${location.hostname.split('.').slice(-2).join('.')}`]) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${domain}`;
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
  }
};

export function setConsent(value: 'granted' | 'denied') {
  const wasGranted = stored() === 'granted';
  reopened = false;
  try { localStorage.setItem(KEY, value); } catch { /* stockage indisponible : le choix vaut pour cette page seulement */ }
  // Refus après un accord : les cookies Google sont effacés et la page rechargée pour décharger le script.
  if (value === 'denied' && wasGranted) { clearGoogleCookies(); location.reload(); return; }
  notify();
}

/** « Gérer les cookies » : fait revenir le bandeau pour changer d'avis (accepter ou refuser la mesure d'audience). */
export function reopenConsent() {
  reopened = true;
  notify();
}
