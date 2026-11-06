import { useId, type InputHTMLAttributes, type Ref, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

const control = 'w-full rounded-2xl border border-field-line bg-field px-4 text-fg placeholder:text-muted transition focus:border-brand focus:outline-2 focus:outline-offset-0 focus:outline-brand/40 disabled:opacity-60 aria-invalid:border-danger';

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, 'h-12', className)} {...p} />;
}
export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea className={cn(control, 'min-h-28 py-3', className)} {...p} />;
}
export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(control, 'h-12 appearance-none bg-[length:1rem] pr-10', className)} {...p}>{children}</select>;
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
