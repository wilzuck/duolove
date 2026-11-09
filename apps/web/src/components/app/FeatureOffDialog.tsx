'use client';
import { Hourglass, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, Dialog } from '@duomatch/ui';
import { useEngagementConfig } from '@/hooks/useQueries';
import { useRouter } from '@/i18n/navigation';
import type { EngagementConfig } from '@/lib/types';

export type GatedFlag = keyof EngagementConfig['flags'];

/**
 * À poser en tête d'une page qui dépend d'une fonctionnalité que l'administration peut couper : dès l'ouverture,
 * si elle est désactivée, une boîte de dialogue le dit clairement (au lieu de laisser remplir un formulaire qui sera refusé).
 * Fermer la boîte renvoie vers `backHref`. Tant que la configuration n'est pas chargée, rien ne s'affiche.
 */
export function FeatureOffDialog({ flag, backHref = '/discover' }: { flag: GatedFlag; backHref?: string }) {
  const t = useTranslations();
  const router = useRouter();
  const off = useEngagementConfig().data?.flags[flag] === false;
  const [closed, setClosed] = useState(false);
  if (!off) return null;
  const leave = () => { setClosed(true); router.replace(backHref); };
  return (
    <Dialog open={!closed} onClose={leave} title={t('featureOff.title')} closeLabel={t('common.close')}>
      <div className="flex flex-col items-center text-center">
        <span className="relative mb-5 flex size-20 items-center justify-center rounded-full bg-linear-to-br from-brand-strong to-brand-strong-2 text-white shadow-soft">
          <Hourglass className="size-9" aria-hidden />
          <Sparkles className="absolute -top-1 -right-1 size-6 rounded-full bg-card p-1 text-brand-ink" aria-hidden />
        </span>
        <p className="font-semibold">{t(`featureOff.names.${flag}` as never)}</p>
        <p className="mt-2 text-sm text-muted">{t('featureOff.text')}</p>
        <Button className="mt-6 w-full" onClick={leave}>{t('featureOff.back')}</Button>
      </div>
    </Dialog>
  );
}
