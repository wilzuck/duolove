'use client';
import { Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { buttonVariants, cn } from '@duomatch/ui';
import { ActionButton } from './ActionButton';

/** Bouton « Super Like » : un seul aspect partout (violet plein, étoile, même taille). `bg-none` retire le dégradé rose du bouton principal, sinon il masque la couleur. */
export function SuperLikeButton({ onAct, className }: { onAct: () => void; className?: string }) {
  const t = useTranslations();
  return (
    <ActionButton kind="super" reach={120} delay={350} onAct={onAct} className={cn(buttonVariants({ size: 'lg' }), 'bg-none bg-violet-700 text-white hover:bg-violet-800', className)}>
      <Star className="size-5" aria-hidden />{t('engagement.composer.superButton')}
    </ActionButton>
  );
}
