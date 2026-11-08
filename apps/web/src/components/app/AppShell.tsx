'use client';
import { Bell, Compass, Crown, Heart, Radio, MessageCircle, ShieldAlert, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Avatar, Button, Logo, cn } from '@duomatch/ui';
import { Link, usePathname } from '@/i18n/navigation';
import type { Me } from '@/lib/types';
import { LocaleSwitcher } from '../LocaleSwitcher';
import { SiteLinks } from '../SiteLinks';
import { CallLayer } from './CallLayer';
import { useEngagementConfig } from '@/hooks/useQueries';
import { CrushNavIcon } from './CrushNavIcon';
import { PauseBanner } from './PauseBanner';
import { ThemeToggle } from '../ThemeToggle';

const NAV = [
  { href: '/discover', icon: Compass, key: 'app.nav.discover' },
  { href: '/match', icon: Radio, key: 'app.nav.match' },
  { href: '/likes', icon: Heart, key: 'app.nav.likes' },
  { href: '/messages', icon: MessageCircle, key: 'app.nav.messages' },
  { href: '/profile', icon: User, key: 'app.nav.profile' },
] as const;
/** Pages regroupées sous une entrée du menu : l'entrée reste active et la page affiche des onglets pour passer de l'une à l'autre. */
const GROUPS: Record<string, string[]> = { '/discover': ['/discover', '/daily'], '/match': ['/match', '/speed'], '/profile': ['/profile', '/shop'] };
const TABS: Record<string, { href: string; key: string }[]> = {
  '/discover': [{ href: '/discover', key: 'app.nav.discover' }, { href: '/daily', key: 'app.nav.daily' }],
  '/match': [{ href: '/match', key: 'app.nav.match' }, { href: '/speed', key: 'app.nav.speed' }],
  '/profile': [{ href: '/profile', key: 'app.nav.profile' }, { href: '/shop', key: 'app.nav.shop' }],
};
/** Barre du bas sur téléphone : Crush occupe la place centrale (la plus accessible au pouce), Likes passe en 2e position. */
const MOBILE_NAV = [NAV[0], NAV[2], NAV[1], NAV[3], NAV[4]] as const;

