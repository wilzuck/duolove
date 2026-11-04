import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export interface AlertProps extends Omit<HTMLAttributes<HTMLParagraphElement>, 'role'> {
  /** `danger` (erreur, annoncée tout de suite) ou `success` (confirmation, annoncée poliment). */
  tone?: 'danger' | 'success';
  /** `box` : encadré teinté ; `text` : simple texte coloré sous un champ. */
  variant?: 'box' | 'text';
}

/** Message d'erreur ou de confirmation en ligne : le rôle ARIA est dérivé du ton, jamais oublié. */
export function Alert({ tone = 'danger', variant = 'box', className, ...p }: AlertProps) {
  const color = tone === 'danger' ? 'text-danger-ink' : 'text-success-ink';
  const box = tone === 'danger' ? 'bg-danger/10' : 'bg-success/10';
  return (
    <p
      {...p}
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('text-sm', color, variant === 'box' && cn('rounded-2xl px-4 py-3', box), className)}
    />
  );
}
