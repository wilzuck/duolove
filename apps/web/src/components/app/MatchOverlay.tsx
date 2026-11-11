'use client';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Heart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@duomatch/ui';
import { useMyProfile } from '@/hooks/useQueries';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useUi } from '@/lib/store';
import type { Card } from '@/lib/types';

/** Célébration d'un duo (like réciproque) (déclenchée par la réponse au swipe ou par l'événement temps réel). */
export function MatchOverlay() {
  const t = useTranslations();
  const router = useRouter();
  const match = useUi((s) => s.match);
  const show = useUi((s) => s.showMatch);
  const { data: mine } = useMyProfile();
  const other = useQuery({
    queryKey: ['profile', match?.user?.id], enabled: !!match?.user?.id && !match.user.photos.length,
    queryFn: () => api<Card>(`/profiles/${match!.user!.id}`),
  });
  const o = match?.user?.photos.length ? match.user : other.data;
  const close = () => show(null);
  const still = useReducedMotion();
  return (
    <AnimatePresence>
      {match && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label={t('match.title')}
          className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-8 overflow-hidden p-6 text-white"
          style={{ background: 'radial-gradient(70% 55% at 15% 10%, rgb(255 138 166 / .55), transparent 62%), radial-gradient(60% 50% at 90% 20%, rgb(255 190 120 / .38), transparent 60%), radial-gradient(80% 60% at 50% 105%, rgb(88 16 110 / .85), transparent 70%), linear-gradient(160deg, #e0185f 0%, #b3125a 48%, #6a1b9a 100%)' }}>
          {[{ c: 'bg-pink-300/45 -top-28 -left-24 size-80', d: 9 }, { c: 'bg-amber-300/30 top-1/3 -right-28 size-72', d: 11 }, { c: 'bg-fuchsia-400/35 -bottom-32 left-1/4 size-96', d: 13 }].map((o, i) => (
            <motion.span key={i} aria-hidden className={`pointer-events-none absolute rounded-full blur-3xl ${o.c}`} animate={still ? undefined : { x: [0, 30, -20, 0], y: [0, -24, 18, 0], scale: [1, 1.08, 0.95, 1] }} transition={{ duration: o.d, repeat: Infinity, ease: 'easeInOut' }} />
          ))}
          {Array.from({ length: 14 }).map((_, i) => (
            <motion.span key={i} aria-hidden initial={{ y: 40, opacity: 0, scale: 0.4 }} animate={{ y: -420 - (i % 5) * 60, opacity: [0, 1, 0], scale: 1 }} transition={{ duration: 3.2 + (i % 4) * 0.5, repeat: Infinity, delay: i * 0.25 }}
              style={{ left: `${(i * 7 + 5) % 95}%` }} className="pointer-events-none absolute bottom-0"><Heart className="size-6 fill-white/70 text-white/70" /></motion.span>
          ))}
          <div className="relative flex items-center">
            {[mine?.photos[0]?.url, o?.photos[0]?.url].map((src, i) => (
              <motion.div key={i} initial={{ x: i ? 80 : -80, rotate: 0, opacity: 0 }} animate={{ x: 0, rotate: i ? 7 : -7, opacity: 1 }} transition={{ type: 'spring', delay: 0.15 }}
                className="size-40 overflow-hidden rounded-3xl border-4 border-white bg-white/20 shadow-pop first:-mr-6 sm:size-48">
                {src ? <img src={src} alt="" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center font-display text-5xl font-extrabold">{i ? (o?.displayName ?? '?')[0] : (mine?.displayName ?? '?')[0]}</div>}
              </motion.div>
            ))}
          </div>
          <div className="text-center">
            <h2 className="font-display text-5xl font-extrabold">{t('match.title')}</h2>
            <p className="mt-2 text-lg text-white/90">{o?.displayName ? t('match.text', { name: o.displayName }) : t('match.textGeneric')}</p>
          </div>
          <div className="flex w-full max-w-xs flex-col gap-3">
            <Button size="lg" className="bg-white text-[#c2185b] hover:bg-white/90" variant="ghost" onClick={() => { const id = match.conversationId; close(); router.push(`/messages/${id}`); }}>{t('match.chat')}</Button>
            <button onClick={close} className="py-2 font-semibold underline underline-offset-4">{t('match.keep')}</button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
