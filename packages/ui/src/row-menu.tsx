'use client';

import { MoreHorizontal } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { cn } from './cn';
import { Popover } from './popover';

/** Une action de ligne : `onSelect` (bouton) ou `href` (lien, ex. mailto:). */
export interface RowAction {
  label: string;
  icon?: ReactNode;
  onSelect?: () => void;
  href?: string;
  tone?: 'danger';
  disabled?: boolean;
}

/** Bouton « ⋯ » (icône seule, nom accessible `label`) qui ouvre un petit menu d'actions ; rien si aucune action. */
export function RowMenu({ actions, label }: { actions: readonly RowAction[]; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  if (actions.length === 0) return null;
  const item = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-soft disabled:pointer-events-none disabled:opacity-50';
  return (
    <>
      <button ref={ref} type="button" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}
        className="grid size-9 place-items-center rounded-full border border-field-line bg-field text-fg hover:bg-soft">
        <MoreHorizontal className="size-5" aria-hidden />
      </button>
      <Popover open={open} anchorRef={ref} onClose={() => setOpen(false)} align="end" className="w-56 p-1.5">
        <ul role="menu" aria-label={label}>
          {actions.map((a) => (
            <li key={a.label} role="none">
              {a.href ? (
                <a role="menuitem" href={a.href} className={cn(item, a.tone === 'danger' && 'text-danger-ink')} onClick={() => { setOpen(false); a.onSelect?.(); }}>{a.icon}{a.label}</a>
              ) : (
                <button type="button" role="menuitem" disabled={a.disabled} className={cn(item, a.tone === 'danger' && 'text-danger-ink')} onClick={() => { setOpen(false); a.onSelect?.(); }}>{a.icon}{a.label}</button>
              )}
            </li>
          ))}
        </ul>
      </Popover>
    </>
  );
}
