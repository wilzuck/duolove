'use client';
import { Gem } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@duomatch/ui';

/** Badge Gold : affiché à côté du nom des membres dont la formule Gold est active. */
export function GoldBadge({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const t = useTranslations();
  return <Gem role="img" aria-label={t('card.gold')} className={cn('inline-block shrink-0 text-amber-500', size === 'sm' ? 'size-4' : size === 'md' ? 'size-5' : 'size-6', className)} />;
}
