'use client';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CreditCard, Newspaper, Flag, Gift, History, LayoutDashboard, LogOut, Menu, ShieldAlert, ShieldCheck, Tag, ToggleRight, Undo2, Users, Wallet, X, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';
import { Avatar, cn, IconButton, Logo, Skeleton } from '@duomatch/ui';
import { useMe } from '@/hooks/useQueries';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { ApiError, api, post } from '@/lib/api';
import { LocaleSwitcher } from '../LocaleSwitcher';
import { ThemeToggle } from '../ThemeToggle';

const RANK = { USER: 0, MODERATOR: 1, ADMIN: 2, SUPER_ADMIN: 3 } as const;
type Item = { href: string; key: string; icon: LucideIcon; min: 'MODERATOR' | 'ADMIN'; badge?: 'reports' | 'moderation' };

/** Rubriques de la console (même logique que WaMarcket : on cherche d'abord un domaine, puis la page). */
const SECTIONS: { id: string; items: Item[] }[] = [
  { id: 'pilot', items: [
    { href: '/admin', key: 'overview', icon: LayoutDashboard, min: 'ADMIN' },
    { href: '/admin/moderation', key: 'moderation', icon: ShieldCheck, min: 'MODERATOR', badge: 'moderation' },
    { href: '/admin/audit-log', key: 'audit', icon: History, min: 'ADMIN' },
  ] },
  { id: 'members', items: [
    { href: '/admin/users', key: 'users', icon: Users, min: 'MODERATOR' },
    { href: '/admin/reports', key: 'reports', icon: Flag, min: 'MODERATOR', badge: 'reports' },
  ] },
  { id: 'revenue', items: [
    { href: '/admin/subscriptions', key: 'subscriptions', icon: CreditCard, min: 'ADMIN' },
    { href: '/admin/plans', key: 'plans', icon: Tag, min: 'ADMIN' },
    { href: '/admin/promos', key: 'promos', icon: Gift, min: 'ADMIN' },
    { href: '/admin/payments', key: 'payments', icon: Wallet, min: 'ADMIN' },
    { href: '/admin/refunds', key: 'refunds', icon: Undo2, min: 'ADMIN' },
  ] },
  { id: 'settings', items: [
    { href: '/admin/blog', key: 'blog', icon: Newspaper, min: 'ADMIN' },
    { href: '/admin/flags', key: 'flags', icon: ToggleRight, min: 'ADMIN' },
  ] },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const path = usePathname();
  const router = useRouter();
  const { data: me, error } = useMe();
  const [open, setOpen] = useState(false);
  const allowed = !!me && RANK[me.role] >= 1;
  const badges = useQuery({ queryKey: ['admin', 'badges'], enabled: allowed, refetchInterval: 60_000, queryFn: () => api<{ reports: number; moderation: number }>('/admin/badges') });

  useEffect(() => { if (error instanceof ApiError && error.status === 401) router.replace(`/login?next=${encodeURIComponent(path)}`); }, [error, path, router]);
  useEffect(() => { if (me && !allowed) router.replace('/discover'); }, [me, allowed, router]);
  // Un modérateur n'a pas la vue d'ensemble : direction la file de signalements.
  useEffect(() => { if (me && RANK[me.role] === 1 && path === '/admin') router.replace('/admin/reports'); }, [me, path, router]);

  if (!me || !allowed) return <div className="mx-auto max-w-md space-y-4 p-6"><Skeleton className="h-12" /><Skeleton className="h-80" /></div>;

  const active = (href: string) => (href === '/admin' ? path === '/admin' : path.startsWith(href));
  const nav = (
    <nav aria-label={t('admin.menu')} className="flex flex-1 flex-col gap-5 overflow-y-auto py-2">
      {SECTIONS.map((s) => {
        const items = s.items.filter((i) => RANK[me.role] >= RANK[i.min]);
        if (!items.length) return null;
        return (
          <div key={s.id}>
            <p className="px-3 pb-1.5 text-[11px] font-bold tracking-wider text-white/50 uppercase">{t(`admin.sections.${s.id}`)}</p>
            <ul className="space-y-0.5">
              {items.map(({ href, key, icon: Icon, badge }) => {
                const n = badge ? (badges.data?.[badge] ?? 0) : 0;
                return (
                  <li key={href}>
                    <Link href={href} onClick={() => setOpen(false)} aria-current={active(href) ? 'page' : undefined} className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition', active(href) ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white')}>
                      <Icon className="size-4.5" aria-hidden /><span className="flex-1">{t(`admin.nav.${key}`)}</span>
                      {n > 0 && <span className="min-w-5 rounded-full bg-brand-strong px-1.5 text-center text-[11px] font-bold text-white" aria-label={t('admin.pending', { count: n })}>{n}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
  const account = (
    <div className="space-y-2 border-t border-white/15 pt-3">
      <Link href="/discover" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white"><ArrowLeft className="size-4.5" aria-hidden />{t('admin.backToApp')}</Link>
      <div className="flex items-center gap-3 px-3 py-1.5"><Avatar src={me.profile?.thumbUrl} name={me.profile?.displayName ?? '?'} size={36} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white">{me.profile?.displayName}</span><span className="text-xs text-white/60">{t(`admin.roles.${me.role}`)}</span></span>
        <button type="button" aria-label={t('settings.account.logout')} className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white" onClick={() => void post('/auth/logout').finally(() => router.replace('/login'))}><LogOut className="size-4.5" /></button></div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-soft/40 lg:grid lg:grid-cols-[16.5rem_1fr]">
      <a href="#main" className="skip-link">{t('common.skipToContent')}</a>
      <aside className="sticky top-0 hidden h-dvh flex-col gap-3 bg-[#1b1a24] p-4 lg:flex">
        <Link href="/admin" className="px-2 pt-1 [&_*]:!text-white"><Logo /></Link>
        <p className="mx-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white"><ShieldAlert className="size-3.5" aria-hidden />{t('admin.title')}</p>
        {nav}{account}
      </aside>
      {open && <div className="fixed inset-0 z-50 lg:hidden"><button aria-label={t('common.close')} className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} /><aside className="absolute inset-y-0 left-0 flex w-72 flex-col gap-3 bg-[#1b1a24] p-4 shadow-pop"><div className="flex items-center justify-between px-2"><span className="[&_*]:!text-white"><Logo /></span><button aria-label={t('common.close')} className="rounded-full p-2 text-white" onClick={() => setOpen(false)}><X className="size-5" /></button></div>{nav}{account}</aside></div>}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur lg:px-8">
          <IconButton label={t('nav.menu')} tone="plain" className="lg:hidden" aria-expanded={open} onClick={() => setOpen(true)}><Menu className="size-5" /></IconButton>
          <p className="hidden text-sm font-semibold text-muted lg:block">{t('admin.title')}</p>
          <div className="flex items-center gap-1"><LocaleSwitcher /><ThemeToggle /></div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
