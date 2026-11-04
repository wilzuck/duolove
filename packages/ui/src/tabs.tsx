'use client';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from './cn';

export interface TabItem<K extends string> { key: K; label: ReactNode }

/** Onglets accessibles (rôle tablist, tabindex itinérant, flèches gauche/droite). Le panneau `role="tabpanel"` reste dans la page. */
export function Tabs<K extends string>({ tabs, value, onChange, label, className }: {
  tabs: readonly TabItem<K>[]; value: K; onChange: (k: K) => void; label: string; className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (e: KeyboardEvent, i: number) => {
    const next = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next]!.key);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={cn('flex flex-wrap gap-2', className)}>
      {tabs.map((tab, i) => {
        const selected = tab.key === value;
        return (
          <button
            key={tab.key} ref={(el) => { refs.current[i] = el; }} type="button" role="tab" aria-selected={selected} tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.key)} onKeyDown={(e) => move(e, i)}
            className={cn('rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand', selected ? 'bg-brand-strong text-white' : 'bg-soft text-brand-ink hover:bg-brand/15')}
          >{tab.label}</button>
        );
      })}
    </div>
  );
}
