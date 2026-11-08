import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { SUPPORT_EMAIL } from '@/lib/site';

const LINKS = [
  ['/about', 'nav.about'], ['/blog', 'nav.blog'], ['/help', 'nav.help'], ['/contact', 'nav.contact'],
  ['/legal/terms', 'legal.terms.title'], ['/legal/privacy', 'legal.privacy.title'], ['/legal/cookies', 'legal.cookies.title'], ['/legal/community', 'legal.community.title'],
] as const;

/** Pied de page compact (pages de connexion et espace membre) : mêmes liens que le pied de page public, sans l'habillage marketing. */
export function SiteLinks({ className = '' }: { className?: string }) {
  const t = useTranslations();
  return (
    <footer className={`px-4 py-6 text-center text-xs text-muted ${className}`}>
      <nav aria-label={t('footer.links')}>
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-2">
          {LINKS.map(([href, key]) => <li key={href}><Link href={href} className="underline-offset-4 hover:text-brand-ink hover:underline">{t(key)}</Link></li>)}
        </ul>
      </nav>
      <p className="mt-3"><a href={`mailto:${SUPPORT_EMAIL}`} className="underline-offset-4 hover:text-brand-ink hover:underline">{SUPPORT_EMAIL}</a></p>
      <p className="mt-1">© {new Date().getFullYear()} CrushDuo · {t('footer.adults')}</p>
    </footer>
  );
}
