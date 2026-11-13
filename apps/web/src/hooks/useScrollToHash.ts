'use client';
import { useEffect } from 'react';

/** Une fois le contenu chargé, fait défiler jusqu'à l'ancre de l'adresse (#…) et la met en évidence 2 s.
 *  Nécessaire quand la page arrive avant ses données : le navigateur ne trouve pas encore l'ancre au moment de la navigation. */
export function useScrollToHash(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const go = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      const box = el.closest('section, article, [data-anchor-box]') ?? el;
      (box as HTMLElement).style.scrollMarginTop = '88px';  // sous la barre du haut collante
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      box.classList.add('ring-2', 'ring-brand', 'ring-offset-4', 'rounded-2xl');
      window.setTimeout(() => box.classList.remove('ring-2', 'ring-brand', 'ring-offset-4'), 2000);
    };
    const t = window.setTimeout(go, 50);
    window.addEventListener('hashchange', go);
    return () => { window.clearTimeout(t); window.removeEventListener('hashchange', go); };
  }, [ready]);
}
