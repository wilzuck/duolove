import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from './cn';

const control = 'w-full rounded-xl border border-field-line bg-field px-4 text-fg placeholder:text-muted transition hover:border-field-line-hover focus:border-brand focus:outline-2 focus:outline-offset-0 focus:outline-brand/60 disabled:opacity-60 aria-invalid:border-danger';

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, 'h-12', className)} {...p} />;
}
/** Flèche de liste déroulante (gris moyen : lisible en thème clair et sombre), dessinée en fond car `appearance-none` retire celle du navigateur. */
const CHEVRON = 'bg-[url(data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%238a8f98%27%20stroke-width=%272.5%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27m6%209%206%206%206-6%27/%3E%3C/svg%3E)] bg-[length:1.1rem] bg-[position:right_0.9rem_center]';
export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(control, 'h-12 cursor-pointer appearance-none bg-no-repeat pr-10', CHEVRON, className)} {...p}>{children}</select>;
}

/** Étiquette + contrôle + aide/erreur, correctement reliés (aria-describedby, aria-invalid). */
export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode }) {
  const id = useId();
  const descId = error || hint ? `${id}-d` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-fg">{label}</label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': descId })}
      {(error || hint) && <p id={descId} className={cn('text-sm', error ? 'text-danger-ink' : 'text-muted')} role={error ? 'alert' : undefined}>{error ?? hint}</p>}
    </div>
  );
}
