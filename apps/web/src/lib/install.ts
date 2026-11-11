/**
 * Installation de Crushduo comme application (PWA).
 * Chrome, Edge et Android envoient « beforeinstallprompt » : on garde l'événement pour déclencher la fenêtre d'installation au clic.
 * Safari (iPhone, iPad) n'en envoie pas : l'installation se fait à la main (Partager › Sur l'écran d'accueil), la page /install l'explique.
 * L'écoute démarre au chargement du site (InstallCapture) car l'événement n'est envoyé qu'une fois, parfois avant l'affichage de la page.
 */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
export type InstallPlatform = 'ios' | 'android' | 'desktop';

import { post } from './api';

let deferred: InstallPromptEvent | null = null;
let installedNow = false;
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const ID_KEY = 'duomatch-install-id';
const SENT_KEY = 'duomatch-install-sent';
const DAY_MS = 24 * 3600 * 1000;

/**
 * Compte l'installation : un identifiant aléatoire créé sur l'appareil (aucun lien avec un compte ni donnée personnelle), envoyé au plus une fois par jour.
 * Déclenché par l'événement « appinstalled » (Chrome, Edge, Android) ou au premier lancement en plein écran (iPhone/iPad, qui n'envoient pas d'événement).
 */
async function registerInstall(): Promise<void> {
  try {
    if (Date.now() - Number(localStorage.getItem(SENT_KEY) ?? 0) < DAY_MS) return;
    let id = localStorage.getItem(ID_KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(ID_KEY, id); }
    await post('/installs', { id, platform: detectPlatform() });
    localStorage.setItem(SENT_KEY, String(Date.now()));
  } catch { /* le comptage ne doit jamais gêner l'application : on réessaiera à la prochaine ouverture */ }
}

export function startInstallCapture(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallPromptEvent; emit(); });
  window.addEventListener('appinstalled', () => { deferred = null; installedNow = true; emit(); void registerInstall(); });
  if (isInstalledNow()) void registerInstall();
}

export const subscribeInstall = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
export const canPromptNow = () => deferred !== null;

/** Vrai quand Crushduo tourne déjà en application installée (plein écran) et non dans un onglet de navigateur. */
export function isInstalledNow(): boolean {
  if (installedNow) return true;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

export function detectPlatform(): InstallPlatform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'; // iPadOS se présente comme un Mac
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

/** Ouvre la fenêtre d'installation du navigateur. « unavailable » : le navigateur ne la propose pas (déjà installée, Safari, Firefox…). */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const ev = deferred;
  if (!ev) return 'unavailable';
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  deferred = null; // l'événement ne sert qu'une fois
  emit();
  return outcome;
}
