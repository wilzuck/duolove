import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-3xl border border-line bg-card shadow-soft', className)} {...p} />;
}

const badge = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', {
  variants: { tone: { brand: 'bg-soft text-brand-ink', success: 'bg-success/15 text-success-ink', danger: 'bg-danger/10 text-danger-ink', neutral: 'bg-line text-fg', gold: 'bg-gold/20 text-gold-ink' } },
  defaultVariants: { tone: 'brand' },
});
export function Badge({ className, tone, ...p }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...p} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-2xl bg-line', className)} />;
}

export function Avatar({ src, name, size = 48, className }: { src?: string | null; name: string; size?: number; className?: string }) {
  const style = { width: size, height: size };
  return src ? (
    <img src={src} alt="" style={style} className={cn('shrink-0 rounded-full bg-soft object-cover', className)} />
  ) : (
    <span style={{ ...style, fontSize: size / 2.4 }} aria-hidden className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-linear-to-br from-brand-2 to-brand-strong font-bold text-white', className)}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={cn('relative h-7 w-12 shrink-0 rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50', checked ? 'bg-brand-strong' : 'bg-muted/50')}>
      <span className={cn('absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
    </button>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-soft text-brand">{icon}</div>
      <h2 className="font-display text-lg font-bold">{title}</h2>
      {children && <div className="max-w-sm text-muted">{children}</div>}
    </div>
  );
}
