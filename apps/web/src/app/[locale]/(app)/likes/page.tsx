'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Crown, Eye, Heart, MessageCircle, Star, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Avatar, Badge, Button, Card, EmptyState, Skeleton, Tabs } from '@duomatch/ui';
import { countryName } from '@/components/app/ProfileCard';
import { useApiError } from '@/hooks/useApiError';
import { Link } from '@/i18n/navigation';
import { api, post } from '@/lib/api';
import { useUi } from '@/lib/store';
import type { Card as ProfileCardT, Paged, SwipeResult } from '@/lib/types';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';

type Received = Paged<ProfileCardT> & { locked: boolean; count: number };
type Visitors = Paged<ProfileCardT & { visitedAt: string; visits: number }> & { locked: boolean; count: number };
type Sent = Paged<ProfileCardT & { matched: boolean; conversationId: string | null }>;

export default function LikesPage() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const showMatch = useUi((s) => s.showMatch);
  const [tab, setTab] = useState<'received' | 'sent' | 'visitors'>('received');
  const q = useQuery({ queryKey: ['received'], queryFn: () => api<Received>('/swipes/received') });
  const sent = useQuery({ queryKey: ['sent'], queryFn: () => api<Sent>('/swipes/sent'), enabled: tab === 'sent' });
  const visitors = useQuery({ queryKey: ['visitors'], queryFn: () => api<Visitors>('/profiles/me/visitors'), enabled: tab === 'visitors' });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'LIKE' | 'PASS' }) => post<SwipeResult>('/swipes', { targetId: id, action }),
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ['received'] }); if (r.matched && r.match) showMatch({ matchId: r.match.id, conversationId: r.match.conversationId, user: r.match.user }); },
    onError: (e) => toast('error', err(e)),
  });

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 px-4 py-4">
      <h1 className="text-2xl font-extrabold">{t('likes.heading')}</h1>
      <Tabs label={t('likes.heading')} value={tab} onChange={setTab} tabs={[{ key: 'received', label: `${t('likes.tab.received')}${q.data ? ` (${q.data.count})` : ''}` }, { key: 'sent', label: t('likes.tab.sent') }, { key: 'visitors', label: `${t('likes.tab.visitors')}${visitors.data ? ` (${visitors.data.count})` : ''}` }]} />
      {tab === 'sent' && (
        <div role="tabpanel" className="space-y-3">
          {sent.isLoading && <><Skeleton className="h-24" /><Skeleton className="h-24" /></>}
          {sent.data && sent.data.items.length === 0 && <EmptyState icon={<Heart className="size-8" />} title={t('likes.sentEmptyTitle')}>{t('likes.sentEmptyText')}</EmptyState>}
          <ul className="space-y-3">{sent.data?.items.map((c) => (
            <li key={c.id}><Card className="flex items-center gap-4 p-3">
              <Link href={`/profile/${c.id}`} className="flex min-w-0 flex-1 items-center gap-4" aria-label={t('likes.view', { name: c.displayName })}>
                <Avatar src={c.photos[0]?.thumbUrl} name={c.displayName} size={72} className="rounded-2xl" />
                <span className="min-w-0"><span className="flex items-center gap-1.5 font-bold">{c.displayName}, {c.age}{c.verified && <VerifiedBadge size="sm" />}{c.superLike && <Star className="size-4 fill-sky-500 text-sky-500" aria-label={t('likes.superLike')} />}</span>
                  <span className="block truncate text-sm text-muted">{c.city}, {countryName(c.country, locale)}</span>
                  {c.comment && <span className="mt-1 block truncate text-sm italic text-muted"><span className="sr-only">{t('likes.commentLabel')} </span>« {c.comment} »</span>}</span>
              </Link>
              {c.matched && c.conversationId
                ? <Link href={`/messages/${c.conversationId}`}><Button size="sm"><MessageCircle className="size-4" aria-hidden />{t('likes.chat')}</Button></Link>
                : <Badge tone="neutral">{t('likes.pending')}</Badge>}
            </Card></li>
          ))}</ul>
        </div>
      )}
      {tab === 'visitors' && (
        <div role="tabpanel" className="space-y-3">
          {visitors.isLoading && <><Skeleton className="h-24" /><Skeleton className="h-24" /></>}
          {visitors.data?.locked && (
            <Card className="overflow-hidden">
              <div className="grid grid-cols-3 gap-1 p-1" aria-hidden>
                {Array.from({ length: Math.min(Math.max(visitors.data.count, 1), 6) }).map((_, i) => <div key={i} className="aspect-[4/5] bg-linear-to-br from-brand-2 to-brand-strong blur-lg" />)}
              </div>
              <div className="space-y-3 p-6 text-center">
                <Crown className="mx-auto size-8 text-brand" aria-hidden />
                <h2 className="text-xl font-bold">{t('likes.visitorsLockedTitle', { count: visitors.data.count })}</h2>
                <p className="text-muted">{t('likes.visitorsLockedText')}</p>
                <Link href="/premium"><Button size="lg">{t('app.goPremium')}</Button></Link>
              </div>
            </Card>
          )}
          {visitors.data && !visitors.data.locked && visitors.data.items.length === 0 && <EmptyState icon={<Eye className="size-8" />} title={t('likes.visitorsEmptyTitle')}>{t('likes.visitorsEmptyText')}</EmptyState>}
          <ul className="space-y-3">{visitors.data?.items.map((c) => (
            <li key={c.id}><Card className="flex items-center gap-4 p-3">
              <Link href={`/profile/${c.id}`} className="flex min-w-0 flex-1 items-center gap-4" aria-label={t('likes.view', { name: c.displayName })}>
                <Avatar src={c.photos[0]?.thumbUrl} name={c.displayName} size={72} className="rounded-2xl" />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-bold">{c.displayName}, {c.age}{c.verified && <VerifiedBadge size="sm" />}</span>
                  <span className="block truncate text-sm text-muted">{c.city}, {countryName(c.country, locale)}</span>
                  <span className="mt-1 block text-sm text-muted">{t('likes.visitedAgo', { when: new Date(c.visitedAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) })} · {t('likes.visitCount', { n: c.visits })}</span>
                </span>
              </Link>
            </Card></li>
          ))}</ul>
        </div>
      )}
      {tab === 'received' && q.isLoading && <div className="space-y-3"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>}
      {tab === 'received' && q.data?.locked && (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-3 gap-1 p-1" aria-hidden>
            {Array.from({ length: Math.min(Math.max(q.data.count, 1), 6) }).map((_, i) => <div key={i} className="aspect-[4/5] bg-linear-to-br from-brand-2 to-brand-strong blur-lg" />)}
          </div>
          <div className="space-y-3 p-6 text-center">
            <Crown className="mx-auto size-8 text-brand" aria-hidden />
            <h2 className="text-xl font-bold">{t('likes.lockedTitle', { count: q.data.count })}</h2>
            <p className="text-muted">{t('likes.lockedText')}</p>
            <Link href="/premium"><Button size="lg">{t('app.goPremium')}</Button></Link>
          </div>
        </Card>
      )}
      {tab === 'received' && q.data && q.data.items.length === 0 && !q.data.locked && <EmptyState icon={<Heart className="size-8" />} title={t('likes.emptyTitle')}>{t('likes.emptyText')}</EmptyState>}
      <ul className="space-y-3">
        {tab === 'received' && q.data?.items.map((c) => (
          <li key={c.id}>
            <Card className="flex items-center gap-4 p-3">
              <Link href={`/profile/${c.id}`} className="flex min-w-0 flex-1 items-center gap-4" aria-label={t('likes.view', { name: c.displayName })}>
                <Avatar src={c.photos[0]?.thumbUrl} name={c.displayName} size={72} className="rounded-2xl" />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-bold">{c.displayName}, {c.age}{c.verified && <VerifiedBadge size="sm" />}{c.superLike && <Star className="size-4 fill-sky-500 text-sky-500" aria-label={t('likes.superLike')} />}</span>
                  <span className="block truncate text-sm text-muted">{c.city}, {countryName(c.country, locale)}</span>
                  {c.comment && <span className="mt-1 block rounded-xl bg-soft px-3 py-1.5 text-sm"><span className="sr-only">{t('likes.commentLabel')} </span>« {c.comment} »</span>}
                </span>
              </Link>
              <div className="flex gap-2">
                <button type="button" onClick={() => act.mutate({ id: c.id, action: 'PASS' })} aria-label={t('discover.pass')} className="flex size-11 items-center justify-center rounded-full bg-navy text-white hover:brightness-125"><X className="size-5" /></button>
                <button type="button" onClick={() => act.mutate({ id: c.id, action: 'LIKE' })} aria-label={t('discover.likeBtn')} className="flex size-11 items-center justify-center rounded-full bg-brand-strong text-white hover:brightness-110"><Heart className="size-5" /></button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
