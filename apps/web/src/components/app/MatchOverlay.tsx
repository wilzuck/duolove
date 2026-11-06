'use client';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@duomatch/ui';
import { useMyProfile } from '@/hooks/useQueries';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useUi } from '@/lib/store';
import type { Card } from '@/lib/types';

/** Célébration d'un match mutuel (déclenchée par la réponse au swipe ou par l'événement temps réel). */
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
  return (
    <AnimatePresence>
      {match && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label={t('match.title')}
          className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-8 bg-linear-to-b from-brand-strong to-brand-strong-2 p-6 text-white">
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
