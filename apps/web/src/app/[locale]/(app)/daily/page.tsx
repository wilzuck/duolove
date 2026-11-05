'use client';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Heart, MapPin, Sparkles, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Avatar, Badge, Button, Card, Dialog, EmptyState, Skeleton, Tabs } from '@duomatch/ui';
import { LikeComposer } from '@/components/app/LikeComposer';
import { countryName } from '@/components/app/ProfileCard';
import { ProfileDetail } from '@/components/app/ProfileDetail';
import { useApiError } from '@/hooks/useApiError';
import { useEngagementConfig } from '@/hooks/useQueries';
import { ApiError, api, del, post } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useUi } from '@/lib/store';
import type { Card as ProfileCardT, SwipeResult } from '@/lib/types';

interface Today { day: string; items: ProfileCardT[]; pending: number }
interface History { days: { day: string; items: ProfileCardT[] }[]; nextCursor: string | null }

/** « Rencontres sélectionnées » : une liste de profils détaillés, sans geste de swipe ni compte à rebours. */
function PickCard({ card, onOpen, onLike, onPass, busy }: { card: ProfileCardT; onOpen: () => void; onLike: () => void; onPass: () => void; busy: boolean }) {
  const t = useTranslations();
  const locale = useLocale();
  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-start gap-4">
        <Avatar src={card.photos[0]?.thumbUrl} name={card.displayName} size={88} className="rounded-2xl" />
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="flex items-center gap-1.5 text-lg font-extrabold">{card.displayName}, {card.age}{card.verified && <BadgeCheck className="size-5 fill-sky-500 text-white" aria-label={t('card.verified')} />}</h3>
          <p className="flex items-center gap-1 text-sm text-muted"><MapPin className="size-4" aria-hidden />{card.city}, {countryName(card.country, locale)}</p>
          <Badge tone="brand"><Sparkles className="size-3" aria-hidden />{t('card.compat', { n: card.affinity?.score ?? card.compatibility ?? 0 })}</Badge>
        </div>
      </div>
      {card.affinity && <ul className="list-disc space-y-0.5 pl-5 text-sm marker:text-brand-ink">{card.affinity.reasons.slice(0, 3).map((r) => <li key={r.code}>{(t as unknown as (k: string, v?: Record<string, unknown>) => string)(`engagement.affinity.reasons.${r.code}`, { n: r.n ?? 0 })}</li>)}</ul>}
      {card.prompts?.[0] && <p className="rounded-2xl bg-soft p-3 text-sm"><span className="block font-semibold text-brand-ink">{locale === 'en' ? card.prompts[0].question.en : card.prompts[0].question.fr}</span>{card.prompts[0].answer}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {card.decision
          ? <Badge tone="neutral">{t(card.decision === 'PASS' ? 'engagement.daily.passed' : 'engagement.daily.liked')}</Badge>
          : (<><Button onClick={onLike} loading={busy}><Heart className="size-4 fill-current" aria-hidden />{t('engagement.daily.like')}</Button>
              <Button variant="outline" onClick={onPass} disabled={busy}><X className="size-4" aria-hidden />{t('engagement.daily.pass')}</Button></>)}
        <Button variant="ghost" onClick={onOpen}>{t('engagement.daily.details')}</Button>
      </div>
    </Card>
  );
}

