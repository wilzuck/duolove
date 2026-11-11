'use client';
import { motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import { Heart, Sparkles, Star } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

type Kind = 'like' | 'super' | 'pass';
interface Particle { id: number; dx: number; dy: number; rot: number; size: number; delay: number; dur: number; color: string; shape: 'heart' | 'star' | 'spark' | 'dot' }

const COLORS: Record<Kind, string[]> = {
  like: ['#ff3d7f', '#ff6b81', '#e91e63', '#ffb3c6', '#ffd166'],
  super: ['#0ea5e9', '#38bdf8', '#facc15', '#7dd3fc', '#ffffff'],
  pass: ['#94a3b8', '#cbd5e1', '#64748b'],
};
const RING: Record<Kind, string> = { like: 'rgba(233,30,99,.55)', super: 'rgba(14,165,233,.55)', pass: 'rgba(100,116,139,.35)' };

/** Particules lancées en éventail : au hasard (à chaque clic), jamais deux fois la même gerbe. */
function burst(kind: Kind, reach: number): Particle[] {
  const n = kind === 'pass' ? 7 : kind === 'super' ? 16 : 14;
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const d = reach * (0.55 + Math.random() * 0.7);
    return {
      id: i, dx: Math.cos(a) * d, dy: Math.sin(a) * d - (kind === 'pass' ? 0 : reach * 0.25) + (kind === 'pass' ? reach * 0.35 : 0), rot: (Math.random() - 0.5) * 120,
      size: kind === 'pass' ? 5 + Math.random() * 4 : 10 + Math.random() * 12, delay: Math.random() * 0.08, dur: 0.65 + Math.random() * 0.4,
      color: COLORS[kind][i % COLORS[kind].length]!,
      shape: kind === 'pass' ? 'dot' : kind === 'super' ? (i % 3 === 0 ? 'spark' : 'star') : (i % 4 === 3 ? 'spark' : 'heart'),
    };
  });
}

/**
 * Bouton d'action de la découverte (J'aime, Super Like, Passer) avec une animation de validation :
 * rebond du bouton, onde, gerbe de cœurs / étoiles (poussière grise pour « passer »). Respecte « réduire les animations ».
 * `delay` retarde l'action pour laisser voir l'animation quand l'écran se ferme juste après (fiche de profil).
 */
export function ActionButton({ kind, onAct, label, className, children, reach = 110, delay = 0 }: {
  kind: Kind; onAct: () => void; label: string; className: string; children: ReactNode; reach?: number; delay?: number;
}) {
  const reduce = useReducedMotion();
  const controls = useAnimationControls();
  const [parts, setParts] = useState<Particle[]>([]);
  const [run, setRun] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wait = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { clearTimeout(timer.current); clearTimeout(wait.current); }, []);

  const click = () => {
    if (wait.current) return; // un seul déclenchement pendant l'animation différée
    setRun((r) => r + 1);
    if (!reduce) void controls.start(kind === 'pass' ? { rotate: [0, -14, 12, -6, 0], x: [0, -3, 3, -1, 0], scale: [1, 0.9, 1.05, 1] } : { scale: [1, 0.78, 1.32, 0.96, 1], rotate: kind === 'super' ? [0, -12, 12, 0] : [0, -6, 6, 0] }, { duration: kind === 'pass' ? 0.4 : 0.55, ease: 'easeOut' });
    if (!reduce) { setParts(burst(kind, reach)); clearTimeout(timer.current); timer.current = setTimeout(() => setParts([]), 1300); }
    if (delay > 0) wait.current = setTimeout(() => { wait.current = undefined; onAct(); }, delay); else onAct();
  };

  return (
    <span className="relative inline-flex">
      <motion.button type="button" onClick={click} aria-label={label} className={className} animate={controls} whileTap={reduce ? undefined : { scale: 0.9 }}>
        {children}
      </motion.button>
      {!reduce && parts.length > 0 && (
        <span aria-hidden className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
          {kind !== 'pass' && [0, 0.12].map((d) => (
            <motion.span key={`r${run}-${d}`} className="absolute size-full rounded-full border-2" style={{ borderColor: RING[kind] }}
              initial={{ scale: 0.7, opacity: 0.9 }} animate={{ scale: 2.4, opacity: 0 }} transition={{ duration: 0.7, delay: d, ease: 'easeOut' }} />
          ))}
          {parts.map((p) => (
            <motion.span key={`${run}-${p.id}`} className="absolute" style={{ color: p.color }}
              initial={{ x: 0, y: 0, scale: 0.2, opacity: 1, rotate: 0 }}
              animate={{ x: p.dx, y: p.dy + (kind === 'pass' ? 0 : p.dur * 18), scale: [0.2, 1, 0.7], opacity: [1, 1, 0], rotate: p.rot }}
              transition={{ duration: p.dur, delay: p.delay, ease: 'easeOut', times: [0, 0.35, 1] }}>
              {p.shape === 'heart' && <Heart style={{ width: p.size, height: p.size }} className="fill-current" />}
              {p.shape === 'star' && <Star style={{ width: p.size, height: p.size }} className="fill-current" />}
              {p.shape === 'spark' && <Sparkles style={{ width: p.size, height: p.size }} />}
              {p.shape === 'dot' && <span className="block rounded-full bg-current" style={{ width: p.size, height: p.size }} />}
            </motion.span>
          ))}
        </span>
      )}
    </span>
  );
}
