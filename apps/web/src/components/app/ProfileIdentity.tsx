'use client';
import { MapPin, Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@duomatch/ui';
import { useActivity } from '@/hooks/useQueries';
import type { Card } from '@/lib/types';
import { useActivityLabel } from './Activity';
import { countryName } from './ProfileCard';
import { VerifiedBadge } from './VerifiedBadge';

/** Nom, âge, lieu, dernière activité (Premium / VIP, palier arrondi, jamais si la personne la masque), intention et compatibilité. */
export function ProfileIdentity({ card, titleId }: { card: Card; titleId?: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const activity = useActivity([card.id]).data?.[card.id];
  const activityText = useActivityLabel()(activity);
  return (
    <div className="space-y-2">
      <h2 id={titleId} className="flex items-center gap-2 font-display text-3xl leading-none font-extrabold">{card.displayName}, {card.age}{card.verified && <VerifiedBadge size="lg" />}</h2>
      <p className="flex items-center gap-1.5 text-muted"><MapPin className="size-4" aria-hidden />{card.city}, {countryName(card.country, locale)}{card.distanceKm != null && ` · ${(card.distanceKm === 0 ? t('card.distanceNear') : t('card.distance', { km: card.distanceKm }))}`}</p>
      {activityText && <p className="flex items-center gap-1.5 text-sm text-muted"><span aria-hidden className={`size-2 rounded-full ${activity?.state === 'online' ? 'bg-emerald-500' : 'bg-muted/50'}`} />{activityText}</p>}
      <div className="flex flex-wrap gap-2"><Badge tone="brand">{t(`intent.${card.intent}` as never)}</Badge>{card.compatibility != null && <Badge tone="success"><Sparkles className="size-3.5" aria-hidden />{t('card.compat', { n: card.compatibility })}</Badge>}</div>
    </div>
  );
}
