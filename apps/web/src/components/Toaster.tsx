'use client';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { cn, IconButton } from '@duomatch/ui';
import { useUi } from '@/lib/store';

const icons = { success: CheckCircle2, error: AlertCircle, info: Info };

export function Toaster() {
  const t = useTranslations();
  const { toasts, dismiss } = useUi();
  const box = useRef<HTMLDivElement>(null);
  // Une boîte de dialogue modale (<dialog>) occupe la « couche supérieure » du navigateur : aucun z-index ne passe au-dessus, donc les messages
  // (erreur, confirmation) restaient INVISIBLES tant qu'elle était ouverte. Le conteneur est un popover : il rejoint cette couche, au-dessus du dialogue.
  useEffect(() => {
    const el = box.current;
    if (!el || typeof el.showPopover !== 'function') return;
    try { if (el.matches(':popover-open')) el.hidePopover(); if (toasts.length > 0) el.showPopover(); } catch { /* navigateur sans popover : le z-index suffit hors dialogue */ }
  }, [toasts]);
  return (
    <div ref={box} popover="manual" className="pointer-events-none fixed inset-x-0 top-3 bottom-auto z-[60] m-0 flex h-auto max-h-none w-auto flex-col items-center gap-2 overflow-visible border-0 bg-transparent p-0 px-4 not-popover-open:hidden" role="region" aria-label={t('common.notifications')}>
      {toasts.map((x) => {
        const Icon = icons[x.kind];
        return (
          <div key={x.id} role={x.kind === 'error' ? 'alert' : 'status'}
            className={cn('pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-pop', x.kind === 'error' ? 'border-danger/40' : 'border-line')}>
            <Icon className={cn('size-5 shrink-0', x.kind === 'success' && 'text-success-ink', x.kind === 'error' && 'text-danger-ink', x.kind === 'info' && 'text-brand-ink')} aria-hidden />
            <p className="flex-1 text-sm">{x.text}</p>
            <IconButton label={t('common.close')} size="sm" className="size-7" onClick={() => dismiss(x.id)}><X className="size-4" /></IconButton>
          </div>
        );
      })}
    </div>
  );
}
