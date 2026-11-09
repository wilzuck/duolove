'use client';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@duomatch/ui';
import { timeAgo } from '@/lib/format';
import type { Activity } from '@/lib/types';

/** Texte du statut : « En ligne », « Vu il y a 12 min » (heure exacte, formules « mode discret ») ou le palier (« Actif aujourd'hui »). */
export function useActivityLabel() {
  const t = useTranslations();
  const locale = useLocale();
  return (a?: Activity) => {
    if (!a) return null;
    if (a.state === 'online') return t('activity.online');
    if (a.lastSeenAt) return t('activity.seen', { when: timeAgo(a.lastSeenAt, locale) });
    return t(a.state === 'today' ? 'activity.today' : 'activity.week');
  };
}

/** Pastille « en ligne » posée sur un avatar (parent en `relative`). Ne s'affiche que pour les personnes en ligne ; le texte est porté par ailleurs. */
export function OnlineDot({ activity, className }: { activity?: Activity; className?: string }) {
  const t = useTranslations();
  if (activity?.state !== 'online') return null;
  return <span role="img" aria-label={t('activity.online')} className={cn('absolute right-0 bottom-0 size-3.5 rounded-full border-2 border-card bg-emerald-500', className)} />;
}
