'use client';

import { useScrollSpy } from '@/hooks/useScrollSpy';

/** Sommaire numéroté d'un document long : la rubrique en cours de lecture est mise en évidence. */
export function DocToc({ items }: { items: readonly { id: string; label: string }[] }) {
  const active = useScrollSpy(items.map((i) => i.id));
  return (
    <ol className="space-y-1 text-sm">
      {items.map((s, i) => {
        const on = active === s.id;
        return (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              aria-current={on ? 'location' : undefined}
              className={`flex gap-2 rounded-xl px-3 py-2 transition ${on ? 'bg-soft font-semibold text-brand-ink' : 'text-muted hover:bg-soft hover:text-brand-ink'}`}
            >
              <span className="font-semibold tabular-nums text-brand-ink">{String(i + 1).padStart(2, '0')}</span>{s.label}
            </a>
          </li>
        );
      })}
    </ol>
  );
}
