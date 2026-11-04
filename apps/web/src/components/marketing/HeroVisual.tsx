'use client';
import { Heart, MessageCircle, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';

const CARDS = [
  { name: 'Aïcha', age: 27, city: 'Cotonou', hue: 345, rot: -9, x: -70 },
  { name: 'Koffi', age: 30, city: 'Abidjan', hue: 15, rot: 8, x: 70 },
  { name: 'Mina', age: 26, city: 'Lomé', hue: 330, rot: 0, x: 0 },
] as const;

/** Illustration du produit : cartes de démonstration générées (aucune vraie personne). */
export function HeroVisual() {
  const t = useTranslations();
  return (
    <div className="relative mx-auto h-[26rem] w-full max-w-md sm:h-[30rem]" aria-hidden>
      {CARDS.map((c, i) => (
        <motion.div key={c.name} initial={{ opacity: 0, y: 30, rotate: 0 }} animate={{ opacity: 1, y: 0, rotate: c.rot, x: c.x }} transition={{ delay: 0.1 * i, type: 'spring', stiffness: 80, damping: 14 }}
          className="absolute top-6 left-1/2 h-[21rem] w-60 -translate-x-1/2 overflow-hidden rounded-[2rem] shadow-pop sm:h-[24rem] sm:w-64"
          style={{ background: `linear-gradient(160deg, hsl(${c.hue} 90% 68%), hsl(${(c.hue + 35) % 360} 80% 42%))`, zIndex: i === 2 ? 3 : 1 }}>
          <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/60 to-transparent p-5 pt-16 text-white">
            <p className="font-display text-xl font-bold">{c.name}, {c.age}</p>
            <p className="text-sm text-white/85">{c.city}</p>
          </div>
          <span className="absolute inset-0 flex items-center justify-center font-display text-8xl font-extrabold text-white/30">{c.name[0]}</span>
        </motion.div>
      ))}
      <div className="absolute inset-x-0 bottom-0 z-10 flex justify-center gap-5">
        <span className="flex size-14 items-center justify-center rounded-full bg-card shadow-pop"><X className="size-6 text-muted" /></span>
        <span className="flex size-16 items-center justify-center rounded-full bg-linear-to-br from-brand-strong to-brand-strong-2 text-white shadow-pop"><Heart className="size-7 fill-current" /></span>
      </div>
      <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.7 }}
        className="absolute top-2 right-0 z-10 flex items-center gap-2 rounded-2xl bg-card px-4 py-2.5 text-sm font-semibold shadow-pop sm:right-4">
        <MessageCircle className="size-4 text-brand" />{t('home.heroMatch')}
      </motion.div>
    </div>
  );
}
