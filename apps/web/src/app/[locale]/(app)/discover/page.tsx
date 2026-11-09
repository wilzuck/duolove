'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { Crown, Heart, Info, PauseCircle, RotateCcw, SlidersHorizontal, Sparkles, Star, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Dialog, EmptyState, Skeleton, cn } from '@duomatch/ui';
import { ProfileCard } from '@/components/app/ProfileCard';
import { ProfileSheet } from '@/components/app/ProfileSheet';
import { useApiError } from '@/hooks/useApiError';
import { useMe } from '@/hooks/useQueries';
import { Link } from '@/i18n/navigation';
import { ApiError, api, del, post } from '@/lib/api';
import { useUi } from '@/lib/store';
import type { Card, Paged, SwipeResult } from '@/lib/types';
import { SectionTabs } from '@/components/app/SectionTabs';

type Dir = 'left' | 'right' | 'up';
const SWIPE = { left: 'PASS', right: 'LIKE', up: 'SUPER_LIKE' } as const;

function SwipeCard({ card, top, leaving, onDecide, onGone, onInfo }: { card: Card; top: boolean; leaving: Dir | null; onDecide: (d: Dir) => void; onGone: () => void; onInfo: () => void }) {
  const t = useTranslations();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-220, 0, 220], [-14, 0, 14]);
  const likeOp = useTransform(x, [20, 120], [0, 1]);
  const nopeOp = useTransform(x, [-120, -20], [1, 0]);
  const gone = useRef(false);
  const wheelLock = useRef(false);
  const el = useRef<HTMLDivElement>(null);
  // Défiler vers le bas sur la carte ouvre le profil ; l'écouteur natif (non passif) empêche la page de glisser en même temps.
  useEffect(() => {
    const node = el.current;
    if (!node || !top || leaving) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY <= 0) return;
      e.preventDefault();
      if (e.deltaY > 35 && !wheelLock.current) { wheelLock.current = true; onInfo(); setTimeout(() => { wheelLock.current = false; }, 900); }
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [top, leaving, onInfo]);

  useEffect(() => {
    if (!leaving || gone.current) return;
    gone.current = true;
    const target = leaving === 'up' ? { y: -900 } : { x: leaving === 'right' ? 700 : -700 };
    const key = leaving === 'up' ? y : x;
    void animate(key, Object.values(target)[0]!, { duration: 0.28, ease: 'easeIn' }).then(onGone);
  }, [leaving, onGone, x, y]);

  return (
    <motion.div ref={el} className={cn('absolute inset-0', top ? 'z-10 cursor-grab touch-none active:cursor-grabbing' : 'pointer-events-none')}
      style={{ x, y, rotate }} initial={false} animate={{ scale: top ? 1 : 0.94, opacity: top ? 1 : 0.9 }}
      onPanEnd={top && !leaving ? (_, info) => { if (info.offset.y < -70 && Math.abs(info.offset.x) < 60) onInfo(); } : undefined}
      drag={top && !leaving ? 'x' : false} dragSnapToOrigin dragElastic={0.9} dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={(_, info) => { if (info.offset.x > 110 || info.velocity.x > 600) onDecide('right'); else if (info.offset.x < -110 || info.velocity.x < -600) onDecide('left'); }}>
      <ProfileCard card={card} />
      {top && (
        <>
          <span aria-hidden className="pointer-events-none absolute bottom-2 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-white/60" />
          <motion.span style={{ opacity: likeOp }} aria-hidden className="pointer-events-none absolute top-10 left-6 -rotate-12 rounded-xl border-4 border-success px-3 py-1 font-display text-3xl font-extrabold text-success">{t('discover.like')}</motion.span>
          <motion.span style={{ opacity: nopeOp }} aria-hidden className="pointer-events-none absolute top-10 right-6 rotate-12 rounded-xl border-4 border-danger px-3 py-1 font-display text-3xl font-extrabold text-danger">{t('discover.nope')}</motion.span>
          <button type="button" onClick={onInfo} aria-label={t('discover.info')} className="absolute right-4 bottom-4 flex size-10 items-center justify-center rounded-full bg-white/25 text-white backdrop-blur hover:bg-white/40"><Info className="size-5" /></button>
        </>
      )}
    </motion.div>
  );
}

