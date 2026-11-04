'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';

/**
 * Panneau flottant ancré à un champ (calendrier, filtres…). Repris de WaMarcket : portalé dans <body> en
 * position fixe (ignore les overflow des ancêtres) et recalé pour toujours tenir dans l'écran, y compris sur mobile.
 */
export function Popover({ open, anchorRef, onClose, children, className, align = 'start' }: { open: boolean; anchorRef: RefObject<HTMLElement | null>; onClose: () => void; children: ReactNode; className?: string; align?: 'start' | 'end' }) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const place = useCallback(() => {
    const a = anchorRef.current?.getBoundingClientRect();
    if (!a) return;
    const margin = 12;
    const w = panel.current?.offsetWidth ?? 288;
    const left = Math.min(Math.max(align === 'end' ? a.right - w : a.left, margin), window.innerWidth - w - margin);
    setPos({ top: a.bottom + 8, left });
  }, [anchorRef, align]);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { const t = e.target as Node; if (!panel.current?.contains(t) && !anchorRef.current?.contains(t)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, { capture: true, passive: true });
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, { capture: true });
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, place, onClose, anchorRef]);

  if (!open) return null;
  return createPortal(
    <div ref={panel} role="dialog" className={cn('fixed z-[80] rounded-2xl border border-line bg-card p-3 text-fg shadow-pop', className)}
      style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}>
      {children}
    </div>,
    document.body,
  );
}
