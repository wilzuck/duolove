import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

// Les boutons pleins utilisent --brand-strong (contraste AA avec du texte blanc) ; --brand reste pour le décor.
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
  {
    variants: {
      variant: {
        primary: 'bg-linear-to-br from-brand-strong to-brand-strong-2 text-white shadow-soft hover:brightness-110',
        secondary: 'bg-soft text-brand-ink hover:bg-brand/15',
        outline: 'border border-line bg-card text-fg hover:bg-soft',
        ghost: 'text-fg hover:bg-soft',
        danger: 'bg-danger-strong text-white hover:brightness-110',
        dark: 'bg-navy text-white hover:brightness-125',
      },
      size: { sm: 'h-9 px-4 text-sm', md: 'h-11 px-6 text-sm', lg: 'h-13 px-8 text-base', icon: 'size-11' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export function Button({ className, variant, size, loading, disabled, children, type = 'button', ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