export default function DiscoverPage() {
  const t = useTranslations();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const showMatch = useUi((s) => s.showMatch);
  const { data: me } = useMe();
  const [deck, setDeck] = useState<Card[]>([]);
  const [leaving, setLeaving] = useState<{ id: string; dir: Dir } | null>(null);
  const [detail, setDetail] = useState<Card | null>(null);
  const [upsell, setUpsell] = useState<'DAILY_LIMIT' | 'PLAN_REQUIRED' | 'NO_SUPER_LIKES' | null>(null);
  const busy = useRef(false);

  const feed = useQuery({
    queryKey: ['feed'], queryFn: () => api<Paged<Card> & { total: number; paused?: boolean }>('/discovery?limit=12'),
    refetchOnWindowFocus: false, staleTime: 0, gcTime: 0,
  });
  const usage = useQuery({ queryKey: ['usage'], queryFn: () => api<{ used: { likes: number; superLikesWeek: number }; limits: { dailyLikes: number; unlimitedLikes: boolean; superLikesWeekly: number } }>('/swipes/usage') });

  // Fusionne les nouvelles cartes (dédoublonnées) dans la pile : état dérivé, mis à jour une seule fois par réponse.
  const [merged, setMerged] = useState<typeof feed.data>();
  if (feed.data && feed.data !== merged) {
    setMerged(feed.data);
    const seen = new Set(deck.map((c) => c.id));
    setDeck([...deck, ...feed.data.items.filter((c) => !seen.has(c.id))]);
  }
  useEffect(() => { if (deck.length > 0 && deck.length <= 3 && !feed.isFetching && feed.data?.nextCursor !== undefined) void feed.refetch(); }, [deck.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const top = deck[0];
  const decide = useCallback((dir: Dir) => { if (top && !leaving && !busy.current) setLeaving({ id: top.id, dir }); }, [top, leaving]);

  const onGone = useCallback(async () => {
    if (!leaving) return;
    const { id, dir } = leaving;
    const card = deck.find((c) => c.id === id);
    busy.current = true;
    setDeck((d) => d.filter((c) => c.id !== id));
    setLeaving(null);
    try {
      const r = await post<SwipeResult>('/swipes', { targetId: id, action: SWIPE[dir] });
      void qc.invalidateQueries({ queryKey: ['usage'] });
      if (r.matched && r.match) showMatch({ matchId: r.match.id, conversationId: r.match.conversationId, user: r.match.user ?? card ?? null });
    } catch (e) {
      if (card) setDeck((d) => [card, ...d]);
      if (e instanceof ApiError && (e.code === 'DAILY_LIMIT' || e.code === 'PLAN_REQUIRED' || e.code === 'NO_SUPER_LIKES')) setUpsell(e.code);
      else toast('error', err(e));
    } finally { busy.current = false; }
  }, [leaving, deck, qc, showMatch, toast, err]);

  const resume = async () => { try { await del('/engagement/me/pause'); toast('success', t('rhythm.resumed')); await qc.invalidateQueries(); } catch (e) { toast('error', err(e)); } };
  const rewind = async () => {
    try {
      const r = await post<{ profile: Card | null }>('/swipes/rewind');
      if (r.profile) setDeck((d) => [r.profile!, ...d]);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'PLAN_REQUIRED') setUpsell('PLAN_REQUIRED'); else toast('error', err(e));
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (detail || upsell || (e.target as HTMLElement).closest('input,textarea,select,dialog')) return;
      if (e.key === 'ArrowRight') decide('right'); else if (e.key === 'ArrowLeft') decide('left'); else if ((e.key === 'ArrowUp' || e.key === 'i') && top) setDetail(top);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [decide, detail, upsell, top]);

  const remaining = usage.data && !usage.data.limits.unlimitedLikes ? Math.max(0, usage.data.limits.dailyLikes - usage.data.used.likes) : null;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
      <SectionTabs />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('app.nav.discover')}</h1>
        <div className="flex items-center gap-2">
          {remaining != null && me?.entitlement.plan === 'FREE' && <span className="rounded-full bg-soft px-3 py-1.5 text-xs font-semibold text-brand-ink" aria-live="polite">{t('discover.likesLeft', { n: remaining })}</span>}
          <Link href="/daily" aria-label={t('app.nav.daily')} className="rounded-full p-2.5 text-brand-ink hover:bg-soft"><Sparkles className="size-5" /></Link>
          <Link href="/profile#filters" aria-label={t('discover.filters')} className="rounded-full p-2.5 text-muted hover:bg-soft"><SlidersHorizontal className="size-5" /></Link>
        </div>
      </div>

      <div className="relative mx-auto aspect-[3/4] max-h-[62dvh] w-full">
        {feed.isLoading && <Skeleton className="size-full rounded-[2rem]" />}
        {!feed.isLoading && deck.length === 0 && feed.data?.paused && (
          <EmptyState icon={<PauseCircle className="size-8" />} title={t('rhythm.pausedEmptyTitle')}>
            <p>{t('rhythm.pausedEmptyText')}</p>
            <div className="mt-4 flex justify-center"><Button onClick={() => void resume()}>{t('rhythm.resume')}</Button></div>
          </EmptyState>
        )}
        {!feed.isLoading && deck.length === 0 && !feed.data?.paused && (
          <EmptyState icon={<Heart className="size-8" />} title={t('discover.emptyTitle')}>
            <p>{t('discover.emptyText')}</p>
            <div className="mt-4 flex justify-center gap-2"><Button variant="outline" onClick={() => feed.refetch()} loading={feed.isFetching}>{t('discover.refresh')}</Button><Link href="/profile#filters"><Button>{t('discover.editFilters')}</Button></Link></div>
          </EmptyState>
        )}
        {[...deck.slice(0, 2)].reverse().map((c) => (
          <SwipeCard key={c.id} card={c} top={c.id === top?.id} leaving={leaving?.id === c.id ? leaving.dir : null} onDecide={decide} onGone={onGone} onInfo={() => setDetail(c)} />
        ))}
      </div>

      {top && (
        <div className="flex items-center justify-center gap-4" role="group" aria-label={t('discover.actions')}>
          <button type="button" onClick={rewind} aria-label={t('discover.rewind')} className="flex size-11 items-center justify-center rounded-full bg-card text-gold-ink shadow-soft ring-1 ring-line hover:bg-soft"><RotateCcw className="size-5" /></button>
          <button type="button" onClick={() => decide('left')} aria-label={t('discover.pass')} className="flex size-16 items-center justify-center rounded-full bg-card text-navy shadow-soft ring-1 ring-line transition hover:scale-105 hover:bg-soft"><X className="size-7" /></button>
          <button type="button" onClick={() => decide('up')} aria-label={t('discover.superLike')} className="flex size-12 items-center justify-center rounded-full bg-card text-sky-600 shadow-soft ring-1 ring-line transition hover:scale-105 hover:bg-soft"><Star className="size-5 fill-current" /></button>
          <button type="button" onClick={() => decide('right')} aria-label={t('discover.likeBtn')} className="flex size-16 items-center justify-center rounded-full bg-linear-to-br from-brand-strong to-brand-strong-2 text-white shadow-pop transition hover:scale-105"><Heart className="size-7 fill-current" /></button>
        </div>
      )}

      <ProfileSheet card={detail} open={!!detail} onClose={() => setDetail(null)} onDecide={(d) => { setDetail(null); decide(d); }}
        onBlocked={() => { if (detail) setDeck((d) => d.filter((c) => c.id !== detail.id)); setDetail(null); }}
        onLiked={(r) => { if (detail) setDeck((d) => d.filter((c) => c.id !== detail.id)); setDetail(null); void qc.invalidateQueries({ queryKey: ['usage'] }); if (r.matched && r.match) showMatch({ matchId: r.match.id, conversationId: r.match.conversationId, user: r.match.user ?? detail ?? null }); }} />

      {top && <p className="text-center text-xs text-muted">{t('discover.sheetHint')}</p>}

      <Dialog open={!!upsell} onClose={() => setUpsell(null)} title={t(upsell === 'DAILY_LIMIT' ? 'discover.limitTitle' : upsell === 'NO_SUPER_LIKES' ? 'discover.noSuperTitle' : 'discover.planTitle')} closeLabel={t('common.close')}>
        <div className="space-y-4">
          <div className="flex size-14 items-center justify-center rounded-full bg-soft text-brand"><Crown className="size-7" /></div>
          <p className="text-muted">{t(upsell === 'DAILY_LIMIT' ? 'discover.limitText' : upsell === 'NO_SUPER_LIKES' ? 'discover.noSuperText' : 'discover.planText')}</p>
          <Link href="/premium"><Button className="w-full" size="lg">{t('app.goPremium')}</Button></Link>
          {upsell === 'NO_SUPER_LIKES' && <Link href="/shop"><Button className="w-full" size="lg" variant="outline">{t('discover.buyPack')}</Button></Link>}
        </div>
      </Dialog>
    </div>
  );
}
