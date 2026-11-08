'use client';
import { Check } from 'lucide-react';
import { useId, type ReactNode } from 'react';
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
            <span className="inline-flex min-h-10 cursor-pointer items-center rounded-full border border-line bg-card px-4 text-sm font-medium transition hover:bg-soft peer-checked:border-brand-strong peer-checked:bg-soft peer-checked:font-semibold peer-checked:text-brand-ink peer-checked:[&>.chip-check]:inline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand"><Check className="chip-check mr-1.5 hidden size-4" aria-hidden />{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Choix unique présenté en cartes (icône, titre, aide) : de vrais boutons radio dans un `<fieldset>` nommé. La carte choisie prend la couleur de la marque (bordure, fond, icône pleine, coche). */
export function ChoiceCards<T extends string>({ legend, options, value, onChange, columns = 2, className }: {
  legend: string; options: { value: T; label: string; hint?: string; icon?: ReactNode }[]; value: T; onChange: (v: T) => void; columns?: 1 | 2; className?: string;
}) {
  const name = useId();
  return (
    <fieldset className={cn('space-y-2', className)}>
      <legend className="mb-2 text-sm font-medium text-fg">{legend}</legend>
      <div className={cn('grid gap-2.5', columns === 2 && 'sm:grid-cols-2')}>
        {options.map((o) => (
          <label key={o.value} className="relative block">
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="peer sr-only" />
            <span className="flex h-full cursor-pointer items-start gap-3 rounded-2xl border border-line bg-card p-4 pr-10 transition hover:border-brand/50 peer-checked:border-brand-strong peer-checked:bg-soft peer-checked:[&_.cc-icon]:bg-brand-strong peer-checked:[&_.cc-icon]:text-white peer-checked:[&_.cc-check]:flex peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand">
              {o.icon && <span aria-hidden className="cc-icon flex size-10 shrink-0 items-center justify-center rounded-xl bg-soft text-brand-ink transition [&_svg]:size-5">{o.icon}</span>}
              <span className="min-w-0">
                <span className="block font-semibold">{o.label}</span>
                {o.hint && <span className="mt-0.5 block text-sm text-muted">{o.hint}</span>}
              </span>
              <span aria-hidden className="cc-check absolute top-3 right-3 hidden size-5 items-center justify-center rounded-full bg-brand-strong text-white"><Check className="size-3.5" /></span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
