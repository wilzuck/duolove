import { useCallback, useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
const read = (key: string, fallback: boolean) => {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v === '1'; } catch { return fallback; /* Silence assumé : stockage indisponible (navigation privée), valeur par défaut. */ }
};

/** Préférence booléenne mémorisée sur cet appareil (localStorage), sans différence de rendu serveur/navigateur. */
export function useLocalPref(key: string, fallback: boolean): [boolean, (v: boolean) => void] {
  const value = useSyncExternalStore(
    (cb) => { listeners.add(cb); window.addEventListener('storage', cb); return () => { listeners.delete(cb); window.removeEventListener('storage', cb); }; },
    () => read(key, fallback),
    () => fallback,
  );
  const set = useCallback((v: boolean) => {
    try { localStorage.setItem(key, v ? '1' : '0'); } catch { /* Silence assumé : la préférence ne sera simplement pas mémorisée. */ }
    listeners.forEach((l) => l());
  }, [key]);
  return [value, set];
}
