import { ArrowRight, Compass, Home } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button, Logo } from '@duomatch/ui';
import { FloatingHearts } from '@/components/marketing/FloatingHearts';
import { FixableHeart, NotFoundHint, NotFoundLine } from '@/components/marketing/NotFoundFun';
import { Link } from '@/i18n/navigation';

const LINKS = [['/how-it-works', 'nav.how'], ['/pricing', 'nav.pricing'], ['/blog', 'nav.blog'], ['/help', 'nav.help']] as const;

export default function NotFound() {
  const t = useTranslations();
  return (
    <main id="main" className="hero-glow relative flex min-h-dvh flex-col items-center overflow-hidden px-6 pb-16 text-center">
      <FloatingHearts />
      <header className="relative z-10 flex h-16 w-full max-w-7xl items-center justify-center sm:justify-start"><Link href="/" aria-label={t('nav.home')}><Logo /></Link></header>
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 py-8">
        <p className="rounded-full bg-card px-4 py-1.5 text-sm font-semibold text-brand-ink shadow-soft">{t('notFound.badge')}</p>
        <div aria-hidden className="flex items-center justify-center gap-1 font-display text-[6.5rem] leading-none font-extrabold sm:gap-3 sm:text-[9rem] md:text-[12rem]">
          <span className="bg-linear-to-br from-brand-strong to-brand-strong-2 bg-clip-text text-transparent">4</span>
          <FixableHeart />
          <span className="bg-linear-to-br from-brand-strong to-brand-strong-2 bg-clip-text text-transparent">4</span>
        </div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">{t('notFound.title')}</h1>
        <NotFoundLine />
        <NotFoundHint />
        <div className="flex flex-col items-stretch gap-3 pt-1 sm:flex-row">
          <Link href="/"><Button size="lg" className="h-14 w-full px-8 text-base sm:w-auto"><Home className="size-5" aria-hidden />{t('common.backHome')}</Button></Link>
          <Link href="/discover"><Button size="lg" variant="outline" className="h-14 w-full border-brand-strong bg-transparent px-8 text-base text-brand-ink hover:bg-soft sm:w-auto"><Compass className="size-5" aria-hidden />{t('notFound.discover')}<ArrowRight className="size-5" aria-hidden /></Button></Link>
        </div>
        <nav aria-label={t('notFound.usefulLinks')} className="mt-4 flex flex-wrap justify-center gap-2">
          {LINKS.map(([href, key]) => <Link key={href} href={href} className="rounded-full border border-line bg-card/80 px-4 py-2 text-sm font-semibold text-muted transition hover:bg-soft hover:text-fg">{t(key)}</Link>)}
        </nav>
      </div>
    </main>
  );
}
