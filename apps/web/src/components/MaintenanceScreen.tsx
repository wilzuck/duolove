'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Clock, RefreshCw, Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Button, Logo } from '@duomatch/ui';
import { FloatingHearts } from '@/components/marketing/FloatingHearts';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';

export interface SiteStatus { maintenance: boolean; messageFr: string | null; messageEn: string | null; since: string | null }
export const useSiteStatus = () => useQuery({ queryKey: ['site', 'status'], queryFn: () => api<SiteStatus>('/site/status'), refetchInterval: 60_000, staleTime: 30_000, retry: false });
export const maintenanceMessage = (s: SiteStatus | undefined, locale: string) => (locale === 'en' ? s?.messageEn : s?.messageFr) || null;

/** Cœur-personnage qui bricole : sourire, clé à molette qui s'agite (animations coupées si l'utilisateur réduit les mouvements). */
function HandyHeart() {
  return (
    <svg viewBox="0 0 160 130" aria-hidden className="nf-beat h-32 w-auto drop-shadow-[0_16px_24px_rgb(233_30_99/.30)] sm:h-36">
      <defs>
        <linearGradient id="mh-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff6b81" /><stop offset=".55" stopColor="#d81b60" /><stop offset="1" stopColor="#c2185b" /></linearGradient>
      </defs>
      <path d="M70 122C30 94 10 72 10 46 10 26 25 12 44 12c12 0 21 6 26 15 5-9 14-15 26-15 19 0 34 14 34 34 0 26-20 48-60 76z" fill="url(#mh-g)" />
      <g className="mh-eyes" style={{ transformOrigin: '70px 52px' }}>
        <circle cx="54" cy="52" r="6" fill="#fff" /><circle cx="86" cy="52" r="6" fill="#fff" />
        <circle cx="55.5" cy="53.5" r="3" fill="#3b0a1e" /><circle cx="87.5" cy="53.5" r="3" fill="#3b0a1e" />
      </g>
      <path d="M58 70q12 11 24 0" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" fill="none" />
      <circle cx="44" cy="66" r="5" fill="#ffb3c1" opacity=".7" /><circle cx="96" cy="66" r="5" fill="#ffb3c1" opacity=".7" />
      <path className="mh-spark" style={{ animationDelay: '0s' }} d="M18 12l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z" fill="#f5b301" />
      <path className="mh-spark" style={{ animationDelay: '.8s' }} d="M140 14l2 4.5 4.5 2-4.5 2-2 4.5-2-4.5-4.5-2 4.5-2z" fill="#ff6b81" />
      <path className="mh-spark" style={{ animationDelay: '1.6s' }} d="M150 110l1.8 4 4 1.8-4 1.8-1.8 4-1.8-4-4-1.8 4-1.8z" fill="#f5b301" />
      <g className="mh-wrench" style={{ transformOrigin: '118px 92px' }}>
        <path d="M112 86l26-26a12 12 0 0 1 16-14l-8 8 2 7 7 2 8-8a12 12 0 0 1-14 16l-26 26z" fill="#f5b301" stroke="#8a6400" strokeWidth="2.5" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

const TIP_KEYS = Array.from({ length: 12 }, (_, i) => `t${i + 1}`);
const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j]!, b[i]!]; } return b; };
const DOTS = 5;  // nombre de points de progression affichés

/** Écran affiché aux membres pendant la maintenance, dans le style des pages d'erreur Crushduo. Vérifie toutes les 30 s si le site est revenu. */
export function MaintenanceScreen({ onRetry, retrying }: { onRetry: () => void; retrying?: boolean }) {
  const t = useTranslations();
  const locale = useLocale();
  const status = useSiteStatus();
  const qc = useQueryClient();
  const retry = useRef(onRetry);
  useEffect(() => { retry.current = onRetry; }, [onRetry]);
  useEffect(() => { const id = window.setInterval(() => retry.current(), 30_000); return () => window.clearInterval(id); }, []);
  // Quand le site revient (cet écran disparaît), le bandeau de maintenance est mis à jour tout de suite.
  useEffect(() => () => { void qc.invalidateQueries({ queryKey: ['site', 'status'] }); }, [qc]);
  const msg = maintenanceMessage(status.data, locale);
  // Idées tirées au hasard à chaque visite (après l'affichage : rendu serveur et navigateur identiques).
  const [order, setOrder] = useState<string[]>(TIP_KEYS);
  const [tip, setTip] = useState(0);
  useEffect(() => {
    const first = window.setTimeout(() => setOrder(shuffle(TIP_KEYS)), 0);
    const id = window.setInterval(() => setTip((n) => n + 1), 6000);
    return () => { window.clearTimeout(first); window.clearInterval(id); };
  }, []);
  const tipKey = order[tip % order.length]!;
  return (
    <main id="main" role="status" className="hero-glow relative flex min-h-dvh flex-col items-center overflow-hidden px-6 pb-16 text-center">
      <FloatingHearts />
      <header className="relative z-10 flex h-16 w-full max-w-7xl items-center justify-center sm:justify-start"><Link href="/" aria-label={t('nav.home')}><Logo /></Link></header>
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-5 py-4">
        <p className="rounded-full bg-card px-4 py-1.5 text-sm font-semibold text-brand-ink shadow-soft">{t('maintenance.badge')}</p>
        <HandyHeart />
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">{t('maintenance.title')}</h1>
        <p className="max-w-md text-lg text-fg/80 text-balance">{t('maintenance.text')}</p>
        {msg && (
          <p className="flex max-w-md items-center gap-3 rounded-2xl border border-brand/25 bg-card px-5 py-3 text-left font-semibold shadow-soft">
            <Clock className="size-5 shrink-0 text-brand-ink" aria-hidden />{msg}
          </p>
        )}
        <div className="w-full max-w-md rounded-3xl bg-card/90 p-5 text-left shadow-soft">
          <p className="flex items-center gap-2 text-sm font-bold text-brand-ink"><Sparkles className="size-4" aria-hidden />{t('maintenance.meanwhile')}</p>
          <p key={tipKey} aria-live="polite" className="mt-2 min-h-12 text-fg/90 motion-safe:animate-[fade-up_.5s_ease-out]">{t(`maintenance.tips.${tipKey}` as never)}</p>
          <div aria-hidden className="mt-3 flex gap-1.5">{Array.from({ length: DOTS }, (_, i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === tip % DOTS ? 'w-6 bg-brand-strong' : 'w-1.5 bg-line'}`} />)}</div>
        </div>
        <p className="flex max-w-xs items-start gap-2 text-left text-sm text-muted sm:max-w-none sm:items-center">
          <span aria-hidden className="relative mt-[0.4em] flex size-2.5 shrink-0 sm:mt-0"><span className="absolute inline-flex size-full rounded-full bg-green-400 opacity-75 motion-safe:animate-ping" /><span className="relative inline-flex size-2.5 rounded-full bg-green-500" /></span>
          {t('maintenance.auto')}
        </p>
        <div className="flex flex-col items-stretch gap-3 pt-1 sm:flex-row">
          <Button size="lg" className="h-14 px-8 text-base" onClick={onRetry} loading={retrying}><RefreshCw className="size-5" aria-hidden />{t('errorPage.retry')}</Button>
          <Link href="/blog"><Button size="lg" variant="outline" className="h-14 w-full border-brand-strong bg-transparent px-8 text-base text-brand-ink hover:bg-soft sm:w-auto"><BookOpen className="size-5" aria-hidden />{t('maintenance.readBlog')}</Button></Link>
        </div>
      </div>
    </main>
  );
}
