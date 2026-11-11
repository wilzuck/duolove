import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { SUPPORT_EMAIL } from '@/lib/site';

const COLS = [
  ['footer.product', [['/how-it-works', 'nav.how'], ['/pricing', 'nav.pricing'], ['/blog', 'nav.blog'], ['/register', 'nav.register'], ['/login', 'nav.login']]],
  ['footer.company', [['/about', 'nav.about'], ['/contact', 'nav.contact'], ['/help', 'nav.help'], ['/install', 'nav.install']]],
  ['footer.legal', [['/legal/terms', 'legal.terms.title'], ['/legal/privacy', 'legal.privacy.title'], ['/legal/cookies', 'legal.cookies.title'], ['/legal/community', 'legal.community.title']]],
] as const;

export function MarketingFooter() {
  const t = useTranslations();
  return (
    <footer className="border-t border-line bg-soft/50">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 py-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-3">
          <p className="max-w-xs text-sm text-muted">{t('meta.tagline')}</p>
          <p className="text-sm text-muted">{t('footer.adults')}</p>
          <p className="text-sm"><a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-brand-ink underline-offset-4 hover:underline">{SUPPORT_EMAIL}</a></p>
        </div>
        {COLS.map(([title, links]) => (
          <nav key={title} aria-label={t(title)}>
            <h2 className="mb-3 text-sm font-bold">{t(title)}</h2>
            <ul className="space-y-2 text-sm">
              {links.map(([href, key]) => <li key={href}><Link href={href} className="font-medium text-muted hover:text-brand-ink">{t(key)}</Link></li>)}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line py-5 text-center text-xs text-muted">© {new Date().getFullYear()} CrushDuo — {t('footer.rights')}</div>
    </footer>
  );
}
