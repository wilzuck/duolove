'use client';
import { useLayoutEffect } from 'react';

/** Réapplique le thème mémorisé quand la mise en page racine est remontée (changement de langue : la balise <html> est recréée
 *  sans l'attribut posé par le script initial, qui ne s'exécute qu'au premier chargement). */
export function ThemeSync() {
  useLayoutEffect(() => {
    try {
      const t = localStorage.getItem('duomatch-theme');
      if (t && document.documentElement.dataset.theme !== t) document.documentElement.dataset.theme = t;
    } catch { /* stockage indisponible : thème du système */ }
  }, []);
  return null;
}
