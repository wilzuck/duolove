'use client';
import { useMutation } from '@tanstack/react-query';
import { Ban, Briefcase, Flag, Languages } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge, Button } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { post } from '@/lib/api';
import { useUi } from '@/lib/store';
import type { Card } from '@/lib/types';
import { ProfileCard } from './ProfileCard';
import { ReportDialog } from './ReportDialog';

/** Profil complet d'un autre membre, avec Bloquer / Signaler. */
export function ProfileDetail({ card, onBlocked }: { card: Card; onBlocked?: () => void }) {
  const t = useTranslations();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const [report, setReport] = useState(false);
  const block = useMutation({
    mutationFn: () => post(`/blocks/${card.id}`),
    onSuccess: () => { toast('success', t('report.blocked', { name: card.displayName })); onBlocked?.(); },
    onError: (e) => toast('error', err(e)),
  });
  return (
    <div className="space-y-6">
      <div className="mx-auto aspect-[4/5] w-full max-w-md"><ProfileCard card={card} compact /></div>
      <div className="mx-auto max-w-md space-y-5">
        {card.bio && <section><h3 className="mb-1 font-bold">{t('profileView.about')}</h3><p className="whitespace-pre-line text-muted">{card.bio}</p></section>}
        <dl className="space-y-2 text-sm">
          {card.occupation && <div className="flex items-center gap-2"><Briefcase className="size-4 text-brand" aria-hidden /><dt className="sr-only">{t('profile.occupation')}</dt><dd>{card.occupation}</dd></div>}
          {card.languages.length > 0 && <div className="flex items-center gap-2"><Languages className="size-4 text-brand" aria-hidden /><dt className="sr-only">{t('profile.languages')}</dt><dd>{card.languages.map((l) => t(`lang.${l}` as never)).join(', ')}</dd></div>}
        </dl>
        {card.interests.length > 0 && (
          <section><h3 className="mb-2 font-bold">{t('profile.interests')}</h3>
            <ul className="flex flex-wrap gap-2">{card.interests.map((s) => <li key={s}><Badge tone={card.commonInterests.includes(s) ? 'brand' : 'neutral'}>{t(`interest.${s}` as never)}</Badge></li>)}</ul>
          </section>
        )}
        <div className="flex gap-3 border-t border-line pt-5">
          <Button variant="outline" size="sm" onClick={() => setReport(true)}><Flag className="size-4" aria-hidden />{t('report.cta')}</Button>
          <Button variant="outline" size="sm" onClick={() => block.mutate()} loading={block.isPending}><Ban className="size-4" aria-hidden />{t('report.block')}</Button>
        </div>
      </div>
      <ReportDialog userId={card.id} open={report} onClose={() => setReport(false)} />
    </div>
  );
}
