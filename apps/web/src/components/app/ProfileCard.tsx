'use client';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, MapPin, Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge, cn } from '@duomatch/ui';
import { COUNTRIES, countryFlag } from '@duomatch/types';
import type { Card } from '@/lib/types';
import { VerifiedBadge } from './VerifiedBadge';

export const countryName = (code: string, locale: string) => {
  const c = COUNTRIES.find((x) => x.code === code);
  return c ? `${countryFlag(c.code)} ${locale === 'en' ? c.en : c.fr}` : code;
};

/** Carte de profil plein cadre : photos (toucher les bords pour changer), identité, intention, intérêts communs. */
export function ProfileCard({ card, compact = false, className }: { card: Card; compact?: boolean; className?: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const [i, setI] = useState(0);
  const photo = card.photos[i] ?? card.photos[0];
  const go = (d: number) => setI((n) => Math.min(Math.max(n + d, 0), card.photos.length - 1));
  return (
    <article className={cn('relative size-full select-none overflow-hidden rounded-[2rem] bg-linear-to-br from-brand-2 to-brand-strong text-white shadow-pop', className)} aria-label={`${card.displayName}, ${card.age}`}>
      {photo ? <img src={photo.url} alt="" draggable={false} className="absolute inset-0 size-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center font-display text-9xl font-extrabold text-white/30">{card.displayName[0]}</div>}
      <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/10 to-black/20" />
      {card.photos.length > 1 && (
        <>
          <div className="absolute inset-x-3 top-3 flex gap-1.5 drop-shadow-[0_1px_2px_rgba(0,0,0,.5)]" aria-hidden>
            {card.photos.map((p, n) => (
              <span key={p.id} className="relative h-[5px] flex-1 overflow-hidden rounded-full bg-white/40">
                {n < i && <span className="absolute inset-0 bg-white" />}
                {n === i && <motion.span key={i} className="absolute inset-0 origin-left bg-white" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.35, ease: 'easeOut' }} />}
              </span>
            ))}
          </div>
          <button type="button" className="absolute inset-y-16 left-0 w-1/3" aria-label={t('card.prevPhoto')} onClick={(e) => { e.stopPropagation(); go(-1); }}><ChevronLeft className="ml-1 size-6 opacity-0 focus-visible:opacity-100" /></button>
          <button type="button" className="absolute inset-y-16 right-0 w-1/3" aria-label={t('card.nextPhoto')} onClick={(e) => { e.stopPropagation(); go(1); }}><ChevronRight className="ml-auto mr-1 size-6 opacity-0 focus-visible:opacity-100" /></button>
        </>
      )}
      {card.compatibility != null && <Badge className="absolute top-8 right-4 bg-black/45 text-white backdrop-blur"><Sparkles className="size-3" aria-hidden />{t('card.compat', { n: card.compatibility })}</Badge>}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 space-y-2 p-5">
        <h2 className="flex items-center gap-2 font-display text-3xl font-extrabold">{card.displayName}, {card.age}{card.verified && <VerifiedBadge size="lg" />}</h2>
        <p className="flex items-center gap-1.5 text-sm text-white/90"><MapPin className="size-4" aria-hidden />{card.city}, {countryName(card.country, locale)}{card.distanceKm != null && <span> · {t('card.distance', { km: card.distanceKm })}</span>}</p>
        <div className="flex flex-wrap gap-1.5"><Badge className="bg-white/90 text-[#c2185b]">{t(`intent.${card.intent}`)}</Badge>{card.commonInterests.slice(0, compact ? 2 : 4).map((s) => <Badge key={s} className="bg-white/25 text-white backdrop-blur">{t(`interest.${s}` as never)}</Badge>)}</div>
        {card.bio && !compact && <p className="line-clamp-2 text-sm text-white/90">{card.bio}</p>}
      </div>
    </article>
  );
}
