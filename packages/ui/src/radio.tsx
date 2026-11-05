'use client';
import { useId } from 'react';
import { cn } from './cn';

/** Choix unique présenté en pastilles : de vrais boutons radio (flèches du clavier, lecteur d'écran), dans un `<fieldset>` nommé. */
export function RadioChips<T extends string>({ legend, options, value, onChange, className }: {
  legend: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; className?: string;
}) {
  const name = useId();
  return (
    <fieldset className={cn('space-y-1.5', className)}>
      <legend className="mb-1.5 text-sm font-medium text-fg">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="relative">
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="peer sr-only" />
            <span className="inline-flex min-h-10 cursor-pointer items-center rounded-full border border-line bg-card px-4 text-sm font-medium transition hover:bg-soft peer-checked:border-brand-strong peer-checked:bg-brand-strong peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand">{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
