'use client';
import { useEffect } from 'react';
import { useUi } from '@/lib/store';

/** Déclare l'adresse de la page dans chaque langue (ex. article traduit) pour le sélecteur de langue ; effacée en quittant la page. */
export function LocaleAlternates({ paths }: { paths: Partial<Record<string, string>> }) {
  const set = useUi((s) => s.setLocaleAlternates);
  const json = JSON.stringify(paths);
  useEffect(() => {
    set(JSON.parse(json) as Partial<Record<string, string>>);
    return () => set(null);
  }, [json, set]);
  return null;
}
