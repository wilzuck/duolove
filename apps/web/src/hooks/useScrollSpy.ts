'use client';

import { useEffect, useState } from 'react';

/** Renvoie l'id de la section actuellement lue : la dernière dont le haut a passé `offset` px. */
export function useScrollSpy(ids: readonly string[], offset = 140): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join('|');
  useEffect(() => {
    const list = key ? key.split('|') : [];
    let frame = 0;
    const compute = () => {
      frame = 0;
      let current: string | null = null;
      for (const id of list) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= offset) current = id;
      }
      // En bas de page, la dernière section doit pouvoir être active.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4 && list.length) {
        const last = document.getElementById(list[list.length - 1]!);
        if (last && last.getBoundingClientRect().top < window.innerHeight) current = list[list.length - 1]!;
      }
      setActive(current);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(compute); };
    compute();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [key, offset]);
  return active;
}
