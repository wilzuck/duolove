'use client';
import { useEffect } from 'react';

/** Compte une visite de l'article, une seule fois par onglet et par article (sessionStorage), jamais bloquant. */
export function ViewBeacon({ slug, locale }: { slug: string; locale: string }) {
  useEffect(() => {
    const k = `blog-view:${locale}:${slug}`;
    try {
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, '1');
    } catch { /* stockage indisponible : on compte quand même */ }
    void fetch(`/api/blog/${encodeURIComponent(slug)}/view?locale=${encodeURIComponent(locale)}`, { method: 'POST', keepalive: true }).catch(() => undefined);
  }, [slug, locale]);
  return null;
}