export default function DailyPage() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const showMatch = useUi((s) => s.showMatch);
  const { data: cfg } = useEngagementConfig();
  const [tab, setTab] = useState<'today' | 'history'>('today');
  const [open, setOpen] = useState<ProfileCardT | null>(null);
  const [liking, setLiking] = useState<ProfileCardT | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const today = useQuery({ queryKey: ['daily'], queryFn: () => api<Today>('/discovery/daily'), retry: false });
  const history = useInfiniteQuery({
    queryKey: ['daily', 'history'], enabled: tab === 'history', initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api<History>(`/discovery/daily/history${pageParam ? `?before=${pageParam}` : ''}`),
    getNextPageParam: (l) => l.nextCursor ?? undefined, retry: false,
  });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['daily'] }); void qc.invalidateQueries({ queryKey: ['usage'] }); };
  const done = (c: ProfileCardT) => (r: SwipeResult) => { refresh(); if (r.matched && r.match) showMatch({ matchId: r.match.id, conversationId: r.match.conversationId, user: r.match.user ?? c }); };
  const decide = async (c: ProfileCardT, action: 'LIKE' | 'PASS') => {
    setBusy(c.id);
    try { done(c)(await post<SwipeResult>('/swipes', { targetId: c.id, action })); } catch (e) { toast('error', err(e)); } finally { setBusy(null); }
  };
  const disabled = (today.error instanceof ApiError && today.error.code === 'FEATURE_DISABLED') || cfg?.flags.daily_picks === false;
  const paused = today.error instanceof ApiError && today.error.code === 'PAUSED';
  const resume = async () => { try { await del('/engagement/me/pause'); toast('success', t('rhythm.resumed')); await qc.invalidateQueries(); } catch (e) { toast('error', err(e)); } };
  const card = (c: ProfileCardT) => <li key={c.id}><PickCard card={c} busy={busy === c.id} onOpen={() => setOpen(c)} onLike={() => (cfg?.flags.like_comments ? setLiking(c) : void decide(c, 'LIKE'))} onPass={() => void decide(c, 'PASS')} /></li>;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 px-4 py-4">
      <header><h1 className="text-2xl font-extrabold">{t('engagement.daily.title')}</h1><p className="mt-1 text-muted">{t('engagement.daily.subtitle')}</p></header>
      {paused ? <EmptyState icon={<Sparkles className="size-8" />} title={t('rhythm.pausedEmptyTitle')}>{t('rhythm.pausedEmptyText')}<div className="mt-4"><Button onClick={() => void resume()}>{t('rhythm.resume')}</Button></div></EmptyState> : disabled ? <EmptyState icon={<Sparkles className="size-8" />} title={t('engagement.daily.disabledTitle')}>{t('engagement.daily.disabledText')}</EmptyState> : (
        <>
          <Tabs label={t('engagement.daily.title')} value={tab} onChange={setTab} tabs={[{ key: 'today', label: `${t('engagement.daily.tabToday')}${today.data ? ` · ${t('engagement.daily.pending', { n: today.data.pending })}` : ''}` }, { key: 'history', label: t('engagement.daily.tabHistory') }]} />
          {tab === 'today' && (
            <div role="tabpanel" className="space-y-4">
              {today.isLoading && <><Skeleton className="h-52" /><Skeleton className="h-52" /></>}
              {today.isError && !disabled && <p role="alert" className="text-danger-ink">{t('engagement.daily.error')}</p>}
              {today.data && today.data.items.length === 0 && <EmptyState icon={<Sparkles className="size-8" />} title={t('engagement.daily.emptyTitle')}>{t('engagement.daily.emptyText')}</EmptyState>}
              <ul className="space-y-4">{today.data?.items.map(card)}</ul>
            </div>
          )}
          {tab === 'history' && (
            <div role="tabpanel" className="space-y-6">
              {history.isLoading && <Skeleton className="h-52" />}
              {history.data && history.data.pages.every((p) => p.days.length === 0) && <EmptyState icon={<Sparkles className="size-8" />} title={t('engagement.daily.historyEmpty')} />}
              {history.data?.pages.flatMap((p) => p.days).map((d) => (
                <section key={d.day} aria-label={t('engagement.daily.day', { date: formatDate(d.day, locale) })} className="space-y-3">
                  <h2 className="font-bold">{t('engagement.daily.day', { date: formatDate(d.day, locale) })}</h2>
                  <ul className="space-y-4">{d.items.map(card)}</ul>
                </section>
              ))}
              {history.hasNextPage && <Button variant="outline" onClick={() => void history.fetchNextPage()} loading={history.isFetchingNextPage}>{t('engagement.daily.more')}</Button>}
            </div>
          )}
        </>
      )}
      <Dialog open={!!open} onClose={() => setOpen(null)} title={open?.displayName ?? ''} closeLabel={t('common.close')} className="w-[min(94vw,32rem)]">
        {open && <ProfileDetail card={open} onBlocked={() => { setOpen(null); refresh(); }} onLiked={(r) => { setOpen(null); done(open)(r); }} />}
      </Dialog>
      {liking && <LikeComposer card={liking} open onClose={() => setLiking(null)} onDone={done(liking)} />}
    </div>
  );
}
