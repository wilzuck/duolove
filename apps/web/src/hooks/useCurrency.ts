'use client';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';
import { api } from '@/lib/api';
import { CURRENCY_STORAGE_KEY, pickCurrency, type FxRates } from '@/lib/currency';

/** Choix du visiteur, partagé entre tous les prix de la page (et les onglets, via l'événement « storage »). Stockage local : simple confort. */
const listeners = new Set<() => void>();
let memory: string | null = null; // repli quand le stockage local est bloqué (navigation privée)
const read = (): string | null => { try { return localStorage.getItem(CURRENCY_STORAGE_KEY) ?? memory; } catch { return memory; } };
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => { if (e.key === CURRENCY_STORAGE_KEY) cb(); };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(cb); window.removeEventListener('storage', onStorage); };
};

export const useFxRates = () => useQuery({ queryKey: ['fx'], queryFn: () => api<FxRates>('/fx'), staleTime: 60 * 60_000, gcTime: 2 * 60 * 60_000, retry: false });

/** Devise d'affichage des prix : choix enregistré, sinon devise du pays du visiteur, sinon FCFA. */
export function useDisplayCurrency() {
  const fx = useFxRates();
  const chosen = useSyncExternalStore(subscribe, read, () => null);
  const currency = pickCurrency(fx.data, chosen);
  const setCurrency = useCallback((code: string) => {
    memory = code;
    try { localStorage.setItem(CURRENCY_STORAGE_KEY, code); } catch { /* navigation privée : le choix vaut jusqu'au rechargement */ }
    listeners.forEach((l) => l());
  }, []);
  return { currency, fx: fx.data, setCurrency };
}
