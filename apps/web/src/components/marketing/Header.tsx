'use client';
import { Menu, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, IconButton, Logo } from '@duomatch/ui';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from '../LocaleSwitcher';
import { ThemeToggle } from '../ThemeToggle';

const LINKS = [
  ['/how-it-works', 'nav.how'], ['/pricing', 'nav.pricing'], ['/about', 'nav.about'], ['/blog', 'nav.blog'], ['/help', 'nav.help'],
] as const;

export function MarketingHeader() {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" aria-label={t('nav.home')}><Logo /></Link>
        <nav aria-label={t('nav.main')} className="hidden items-center gap-1 lg:flex">
          {LINKS.map(([href, key]) => (
            <Link key={href} href={href} className="rounded-full px-3 py-2 text-sm font-medium whitespace-nowrap text-muted hover:bg-soft hover:text-fg xl:px-4">{t(key)}</Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div className="hidden items-center gap-1 md:flex"><LocaleSwitcher /><ThemeToggle /></div>
          <Link href="/login" className="hidden sm:block"><Button variant="ghost" size="sm">{t('nav.login')}</Button></Link>
          <Link href="/register"><Button size="sm">{t('nav.register')}</Button></Link>
          <IconButton label={open ? t('common.close') : t('nav.menu')} tone="plain" className="lg:hidden" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen(!open)}>
            {open ? <X className="size-6" /> : <Menu className="size-6" />}
          </IconButton>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label={t('nav.main')} className="border-t border-line bg-bg px-4 pb-4 lg:hidden">
          <ul className="flex flex-col py-2">
            {LINKS.map(([href, key]) => <li key={href}><Link href={href} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-3 font-medium hover:bg-soft">{t(key)}</Link></li>)}
            <li><Link href="/login" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-3 font-medium hover:bg-soft sm:hidden">{t('nav.login')}</Link></li>
          </ul>
          <div className="flex items-center gap-2 pt-2 sm:hidden"><LocaleSwitcher /><ThemeToggle /></div>
        </nav>
      )}
    </header>
  );
}
