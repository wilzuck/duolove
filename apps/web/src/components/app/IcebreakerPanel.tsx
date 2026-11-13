'use client';
import { useQuery } from '@tanstack/react-query';
import { Lightbulb, RefreshCw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, Skeleton } from '@duomatch/ui';
import { api } from '@/lib/api';

interface Suggestions { items: { id: string; kind: string; text: string }[]; basedOn: { commonInterests: string[]; sameIntent: boolean } }

/** « Besoin d'une idée pour commencer ? » : sujets déduits de ce que les deux personnes ont en commun. Choisir une idée la place dans le champ de saisie,
 *  sans rien envoyer : la personne garde la main sur le texte. */
export function IcebreakerPanel({ conversationId, onPick }: { conversationId: string; onPick: (text: string) => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const [seed, setSeed] = useState(0);
  const q = useQuery({ queryKey: ['icebreakers', conversationId, seed, locale], queryFn: () => api<Suggestions>(`/conversations/${conversationId}/icebreakers?seed=${seed}&locale=${locale}`), staleTime: 60_000, retry: false });
  const coach = useQuery({ queryKey: ['coach', conversationId, seed, locale], queryFn: () => api<{ items: { id: string; kind: string; text: string }[] }>(`/conversations/${conversationId}/coach?seed=${seed}&locale=${locale}`), staleTime: 60_000, retry: false });
  const common = q.data?.basedOn.commonInterests ?? [];
  return (
    <section aria-labelledby="ice-t" className="mb-3 space-y-2 rounded-2xl border border-line bg-soft/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id="ice-t" className="flex items-center gap-2 text-sm font-bold"><Lightbulb className="size-4 text-brand-ink" aria-hidden />{t('chat.iceTitle')}</h3>
        <Button type="button" size="sm" variant="ghost" onClick={() => setSeed((n) => n + 1)} loading={q.isFetching}><RefreshCw className="size-4" aria-hidden />{t('chat.iceMore')}</Button>
      </div>
      <p className="text-xs text-muted">{t('chat.iceHint')}</p>
      {common.length > 0 && <p className="text-xs text-muted">{t('chat.iceCommon', { list: common.map((s) => t(`interest.${s}` as never)).join(', ') })}</p>}
      {!!coach.data?.items.length && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-brand-ink">{t('chat.coachTitle')}</p>
          <ul className="space-y-1.5">{coach.data.items.map((i) => <li key={i.id}><button type="button" onClick={() => onPick(i.text)} className="w-full rounded-xl border border-brand/30 bg-card px-3 py-2 text-left text-sm shadow-sm hover:bg-brand/10">{i.text}</button></li>)}</ul>
        </div>
      )}
      {q.isLoading && <Skeleton className="h-10" />}
      {q.data && q.data.items.length === 0 && <p className="text-sm text-muted">{t('chat.iceEmpty')}</p>}
      <ul className="space-y-1.5">{q.data?.items.map((i) => <li key={i.id}><button type="button" onClick={() => onPick(i.text)} className="w-full rounded-xl bg-card px-3 py-2 text-left text-sm shadow-sm hover:bg-brand/10">{i.text}</button></li>)}</ul>
    </section>
  );
}
