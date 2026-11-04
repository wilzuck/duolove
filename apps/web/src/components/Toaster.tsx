'use client';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@duomatch/ui';
import { useUi } from '@/lib/store';

const icons = { success: CheckCircle2, error: AlertCircle, info: Info };

export function Toaster() {
  const t = useTranslations();
  const { toasts, dismiss } = useUi();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4" role="region" aria-label={t('common.notifications')}>
      {toasts.map((x) => {
        const Icon = icons[x.kind];
        return (
          <div key={x.id} role={x.kind === 'error' ? 'alert' : 'status'}
            className={cn('pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-pop', x.kind === 'error' ? 'border-danger/40' : 'border-line')}>
            <Icon className={cn('size-5 shrink-0', x.kind === 'success' && 'text-success-ink', x.kind === 'error' && 'text-danger-ink', x.kind === 'info' && 'text-brand-ink')} aria-hidden />
            <p className="flex-1 text-sm">{x.text}</p>
            <button onClick={() => dismiss(x.id)} aria-label={t('common.close')} className="rounded-full p-1 text-muted hover:bg-soft"><X className="size-4" /></button>
          </div>
        );
      })}
    </div>
  );
}
