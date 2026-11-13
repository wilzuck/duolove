'use client';
import { useTranslations } from 'next-intl';
import { cn } from '@duomatch/ui';
import { useEngagementConfig } from '@/hooks/useQueries';
import { Link, usePathname } from '@/i18n/navigation';

/** Pages regroupées sous une entrée du menu : l'entrée reste active et la page affiche ces onglets pour passer de l'une à l'autre. */
const TABS: Record<string, { href: string; key: string }[]> = {
  '/discover': [{ href: '/discover', key: 'app.nav.discover' }, { href: '/daily', key: 'app.nav.daily' }],
  '/match': [{ href: '/match', key: 'app.nav.match' }, { href: '/speed', key: 'app.nav.speed' }],
  '/profile': [{ href: '/profile', key: 'app.nav.profile' }, { href: '/shop', key: 'app.nav.shop' }],
};

/** À poser tout en haut du conteneur de la page : les onglets sont ainsi alignés avec son contenu, à gauche. */
export function SectionTabs({ className }: { className?: string }) {
  const t = useTranslations();
  const path = usePathname();
  const speedOn = useEngagementConfig().data?.flags.speed_dating !== false;
  const group = Object.values(TABS).find((tabs) => tabs.some((x) => x.href === path));
  if (!group) return null;
  return (
    <nav data-tour="section-tabs" aria-label={t('app.sectionTabs')} className={cn('flex flex-wrap justify-start gap-2', className)}>
      {group.filter((x) => x.href !== '/speed' || speedOn).map((x) => (
        <Link key={x.href} href={x.href} aria-current={path === x.href ? 'page' : undefined}
          className={cn('rounded-full border px-4 py-2 text-sm font-semibold transition', path === x.href ? 'border-brand-strong bg-soft text-brand-ink' : 'border-field-line bg-field text-muted hover:bg-soft hover:text-fg')}>{t(x.key)}</Link>
      ))}
    </nav>
  );
}
