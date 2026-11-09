'use client';
import { useEffect, useState, type ComponentType } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@duomatch/ui';
import { useLive } from '@/hooks/useQueries';

/**
 * Icône « Crush » de la navigation, avec l'état de la recherche en cours.
 * - Recherche active : point rose fixe + anneau rose qui se vide calmement pendant le délai avant de pouvoir relancer (pas de chiffre qui défile).
 * - Quelqu'un a accepté : anneau rose plein (plus soutenu) + pastille avec le nombre : le seul moment qui demande de regarder.
 */
export function CrushNavIcon({ icon: Icon }: { icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }> }) {
  const t = useTranslations();
  const live = useLive().data;
  const [now, setNow] = useState(() => Date.now());
  const searching = !!live?.search;
  useEffect(() => {
    if (!searching) return;
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, [searching]);

  if (!live || !live.search) return <Icon className="size-5" aria-hidden />;
  const waiting = live.accepted.filter((a) => a.status === 'ACCEPTED').length;
  const total = live.rules.cooldownMinutes * 60_000;
  const left = live.nextLaunchAt ? Math.max(0, new Date(live.nextLaunchAt).getTime() - now) : 0;
  // Anneau qui SE VIDE : temps restant avant de pouvoir relancer (comme un minuteur). Vide = relance possible ; le point rose dit que la recherche reste active.
  const progress = waiting > 0 ? 1 : left > 0 ? Math.min(1, left / total) : 0;
  const R = 13, C = 2 * Math.PI * R;
  // -m-1.5 : l'anneau déborde de l'icône sans décaler le texte (même encombrement que les autres entrées).
  return (
    <span className="relative -m-1.5 inline-flex size-8 shrink-0 items-center justify-center">
      <svg viewBox="0 0 32 32" aria-hidden className="absolute inset-0 -rotate-90">
        <circle cx="16" cy="16" r={R} fill="none" strokeWidth="2.5" className="stroke-line" />
        <circle cx="16" cy="16" r={R} fill="none" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress)}
          className={cn('transition-[stroke-dashoffset] duration-1000', waiting > 0 ? 'stroke-brand-strong' : 'stroke-brand')} />
      </svg>
      <Icon className="size-4" aria-hidden />
      {waiting === 0 && <span aria-hidden className="absolute top-0.5 right-0 size-2 rounded-full bg-brand ring-2 ring-bg" />}
      {waiting > 0 && <span aria-hidden className="absolute -top-1 -right-1.5 flex min-w-4 items-center justify-center rounded-full bg-brand-strong px-1 text-[10px] font-bold text-white">{waiting}</span>}
      <span className="sr-only">{waiting > 0 ? t('live.navAccepted', { n: waiting }) : t('live.navSearching')}</span>
    </span>
  );
}
