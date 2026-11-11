'use client';
import { useMutation } from '@tanstack/react-query';
import { Ban, Briefcase, Flag, Heart, Home, Languages, MapPin, PawPrint, Baby, Ruler } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge, Button, buttonVariants, cn } from '@duomatch/ui';
import { ActionButton } from './ActionButton';
import { useApiError } from '@/hooks/useApiError';
import { useEngagementConfig } from '@/hooks/useQueries';
import { post } from '@/lib/api';
import { useUi } from '@/lib/store';
import { formatHeight } from '@/lib/format';
import type { Card, SwipeResult } from '@/lib/types';
import { countryName } from './ProfileCard';
import { AffinityPanel } from './AffinityPanel';
import { LikeComposer, type LikeTarget } from './LikeComposer';
import { ProfileCard } from './ProfileCard';
import { PromptList } from './PromptList';
import { ReportDialog } from './ReportDialog';
import type { ReactNode } from 'react';

/** Profil complet d'un autre membre, avec Bloquer / Signaler. */
export function ProfileDetail({ card, onBlocked, onLiked, hero }: { card: Card; onBlocked?: () => void; onLiked?: (r: SwipeResult) => void; hero?: ReactNode }) {
  const t = useTranslations();
  const locale = useLocale();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const [report, setReport] = useState(false);
  const [composer, setComposer] = useState<LikeTarget | null>(null);
  const { data: cfg } = useEngagementConfig();
  const canComment = !!cfg?.flags.like_comments && !card.decision;
  const block = useMutation({
    mutationFn: () => post(`/blocks/${card.id}`),
    onSuccess: () => { toast('success', t('report.blocked', { name: card.displayName })); onBlocked?.(); },
    onError: (e) => toast('error', err(e)),
  });
  return (
    <div className="space-y-6">
      {hero ?? <div className="mx-auto aspect-[4/5] w-full max-w-md"><ProfileCard card={card} compact /></div>}
      <div className="mx-auto max-w-md space-y-5">
        {card.affinity && <AffinityPanel affinity={card.affinity} />}
        {card.bio && <section><h3 className="mb-1 font-bold">{t('profileView.about')}</h3><p className="whitespace-pre-line text-muted">{card.bio}</p></section>}
        <dl className="space-y-2 text-sm">
          {card.occupation && <div className="flex items-center gap-2"><Briefcase className="size-4 text-brand" aria-hidden /><dt className="sr-only">{t('profile.occupation')}</dt><dd>{card.occupation}</dd></div>}
          {card.languages.length > 0 && <div className="flex items-center gap-2"><Languages className="size-4 text-brand" aria-hidden /><dt className="sr-only">{t('profile.languages')}</dt><dd>{card.languages.map((l) => t(`lang.${l}` as never)).join(', ')}</dd></div>}
        </dl>
        {(card.heightCm != null || card.hasChildren != null || card.likesPets != null || card.living || card.originCountry) && (
          <section aria-labelledby={`life-${card.id}`}><h3 id={`life-${card.id}`} className="mb-2 font-bold">{t('profileView.lifestyle')}</h3>
            <ul className="flex flex-wrap gap-2">
              {card.heightCm != null && <li><Badge tone="neutral"><Ruler className="size-3.5" aria-hidden />{t('life.height')} : {formatHeight(card.heightCm, locale)}</Badge></li>}
              {card.hasChildren != null && <li><Badge tone="neutral"><Baby className="size-3.5" aria-hidden />{t(card.hasChildren ? 'profileView.hasChildren' : 'profileView.noChildren')}</Badge></li>}
              {card.likesPets != null && <li><Badge tone="neutral"><PawPrint className="size-3.5" aria-hidden />{t(card.likesPets ? 'profileView.likesPets' : 'profileView.noPets')}</Badge></li>}
              {card.living && <li><Badge tone="neutral"><Home className="size-3.5" aria-hidden />{t(`life.livingOpt.${card.living}` as never)}</Badge></li>}
              {card.originCountry && <li><Badge tone="neutral"><MapPin className="size-3.5" aria-hidden />{t('profileView.from', { country: countryName(card.originCountry, locale) })}</Badge></li>}
            </ul>
          </section>
        )}
        {!!card.prompts?.length && <PromptList items={card.prompts} onLike={canComment ? (a) => setComposer({ kind: 'PROMPT', ref: a.id }) : undefined} />}
        {card.interests.length > 0 && (
          <section><h3 className="mb-2 font-bold">{t('profile.interests')}</h3>
            <ul className="flex flex-wrap gap-2">{[...card.interests].sort((a, b) => Number(card.commonInterests.includes(b)) - Number(card.commonInterests.includes(a))).map((s) => {
              const common = card.commonInterests.includes(s);
              return <li key={s}><Badge tone={common ? 'brand' : 'neutral'} className={common ? 'border border-brand-strong/70' : undefined}>{t(`interest.${s}` as never)}</Badge></li>;
            })}</ul>
          </section>
        )}
        {canComment && <ActionButton kind="like" reach={120} delay={350} onAct={() => setComposer({ kind: 'PROFILE', ref: null })} className={cn(buttonVariants({}), 'w-full')}><Heart className="size-4" aria-hidden />{t('engagement.composer.likeWith')}</ActionButton>}
        <div className="flex gap-3 border-t border-line pt-5">
          <Button variant="outline" size="sm" onClick={() => setReport(true)}><Flag className="size-4" aria-hidden />{t('report.cta')}</Button>
          <Button variant="outline" size="sm" onClick={() => block.mutate()} loading={block.isPending}><Ban className="size-4" aria-hidden />{t('report.block')}</Button>
        </div>
      </div>
      {composer && <LikeComposer card={card} open initial={composer} onClose={() => setComposer(null)} onDone={onLiked} />}
      <ReportDialog userId={card.id} open={report} onClose={() => setReport(false)} />
    </div>
  );
}
