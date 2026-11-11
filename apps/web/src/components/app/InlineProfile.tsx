'use client';
import { ChevronUp, MapPin, Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { Badge } from '@duomatch/ui';
import { useActivity } from '@/hooks/useQueries';
import type { Card, SwipeResult } from '@/lib/types';
import { useActivityLabel } from './Activity';
import { ProfileDetail } from './ProfileDetail';
import { countryName } from './ProfileCard';
import { VerifiedBadge } from './VerifiedBadge';

/**
 * Profil complet affiché SUR la page, sous la carte (pas de fenêtre) : toutes les photos, l'identité, la dernière activité (Premium / VIP),
 * l'affinité, la présentation, les centres d'intérêt, le mode de vie. Les boutons Passer / Super Like / J'aime restent fixés en bas de l'écran
 * (barre collante de la page de découverte) pendant la lecture.
 */
export function InlineProfile({ card, onClose, onBlocked, onLiked }: { card: Card; onClose: () => void; onBlocked?: () => void; onLiked?: (r: SwipeResult) => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const titleId = useId();
  const [photo, setPhoto] = useState(0);
  // Dernière activité (palier arrondi) : renvoyée par le serveur seulement pour Premium/VIP, et jamais si la personne l'a masquée.
  const activity = useActivity([card.id]).data?.[card.id];
  const activityText = useActivityLabel()(activity);

  const hero = (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-3xl">
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
      <div className="space-y-2 px-1">
        <h2 id={titleId} className="flex items-center gap-2 font-display text-3xl font-extrabold">{card.displayName}, {card.age}{card.verified && <VerifiedBadge size="lg" />}</h2>
        <p className="flex items-center gap-1.5 text-muted"><MapPin className="size-4" aria-hidden />{card.city}, {countryName(card.country, locale)}{card.distanceKm != null && ` · ${t('card.distance', { km: card.distanceKm })}`}</p>
        {activityText && <p className="flex items-center gap-1.5 text-sm text-muted"><span aria-hidden className={`size-2 rounded-full ${activity?.state === 'online' ? 'bg-emerald-500' : 'bg-muted/50'}`} />{activityText}</p>}
        <div className="flex flex-wrap gap-2"><Badge tone="brand">{t(`intent.${card.intent}` as never)}</Badge>{card.compatibility != null && <Badge tone="success"><Sparkles className="size-3.5" aria-hidden />{t('card.compat', { n: card.compatibility })}</Badge>}</div>
      </div>
    </div>
  );
  return (
    <section aria-labelledby={titleId} className="mx-auto w-full scroll-mt-4 space-y-4 rounded-[2rem] border border-line bg-card p-4 shadow-soft">
      <button type="button" onClick={onClose} className="mx-auto flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold text-muted hover:bg-soft hover:text-brand-ink"><ChevronUp className="size-4" aria-hidden />{t('discover.hideProfile')}</button>
      <ProfileDetail card={card} hero={hero} onBlocked={onBlocked} onLiked={onLiked} />
    </section>
  );
}