export function AppShell({ me, banner, children }: { me: Me; banner?: ReactNode; children: ReactNode }) {
  const t = useTranslations();
  const path = usePathname();
  const active = (href: string) => (GROUPS[href] ?? [href]).some((x) => path === x || path.startsWith(`${x}/`));
  const staff = me.role !== 'USER';
  const speedOn = useEngagementConfig().data?.flags.speed_dating !== false;
  const group = Object.entries(TABS).find(([, tabs]) => tabs.some((x) => x.href === path))?.[1];
  const sectionTabs = group && (
    <nav aria-label={t('app.sectionTabs')} className="flex flex-wrap gap-2 px-4 pt-4 lg:px-8">
      {group.filter((x) => x.href !== '/speed' || speedOn).map((x) => (
        <Link key={x.href} href={x.href} aria-current={path === x.href ? 'page' : undefined}
          className={cn('rounded-full border px-4 py-2 text-sm font-semibold transition', path === x.href ? 'border-brand-strong bg-soft text-brand-ink' : 'border-field-line bg-field text-muted hover:bg-soft hover:text-fg')}>{t(x.key)}</Link>
      ))}
    </nav>
  );
  const inChat = /^\/messages\/.+/.test(path);

  // Onboarding : parcours guidé sans navigation (on ne s'échappe pas d'un profil à moitié rempli).
  if (path === '/onboarding') {
    return (
      <div className="min-h-dvh bg-bg">
        {banner}
        <header className="mx-auto flex h-16 max-w-xl items-center justify-between px-4"><Logo /><div className="flex items-center gap-1"><LocaleSwitcher /><ThemeToggle /></div></header>
        <main id="main">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-[17rem_1fr]">
      <CallLayer />
      <a href="#main" className="skip-link">{t('common.skipToContent')}</a>
      {/* Barre latérale (desktop) */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-2 border-r border-line bg-card p-5 lg:flex">
        <Link href="/discover" className="mb-4 px-2"><Logo /></Link>
        <nav aria-label={t('nav.main')} className="flex flex-col gap-1">
          {NAV.map(({ href, icon: Icon, key }) => (
            <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined}
              className={cn('flex items-center gap-3 rounded-2xl px-4 py-3 font-semibold transition', active(href) ? 'bg-soft text-brand-ink' : 'text-muted hover:bg-soft hover:text-fg')}>
              {href === '/match' ? <CrushNavIcon icon={Icon} /> : <Icon className="size-5" aria-hidden />}{t(key)}
              {href === '/messages' && null}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          {me.entitlement.plan === 'FREE' && (
            <Link href="/premium" className="block rounded-3xl bg-linear-to-br from-brand-strong to-brand-strong-2 p-5 text-white shadow-soft">
              <Crown className="size-6" aria-hidden /><p className="mt-2 font-bold">{t('app.upsellTitle')}</p><p className="mt-1 text-sm text-white/90">{t('app.upsellText')}</p>
            </Link>
          )}
          {staff && (
            <Link href="/admin" className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-muted hover:bg-soft hover:text-fg"><ShieldAlert className="size-5" aria-hidden />{t('app.nav.admin')}</Link>
          )}
          <Link href="/settings" className="flex items-center gap-3 rounded-2xl p-2 hover:bg-soft">
            <Avatar src={me.profile?.thumbUrl} name={me.profile?.displayName ?? '?'} size={44} />
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{me.profile?.displayName}</span><span className="text-xs text-muted">{t('app.nav.settings')}</span></span>
          </Link>
          <div className="flex items-center justify-between"><LocaleSwitcher /><ThemeToggle /></div>
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        {banner}
        {me.profile?.paused && <PauseBanner endsAt={me.profile.pauseEndsAt} />}
        {/* Barre du haut */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/90 px-4 backdrop-blur lg:h-16 lg:px-8">
          <Link href="/discover" className="lg:hidden" aria-label={t('nav.home')}><Logo /></Link>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-1">
            {me.entitlement.plan === 'FREE' && <Link href="/premium" aria-label={t('app.goPremium')} className="rounded-full bg-soft p-2.5 text-brand-ink hover:bg-brand/15 sm:hidden"><Crown className="size-5" /></Link>}
            {me.entitlement.plan === 'FREE' && <Link href="/premium" className="hidden sm:block"><Button size="sm" variant="secondary"><Crown className="size-4" aria-hidden />{t('app.goPremium')}</Button></Link>}
            <Link href="/notifications" aria-label={t('app.nav.notifications')} className="relative rounded-full p-2.5 text-muted hover:bg-soft hover:text-fg">
              <Bell className="size-5" />
              {me.unreadNotifications > 0 && <span className="absolute top-1 right-1 flex min-w-4.5 items-center justify-center rounded-full bg-brand-strong px-1 text-[10px] font-bold text-white" aria-label={t('app.unread', { count: me.unreadNotifications })}>{me.unreadNotifications > 9 ? '9+' : me.unreadNotifications}</span>}
            </Link>
            <Link href="/settings" className="lg:hidden" aria-label={t('app.nav.settings')}><Avatar src={me.profile?.thumbUrl} name={me.profile?.displayName ?? '?'} size={34} /></Link>
          </div>
        </header>
        <main id="main" className={cn('min-w-0 flex-1', !inChat && 'pb-24 lg:pb-8')}>{sectionTabs}{children}{!inChat && <SiteLinks />}</main>
      </div>

      {/* Barre d'onglets (mobile) */}
      <nav aria-label={t('nav.main')} className={cn('pb-safe fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-card/95 backdrop-blur lg:hidden', inChat && 'hidden')}>
        {MOBILE_NAV.map(({ href, icon: Icon, key }) => (
          <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined} className={cn('flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold', active(href) ? 'text-brand-ink' : 'text-muted')}>
            <span className={cn('flex h-8 w-14 items-center justify-center rounded-full transition', active(href) && 'bg-soft')}>{href === '/match' ? <CrushNavIcon icon={Icon} /> : <Icon className="size-5" aria-hidden />}</span>{t(key)}
          </Link>
        ))}
      </nav>
    </div>
  );
}
