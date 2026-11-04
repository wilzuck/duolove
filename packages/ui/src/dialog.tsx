'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from './cn';

/** Modale accessible basée sur <dialog> natif : piège de focus, Échap, rôle et nom accessibles. */
export function Dialog({ open, onClose, title, children, closeLabel, className }: { open: boolean; onClose: () => void; title: string; children: ReactNode; closeLabel: string; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} aria-labelledby={titleId} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}
      className={cn('m-auto w-[min(92vw,28rem)] rounded-3xl border border-line bg-card p-0 text-fg shadow-pop backdrop:bg-black/50', className)}>
      <div className="p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="font-display text-xl font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label={closeLabel} className="rounded-full p-2 text-muted hover:bg-soft"><X className="size-5" /></button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
