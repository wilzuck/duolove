'use client';
import { ChevronUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import type { Card, SwipeResult } from '@/lib/types';
import { ProfileDetail } from './ProfileDetail';

/**
 * Profil complet affiché SUR la page, sous la carte (pas de fenêtre) : toutes les photos en mosaïque, l'identité, la dernière activité (Premium / VIP),
 * l'affinité, la présentation, les centres d'intérêt, le mode de vie. Les boutons Passer / Super Like / J'aime restent fixés en bas de l'écran
 * (barre collante de la page de découverte) pendant la lecture.
 */
export function InlineProfile({ card, onClose, onBlocked, onLiked }: { card: Card; onClose: () => void; onBlocked?: () => void; onLiked?: (r: SwipeResult) => void }) {
  const t = useTranslations();
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="mx-auto w-full scroll-mt-4 space-y-4 rounded-[2rem] border border-line bg-card p-4 shadow-soft">
      <button type="button" onClick={onClose} className="mx-auto flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold text-muted hover:bg-soft hover:text-brand-ink"><ChevronUp className="size-4" aria-hidden />{t('discover.hideProfile')}</button>
      <div id={titleId} className="sr-only">{card.displayName}</div>
      <ProfileDetail card={card} layout="stack" onBlocked={onBlocked} onLiked={onLiked} />
    </section>
  );
}
