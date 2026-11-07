'use client';
import { useEffect, useState } from 'react';

type Bubble = { id: number; left: number; size: number; duration: number; drift: number; tone: 'light' | 'deep' };

/** Petits cœurs roses (clair et foncé) qui jaillissent du bas de l'écran à des moments aléatoires. Décoratif : masqué aux lecteurs d'écran, sans clic, absent si l'utilisateur réduit les animations. */
export function FloatingHearts() {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let id = 0;
    let timer: number;
    const spawn = () => {
      if (!document.hidden) {
        const b: Bubble = {
          id: id++,
          left: 3 + Math.random() * 94,
          size: 14 + Math.random() * 22,
          duration: 5 + Math.random() * 5,
          drift: (Math.random() - 0.5) * 120,
          tone: Math.random() < 0.5 ? 'light' : 'deep',
        };
        setBubbles((list) => [...list.slice(-11), b]);
      }
      timer = window.setTimeout(spawn, 400 + Math.random() * 2600);
    };
    timer = window.setTimeout(spawn, 600 + Math.random() * 1200);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
      {bubbles.map((b) => (
        <svg
          key={b.id}
          viewBox="0 0 24 24"
          className={`heart-float ${b.tone === 'light' ? 'text-[#ff9db1]' : 'text-[#c2185b]'}`}
          style={{ left: `${b.left}%`, width: b.size, height: b.size, animationDuration: `${b.duration}s`, ['--drift' as string]: `${b.drift}px` }}
          onAnimationEnd={() => setBubbles((list) => list.filter((x) => x.id !== b.id))}
        >
          <path fill="currentColor" d="M12 21s-7.5-4.6-9.6-9.3C.9 8.2 2.8 4.5 6.4 4.5c2 0 3.7 1.1 5.6 3.2 1.9-2.1 3.6-3.2 5.6-3.2 3.6 0 5.5 3.700 4 7.200C19.500 16.400 12 21 12 21z" />
        </svg>
      ))}
    </div>
  );
}
