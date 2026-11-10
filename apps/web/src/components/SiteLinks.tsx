import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

const LINKS = [
  ['/about', 'nav.about'], ['/blog', 'nav.blog'], ['/help', 'nav.help'], ['/contact', 'nav.contact'], ['/install', 'nav.install'],
  ['/legal/terms', 'legal.terms.title'], ['/legal/privacy', 'legal.privacy.title'], ['/legal/cookies', 'legal.cookies.title'], ['/legal/community', 'legal.community.title'],
] as const;

/** Libellés courts de l'espace membre : le pied de page y tient sur une seule ligne. */
const SHORT: Record<string, string> = {
  '/install': 'footer.short.install', '/legal/terms': 'footer.short.terms', '/legal/privacy': 'footer.short.privacy', '/legal/cookies': 'footer.short.cookies', '/legal/community': 'footer.short.community',
};

/** Pied de page compact (pages de connexion et espace membre) : mêmes liens que le pied de page public, sans l'habillage marketing. */
export function SiteLinks({ className = '', variant = 'public' }: { className?: string; variant?: 'public' | 'app' }) {
  const t = useTranslations();
  // Espace membre : une seule ligne, liens séparés par un filet vertical, mention légale à droite (comme un tableau de bord).
  if (variant === 'app') {
    return (
      <footer className={`flex flex-wrap items-center gap-x-4 gap-y-2 bg-card px-4 py-3 text-xs text-muted lg:sticky lg:bottom-0 lg:z-20 lg:px-8 ${className}`}>
        <nav aria-label={t('footer.links')}>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:gap-x-0">
            {LINKS.map(([href, key]) => <li key={href} className="sm:border-l sm:border-line sm:px-3 sm:first:border-0 sm:first:pl-0"><Link href={href} className="text-fg underline-offset-4 hover:text-brand-ink hover:underline">{t((SHORT[href] ?? key) as never)}</Link></li>)}
          </ul>
        </nav>
        <p className="whitespace-nowrap lg:ml-auto">© {new Date().getFullYear()} CrushDuo · {t('footer.adultsShort')}</p>
      </footer>
    );
  }
  return (
    <footer className={`px-4 py-6 text-center text-xs text-muted ${className}`}>
      <nav aria-label={t('footer.links')}>
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-2">
          {LINKS.map(([href, key]) => <li key={href}><Link href={href} className="font-medium text-fg underline-offset-4 hover:text-brand-ink hover:underline">{t(key)}</Link></li>)}
        </ul>
      </nav>
      <p className="mt-3">© {new Date().getFullYear()} CrushDuo · {t('footer.adults')}</p>
    </footer>
  );
}
