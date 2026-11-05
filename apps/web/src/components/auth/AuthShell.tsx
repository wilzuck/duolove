import type { ReactNode } from 'react';
import { Logo } from '@duomatch/ui';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from '../LocaleSwitcher';
import { SiteLinks } from '../SiteLinks';
import { ThemeToggle } from '../ThemeToggle';

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="hero-glow flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/"><Logo /></Link>
        <div className="flex items-center gap-1"><LocaleSwitcher /><ThemeToggle /></div>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-12">
        <div className="rounded-[2rem] border border-line bg-card p-7 shadow-pop sm:p-9">
          <h1 className="text-3xl font-extrabold">{title}</h1>
          {subtitle && <p className="mt-2 text-muted">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
        {footer && <p className="mt-6 text-center text-sm text-muted">{footer}</p>}
      </main>
      <SiteLinks />
    </div>
  );
}
