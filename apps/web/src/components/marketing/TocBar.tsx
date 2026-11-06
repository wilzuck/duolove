'use client';

import { useEffect, useRef } from 'react';
import { useScrollSpy } from '@/hooks/useScrollSpy';

export function TocBar({ label, items }: { label: string; items: readonly { id: string; label: string }[] }) {
  const active = useScrollSpy(items.map((i) => i.id));
  const list = useRef<HTMLUListElement>(null);
  // Garde la pastille active visible dans la barre défilante (horizontalement seulement).
  useEffect(() => {
    const ul = list.current;
    const chip = ul?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!ul || !chip) return;
    const left = chip.offsetLeft - 16;
    const right = chip.offsetLeft + chip.offsetWidth + 16;
    if (left < ul.scrollLeft) ul.scrollTo({ left, behavior: 'smooth' });
    else if (right > ul.scrollLeft + ul.clientWidth) ul.scrollTo({ left: right - ul.clientWidth, behavior: 'smooth' });
  }, [active]);
  return (
    <nav aria-label={label} className="sticky top-16 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <ul ref={list} className="relative mx-auto flex max-w-6xl snap-x md:justify-center gap-2 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] max-sm:[mask-image:linear-gradient(to_right,transparent,#000_1rem,#000_calc(100%-2rem),transparent)] [&::-webkit-scrollbar]:hidden">
        {items.map((i) => {
          const on = active === i.id;
          return (
            <li key={i.id} className="shrink-0 snap-start scroll-ml-4">
              <a
                href={`#${i.id}`}
                aria-current={on ? 'location' : undefined}
                className={`block rounded-full border px-4 py-1.5 text-sm font-semibold whitespace-nowrap transition ${on ? 'border-brand-ink bg-soft text-brand-ink' : 'border-line bg-card text-muted hover:border-brand-ink hover:text-brand-ink'}`}
              >
                {i.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
