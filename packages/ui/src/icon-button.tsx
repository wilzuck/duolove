import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

const iconButton = cva(
  'inline-flex shrink-0 items-center justify-center rounded-full transition disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
  {
    variants: {
      tone: { ghost: 'text-muted hover:bg-soft hover:text-fg', plain: 'hover:bg-soft', card: 'bg-card shadow-soft ring-1 ring-line hover:bg-soft' },
      size: { sm: 'size-8', md: 'size-10', lg: 'size-11' },
    },
    defaultVariants: { tone: 'ghost', size: 'md' },
  },
);

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'>, VariantProps<typeof iconButton> {
  /** Nom accessible obligatoire : un bouton-icône sans texte visible doit toujours être nommé. */
  label: string;
  children: ReactNode;
}

export function IconButton({ label, tone, size, className, type = 'button', children, ...p }: IconButtonProps) {
  return <button {...p} type={type} aria-label={label} className={cn(iconButton({ tone, size }), className)}>{children}</button>;
}
