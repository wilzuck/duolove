'use client';
import { Menu, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, IconButton, Logo } from '@duomatch/ui';
import { useSession } from '@/hooks/useQueries';
import { Link, usePathname } from '@/i18n/navigation';
import { LocaleSwitcher } from '../LocaleSwitcher';
import { ThemeToggle } from '../ThemeToggle';

const LINKS = [
  ['/how-it-works', 'nav.how'], ['/pricing', 'nav.pricing'], ['/about', 'nav.about'], ['/blog', 'nav.blog'], ['/help', 'nav.help'],
] as const;

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

export function MarketingHeader() {
  const t = useTranslations();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const member = !!useSession().data?.authenticated;
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-1 px-4 sm:gap-4 sm:px-6">
        <Link href="/" aria-label={t('nav.home')} className="flex items-center"><Logo markOnMobile /></Link>
        <nav aria-label={t('nav.main')} className="hidden items-center gap-1 xl:flex">
          {LINKS.map(([href, key]) => (
            <Link key={href} href={href} aria-current={isActive(pathname, href) ? 'page' : undefined} className={`rounded-full px-3 py-2 text-sm whitespace-nowrap hover:bg-soft xl:px-4 ${isActive(pathname, href) ? 'bg-soft font-bold text-brand-ink underline decoration-2 underline-offset-8' : 'font-medium text-muted hover:text-fg'}`}>{t(key)}</Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <div className="hidden items-center gap-1 md:flex"><LocaleSwitcher /><ThemeToggle /></div>
          {member ? (
            <Link href="/discover"><Button size="sm">{t('nav.openApp')}</Button></Link>
          ) : (
            <>
              <Link href="/login" className="hidden sm:block"><Button variant="ghost" size="sm">{t('nav.login')}</Button></Link>
              <Link href="/register"><Button size="sm">{t('nav.register')}</Button></Link>
            </>
          )}
          <IconButton label={open ? t('common.close') : t('nav.menu')} tone="plain" className="xl:hidden" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen(!open)}>
            {open ? <X className="size-6" /> : <Menu className="size-6" />}
          </IconButton>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label={t('nav.main')} className="border-t border-line bg-bg px-4 pb-4 xl:hidden">
          <ul className="flex flex-col py-2">
            {LINKS.map(([href, key]) => <li key={href}><Link href={href} onClick={() => setOpen(false)} aria-current={isActive(pathname, href) ? 'page' : undefined} className={`block rounded-xl px-3 py-3 hover:bg-soft ${isActive(pathname, href) ? 'bg-soft font-bold text-brand-ink' : 'font-medium'}`}>{t(key)}</Link></li>)}
            {!member && <li><Link href="/login" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-3 font-medium hover:bg-soft sm:hidden">{t('nav.login')}</Link></li>}
          </ul>
          <div className="flex items-center gap-2 pt-2 md:hidden"><LocaleSwitcher /><ThemeToggle /></div>
        </nav>
      )}
    </header>
  );
}
