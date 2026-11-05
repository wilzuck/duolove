'use client';
import { useQuery } from '@tanstack/react-query';
import { Lightbulb, PartyPopper } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card } from '@duomatch/ui';
import { useEngagementConfig } from '@/hooks/useQueries';
import { api } from '@/lib/api';
import type { ProfileTip } from '@/lib/types';

/** Conseils concrets et bienveillants, déduits de l'état réel du profil ; chacun disparaît dès qu'il est réalisé. */
export function ProfileTips() {
  const t = useTranslations();
  const { data: cfg } = useEngagementConfig();
  const q = useQuery({ queryKey: ['engagement', 'tips'], queryFn: () => api<{ items: ProfileTip[] }>('/engagement/me/tips'), enabled: !!cfg?.flags.profile_tips, retry: false });
  if (!cfg?.flags.profile_tips || !q.data) return null;
  const tr = t as unknown as (k: string, v?: Record<string, unknown>) => string;
  return (
    <Card className="space-y-3 p-5">
      <h2 className="flex items-center gap-2 font-bold">{q.data.items.length ? <Lightbulb className="size-5 text-brand-ink" aria-hidden /> : <PartyPopper className="size-5 text-brand-ink" aria-hidden />}{t('tips.title')}</h2>
      {q.data.items.length === 0 ? <p className="text-muted">{t('tips.done')}</p> : (
        <>
          <p className="text-sm text-muted">{t('tips.intro')}</p>
          <ul className="space-y-2">
            {q.data.items.map((i) => (
              <li key={i.code} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-soft px-4 py-3 text-sm">
                <span>{tr(`tips.${i.code}`, { have: i.have ?? 0, target: i.target ?? 0 })}</span>
                {i.anchor && <a href={`#${i.anchor}`} className="font-semibold text-brand-ink underline">{t('tips.go')}</a>}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
