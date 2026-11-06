import type { ReactNode } from 'react';
import { Logo } from '@duomatch/ui';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from '../LocaleSwitcher';
import { SiteLinks } from '../SiteLinks';
import { ThemeToggle } from '../ThemeToggle';

/** `backdrop` : photo décorative plein cadre (le sujet reste visible à droite sur grand écran, la carte du formulaire se place à gauche, sur la partie dégagée de l'image). */
export function AuthShell({ title, subtitle, children, footer, backdrop }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; backdrop?: string }) {
  return (
    <div className="hero-glow relative isolate flex min-h-dvh flex-col overflow-hidden">
      {backdrop && <img src={backdrop} alt="" aria-hidden decoding="async" fetchPriority="high" className="fixed inset-0 -z-10 size-full object-cover object-[78%_center] lg:object-right [[data-theme=dark]_&]:brightness-75" />}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/"><Logo /></Link>
        <div className={`flex items-center gap-1${backdrop ? ' rounded-full bg-card/80 px-1 backdrop-blur' : ''}`}><LocaleSwitcher /><ThemeToggle /></div>
      </header>
      <main className={`mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-16 sm:pb-24${backdrop ? ' lg:mx-0 lg:ml-[max(2rem,7vw)]' : ''}`}>
        <div className="rounded-[2rem] border border-line bg-card p-7 shadow-pop sm:p-9">
          <h1 className="text-3xl font-extrabold">{title}</h1>
          {subtitle && <p className="mt-2 text-muted">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
        {footer && <p className="mt-6 text-center text-sm text-muted">{footer}</p>}
      </main>
      <SiteLinks className={backdrop ? 'bg-card/80 backdrop-blur' : undefined} />
    </div>
  );
}
