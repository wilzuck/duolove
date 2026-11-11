import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@duomatch/ui';

/**
 * Question repliable (FAQ, aide) : une icône « + » à droite qui pivote d'un quart de tour et devient une croix quand la réponse est ouverte.
 * Natif (`<details>`) : clavier, lecteurs d'écran et sans JavaScript ; le triangle par défaut du navigateur est masqué.
 */
export function AccordionItem({ question, children, open, className }: { question: ReactNode; children: ReactNode; open?: boolean; className?: string }) {
  return (
    <details open={open} className={cn('group rounded-2xl border border-line bg-card px-5 py-4 open:shadow-soft', className)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
        <span>{question}</span>
        <Plus className="size-5 shrink-0 text-brand-ink transition-transform duration-200 group-open:rotate-45" aria-hidden />
      </summary>
      <div className="mt-3 leading-relaxed text-muted">{children}</div>
    </details>
  );
}
