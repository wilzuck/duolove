import { BadgeCheck, Heart, HeartHandshake, Lock, ShieldCheck, Sparkles, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Logo } from '@duomatch/ui';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from '../LocaleSwitcher';
import { SiteLinks } from '../SiteLinks';
import { ThemeToggle } from '../ThemeToggle';

const SIDE_ICONS: Record<'login' | 'register', LucideIcon[]> = { login: [Heart, Lock, Sparkles], register: [Sparkles, BadgeCheck, ShieldCheck, Lock] };

/** Page d'authentification. Avec `side`, un panneau d'accueil chaleureux accompagne le formulaire sur grand écran ; sans, la carte est centrée. */
export function AuthShell({ title, subtitle, children, footer, side }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; side?: 'login' | 'register' }) {
  const t = useTranslations();
  const points = side ? (t.raw(`auth.side.${side}.points`) as string[]) : [];
  const card = (
    <div className="w-full">
      <div className="rounded-[2rem] border border-line bg-card p-7 shadow-pop sm:p-9">
        <h1 className="text-3xl font-extrabold">{title}</h1>
        {subtitle && <p className="mt-2 text-muted">{subtitle}</p>}
        <div className="mt-7">{children}</div>
      </div>
      {footer && <p className="mt-6 text-center text-sm text-muted">{footer}</p>}
    </div>
  );
  return (
    <div className="hero-glow flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/"><Logo /></Link>
        <div className="flex items-center gap-1"><LocaleSwitcher /><ThemeToggle /></div>
      </header>
      {side ? (
        <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-4 pb-12 lg:grid-cols-[1fr_28rem]">
          <aside aria-labelledby="side-h" className="hidden lg:block">
            <p className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-1.5 text-sm font-semibold text-brand-ink shadow-soft"><HeartHandshake className="size-4" aria-hidden />{t(`auth.side.${side}.kicker`)}</p>
            <h2 id="side-h" className="mt-6 text-balance text-5xl font-extrabold leading-tight">{t(`auth.side.${side}.title`)}</h2>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted">{t(`auth.side.${side}.text`)}</p>
            <ul className="mt-8 space-y-4">
              {points.map((p, i) => {
                const Icon = SIDE_ICONS[side][i] ?? Heart;
                return <li key={p} className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-card text-brand-ink shadow-soft"><Icon className="size-5" aria-hidden /></span><span className="pt-1.5 leading-relaxed">{p}</span></li>;
              })}
            </ul>
          </aside>
          <div className="mx-auto w-full max-w-md lg:max-w-none">{card}</div>
        </main>
      ) : (
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-12">{card}</main>
      )}
      <SiteLinks />
    </div>
  );
}
