import { useTranslations } from 'next-intl';
import { Logo } from '@duomatch/ui';
import { Link } from '@/i18n/navigation';

const COLS = [
  ['footer.product', [['/how-it-works', 'nav.how'], ['/pricing', 'nav.pricing'], ['/blog', 'nav.blog']]],
  ['footer.company', [['/about', 'nav.about'], ['/contact', 'nav.contact'], ['/help', 'nav.help']]],
  ['footer.legal', [['/legal/terms', 'legal.terms.title'], ['/legal/privacy', 'legal.privacy.title'], ['/legal/cookies', 'legal.cookies.title'], ['/legal/community', 'legal.community.title']]],
] as const;

export function MarketingFooter() {
  const t = useTranslations();
  return (
    <footer className="border-t border-line bg-soft/50">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm text-muted">{t('meta.tagline')}</p>
          <p className="text-sm text-muted">{t('footer.adults')}</p>
        </div>
        {COLS.map(([title, links]) => (
          <nav key={title} aria-label={t(title)}>
            <h2 className="mb-3 text-sm font-bold">{t(title)}</h2>
            <ul className="space-y-2 text-sm">
              {links.map(([href, key]) => <li key={href}><Link href={href} className="text-muted hover:text-brand-ink">{t(key)}</Link></li>)}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line py-5 text-center text-xs text-muted">© {new Date().getFullYear()} DuoMatch — {t('footer.rights')}</div>
    </footer>
  );
}
