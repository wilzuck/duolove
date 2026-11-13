'use client';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

const LINES = Array.from({ length: 20 }, (_, i) => `l${i + 1}`);
const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j]!, b[i]!]; } return b; };
const BURST = Array.from({ length: 10 }, (_, i) => i);

/** Cœur brisé qu'on répare d'un clic (les deux moitiés se recollent, gerbe de petits cœurs), entre les deux « 4 ». */
export function FixableHeart() {
  const t = useTranslations();
  const [fixed, setFixed] = useState(false);
  const [burst, setBurst] = useState(0);
  const fix = () => { const next = !fixed; setFixed(next); setBurst((n) => n + 1); window.dispatchEvent(new CustomEvent('crushduo:heart', { detail: next })); };
  return (
    <span className="relative inline-flex">
      <button type="button" onClick={fix} aria-pressed={fixed} aria-label={t(fixed ? 'notFound.breakAgain' : 'notFound.fix')} title={t(fixed ? 'notFound.breakAgain' : 'notFound.fix')}
        className="cursor-pointer rounded-full transition-transform hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-brand">
        <svg viewBox="0 0 120 108" aria-hidden className={`nf-beat h-[5.5rem] w-auto drop-shadow-[0_14px_20px_rgb(233_30_99/.28)] sm:h-32 md:h-40 ${fixed ? 'nf-fixed' : ''}`}>
          <defs>
            <linearGradient id="nf-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff6b81" /><stop offset=".55" stopColor="#d81b60" /><stop offset="1" stopColor="#c2185b" /></linearGradient>
          </defs>
          <g className="nf-left"><path d="M60 102C24 76 6 56 6 34 6 18 18 6 33 6c11 0 21 6 27 16l-9 14 12 12-10 14 11 14z" fill="url(#nf-g)" /></g>
          <g className="nf-right"><path d="M60 102C96 76 114 56 114 34 114 18 102 6 87 6 76 6 66 12 60 22l-9 14 12 12-10 14 11 14z" fill="url(#nf-g)" opacity=".92" /></g>
          {fixed && <path className="nf-shine" d="M38 22c-8 2-14 9-14 18" stroke="#fff" strokeWidth="5" strokeLinecap="round" fill="none" opacity=".55" />}
        </svg>
      </button>
      {burst > 0 && fixed && (
        <span key={burst} aria-hidden className="pointer-events-none absolute inset-0">
          {BURST.map((i) => (
            <span key={i} className="nf-burst absolute top-1/2 left-1/2 text-brand-strong" style={{ ['--a' as string]: `${i * 36}deg`, ['--d' as string]: `${70 + (i % 3) * 18}px`, fontSize: `${12 + (i % 3) * 5}px` }}>♥</span>
          ))}
        </span>
      )}
      <span className="sr-only" aria-live="polite">{fixed ? t('notFound.fixed') : ''}</span>
    </span>
  );
}

/** Phrase drôle qui change toutes les 5 secondes ; un clic sur le cœur affiche un message de victoire. */
export function NotFoundLine() {
  const t = useTranslations();
  // Ordre tiré au hasard à chaque visite (après l'affichage, pour que le rendu serveur et le navigateur coïncident) : jamais la même série.
  const [order, setOrder] = useState<string[] | null>(null);
  const [i, setI] = useState(0);
  useEffect(() => {
    const first = window.setTimeout(() => setOrder(shuffle(LINES)), 0);
    const id = window.setInterval(() => setI((n) => n + 1), 5000);
    return () => { window.clearTimeout(first); window.clearInterval(id); };
  }, []);
  const key = order ? order[i % order.length]! : null;
  return <p key={key ?? 'wait'} className="max-w-md min-h-14 text-lg text-fg/80 text-balance motion-safe:animate-[fade-up_.5s_ease-out]">{key ? t(`notFound.lines.${key}` as never) : '\u00a0'}</p>;
}

/** Indice sous le titre ; devient un message de victoire quand le cœur est réparé. */
export function NotFoundHint() {
  const t = useTranslations();
  const [fixed, setFixed] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setFixed(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener('crushduo:heart', on);
    return () => window.removeEventListener('crushduo:heart', on);
  }, []);
  return <p key={String(fixed)} className={`-mt-2 text-sm motion-safe:animate-[fade-up_.4s_ease-out] ${fixed ? 'font-semibold text-brand-ink' : 'text-muted'}`}>{t(fixed ? 'notFound.fixedMsg' : 'notFound.hint')}</p>;
}
