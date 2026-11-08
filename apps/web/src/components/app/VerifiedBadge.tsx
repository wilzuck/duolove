'use client';
import { BadgeCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@duomatch/ui';

/** Badge « profil vérifié » (selfie contrôlé par l'équipe) : même pastille partout, nom accessible traduit. */
export function VerifiedBadge({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const t = useTranslations();
  return <BadgeCheck role="img" aria-label={t('card.verified')} className={cn('inline-block shrink-0 fill-sky-500 text-white', size === 'sm' ? 'size-4' : size === 'lg' ? 'size-6' : 'size-5', className)} />;
}
