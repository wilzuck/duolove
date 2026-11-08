'use client';
import { motion, useDragControls } from 'framer-motion';
import { Heart, MapPin, Sparkles, Star, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { Badge } from '@duomatch/ui';
import type { Card, SwipeResult } from '@/lib/types';
import { ProfileDetail } from './ProfileDetail';
import { countryName } from './ProfileCard';
import { VerifiedBadge } from './VerifiedBadge';

type Dir = 'left' | 'right' | 'up';

/**
 * Feuille de profil : un grand panneau qui monte du bas, défilable, pour « apprécier la personne » avant de décider.
 * Galerie de photos, identité, compatibilité, présentation, réponses, centres d'intérêt, mode de vie ; les boutons
 * Passer / Super Like / J'aime restent toujours visibles. Fermeture : croix, Échap, clic à l'extérieur ou glisser la poignée vers le bas.
 */
export function ProfileSheet({ card, open, onClose, onDecide, onBlocked, onLiked }: {
  card: Card | null; open: boolean; onClose: () => void; onDecide: (d: Dir) => void; onBlocked?: () => void; onLiked?: (r: SwipeResult) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const ref = useRef<HTMLDialogElement>(null);
  const controls = useDragControls();
  const titleId = useId();
  const scroller = useRef<HTMLDivElement>(null);
  const [photo, setPhoto] = useState(0);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    // Le focus initial va au contenu (pas au bouton Fermer, qui afficherait son anneau de focus dès l'ouverture).
    if (open && !d.open) { d.showModal(); setPhoto(0); scroller.current?.focus(); }
    if (!open && d.open) d.close();
  }, [open]);

  // La page derrière ne doit pas défiler (sinon : deux barres de défilement superposées).
  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => { html.style.overflow = prev; };
  }, [open]);

  if (!card) return <dialog ref={ref} />;
  const hero = (
    <div className="-mx-4 -mt-2">
      <div className="relative">
        <div className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]" onScroll={(e) => setPhoto(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
          {card.photos.length === 0
            ? <div className="flex aspect-[4/5] w-full shrink-0 items-center justify-center bg-linear-to-br from-brand-2 to-brand-strong font-display text-8xl font-extrabold text-white/80" aria-hidden>{card.displayName.slice(0, 1)}</div>
            : card.photos.map((p, n) => <img key={p.id} src={p.url} alt={`${card.displayName} (${n + 1}/${card.photos.length})`} draggable={false} className="aspect-[4/5] w-full shrink-0 snap-center object-cover" />)}
        </div>
        {card.photos.length > 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5" aria-hidden>
            {card.photos.map((p, n) => <span key={p.id} className={`h-1.5 rounded-full transition-all ${n === photo ? 'w-5 bg-white' : 'w-1.5 bg-white/55'}`} />)}
          </div>
        )}
      </div>
      <div className="space-y-2 px-4 pt-4">
        <h2 id={titleId} className="flex items-center gap-2 font-display text-3xl font-extrabold">{card.displayName}, {card.age}{card.verified && <VerifiedBadge size="lg" />}</h2>
        <p className="flex items-center gap-1.5 text-muted"><MapPin className="size-4" aria-hidden />{card.city}, {countryName(card.country, locale)}{card.distanceKm != null && ` · ${t('card.distance', { km: card.distanceKm })}`}</p>
        <div className="flex flex-wrap gap-2"><Badge tone="brand">{t(`intent.${card.intent}` as never)}</Badge>{card.compatibility != null && <Badge tone="success"><Sparkles className="size-3.5" aria-hidden />{t('card.compat', { n: card.compatibility })}</Badge>}</div>
      </div>
    </div>
  );
  const act = 'flex items-center justify-center rounded-full shadow-soft ring-1 ring-line transition hover:scale-105';
  return (
    <dialog ref={ref} aria-labelledby={titleId} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-transparent p-0 text-fg backdrop:bg-black/60">
      <motion.div className="mx-auto mt-[6dvh] flex h-[94dvh] max-w-lg flex-col overflow-hidden rounded-t-[2rem] bg-bg shadow-pop"
        initial={{ y: '100%' }} animate={{ y: open ? 0 : '100%' }} transition={{ type: 'spring', damping: 32, stiffness: 320 }}
        drag="y" dragControls={controls} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.7 }} dragSnapToOrigin
        onDragEnd={(_, info) => { if (info.offset.y > 120 || info.velocity.y > 700) onClose(); }}>
        <div className="relative flex shrink-0 touch-none justify-center py-3" onPointerDown={(e) => controls.start(e)} title={t('discover.sheetGrab')}>
          <span className="h-1.5 w-12 rounded-full bg-line" aria-hidden />
          <button type="button" onClick={onClose} className="absolute top-1.5 right-3 z-10 flex h-9 items-center gap-1.5 rounded-full bg-fg px-3.5 text-sm font-semibold text-bg shadow-pop hover:opacity-90"><X className="size-4" aria-hidden />{t('common.close')}</button>
        </div>
        <div ref={scroller} tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-6 outline-none">
          <ProfileDetail card={card} hero={hero} onBlocked={onBlocked} onLiked={onLiked} />
        </div>
        <div className="flex shrink-0 items-center justify-center gap-4 border-t border-line bg-card px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" role="group" aria-label={t('discover.actions')}>
          <button type="button" onClick={() => onDecide('left')} aria-label={t('discover.pass')} className={`${act} size-14 bg-card text-navy`}><X className="size-6" aria-hidden /></button>
          <button type="button" onClick={() => onDecide('up')} aria-label={t('discover.superLike')} className={`${act} size-12 bg-card text-sky-600`}><Star className="size-5" aria-hidden /></button>
          <button type="button" onClick={() => onDecide('right')} aria-label={t('discover.likeBtn')} className={`${act} size-14 bg-linear-to-br from-brand-strong to-brand-strong-2 text-white shadow-pop`}><Heart className="size-6" aria-hidden /></button>
        </div>
      </motion.div>
    </dialog>
  );
}
