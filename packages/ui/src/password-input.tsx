'use client';
import { Eye, EyeOff } from 'lucide-react';
import { useState, type InputHTMLAttributes } from 'react';
import { cn } from './cn';

/** Champ mot de passe avec bouton « afficher / masquer » (œil) à droite. Mêmes styles que `Input` ; les libellés du bouton sont fournis par l'appelant (traduits). */
export function PasswordInput({ className, showLabel, hideLabel, ...p }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { showLabel: string; hideLabel: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        className={cn('h-12 w-full rounded-xl border border-field-line bg-field px-4 pr-12 text-fg placeholder:text-muted transition focus:border-brand focus:outline-2 focus:outline-offset-0 focus:outline-brand/40 disabled:opacity-60 aria-invalid:border-danger', className)}
        {...p} type={shown ? 'text' : 'password'} />
      <button type="button" onClick={() => setShown((v) => !v)} aria-label={shown ? hideLabel : showLabel} aria-pressed={shown} title={shown ? hideLabel : showLabel}
        className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted transition hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-brand">
        {shown ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
      </button>
    </div>
  );
}
