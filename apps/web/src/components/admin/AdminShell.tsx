'use client';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, FileText, LockKeyhole, MailCheck, Megaphone, CalendarClock, ChartLine, Globe2, Search, BadgeCheck, CloudUpload, DatabaseBackup, Send, Share2, CreditCard, HeartHandshake, Hourglass, Newspaper, Flag, Gift, History, Inbox, LayoutDashboard, LogOut, Menu, ShieldCheck, Tag, ToggleRight, Users, Wallet, X, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Avatar, cn, IconButton, Logo, Skeleton } from '@duomatch/ui';
import { useMe } from '@/hooks/useQueries';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { ApiError, api, post } from '@/lib/api';
import { LocaleSwitcher } from '../LocaleSwitcher';
import { ThemeToggle } from '../ThemeToggle';

const RANK = { USER: 0, MODERATOR: 1, ADMIN: 2, SUPER_ADMIN: 3 } as const;
export type Item = { href: string; key: string; icon: LucideIcon; min: 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN'; badge?: 'reports' | 'moderation' };

/** Rubriques de la console (même logique que WaMarcket : on cherche d'abord un domaine, puis la page). */
export const SECTIONS: { id: string; items: Item[] }[] = [
  { id: 'pilot', items: [
    { href: '/admin', key: 'overview', icon: LayoutDashboard, min: 'ADMIN' },
    { href: '/admin/moderation', key: 'moderation', icon: ShieldCheck, min: 'MODERATOR', badge: 'moderation' },
    { href: '/admin/stats', key: 'stats', icon: ChartLine, min: 'ADMIN' },
    { href: '/admin/audit-log', key: 'audit', icon: History, min: 'ADMIN' },
    { href: '/admin/guide', key: 'guide', icon: BookOpen, min: 'MODERATOR' },
  ] },
  { id: 'members', items: [
    { href: '/admin/users', key: 'users', icon: Users, min: 'MODERATOR' },
    { href: '/admin/reports', key: 'reports', icon: Flag, min: 'MODERATOR', badge: 'reports' },
    { href: '/admin/contact', key: 'contact', icon: Inbox, min: 'ADMIN' },
    { href: '/admin/broadcasts', key: 'broadcasts', icon: Send, min: 'ADMIN' },
    { href: '/admin/newsletter', key: 'newsletter', icon: Megaphone, min: 'ADMIN' },
    { href: '/admin/emails', key: 'emails', icon: MailCheck, min: 'ADMIN' },
    { href: '/admin/live-events', key: 'liveEvents', icon: CalendarClock, min: 'ADMIN' },
  ] },
  { id: 'revenue', items: [
    { href: '/admin/subscriptions', key: 'subscriptions', icon: CreditCard, min: 'ADMIN' },
    { href: '/admin/plans', key: 'plans', icon: Tag, min: 'ADMIN' },
    { href: '/admin/promos', key: 'promos', icon: Gift, min: 'ADMIN' },
    { href: '/admin/payments', key: 'payments', icon: Wallet, min: 'ADMIN' },
  ] },
  { id: 'settings', items: [
    { href: '/admin/countries', key: 'countries', icon: Globe2, min: 'ADMIN' },
    { href: '/admin/engagement', key: 'engagement', icon: HeartHandshake, min: 'ADMIN' },
    { href: '/admin/speed', key: 'speed', icon: Hourglass, min: 'ADMIN' },
    { href: '/admin/blog', key: 'blog', icon: Newspaper, min: 'ADMIN' },
    { href: '/admin/flags', key: 'flags', icon: ToggleRight, min: 'ADMIN' },
    { href: '/admin/social', key: 'social', icon: Share2, min: 'ADMIN' },
    { href: '/admin/backups', key: 'backups', icon: DatabaseBackup, min: 'ADMIN' },
    { href: '/admin/storage', key: 'storage', icon: CloudUpload, min: 'SUPER_ADMIN' },
    { href: '/admin/payment', key: 'payment', icon: CreditCard, min: 'SUPER_ADMIN' },
    { href: '/admin/access', key: 'access', icon: LockKeyhole, min: 'SUPER_ADMIN' },
    { href: '/admin/billing', key: 'billing', icon: FileText, min: 'SUPER_ADMIN' },
  ] },
];

const fold = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const path = usePathname();
  const router = useRouter();
  const { data: me, error } = useMe();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const allowed = !!me && RANK[me.role] >= 1;
  const badges = useQuery({ queryKey: ['admin', 'badges'], enabled: allowed, refetchInterval: 60_000, queryFn: () => api<{ reports: number; moderation: number }>('/admin/badges') });

  useEffect(() => { if (error instanceof ApiError && error.status === 401) router.replace(`/login?next=${encodeURIComponent(path)}`); }, [error, path, router]);
  useEffect(() => { if (me && !allowed) router.replace('/discover'); }, [me, allowed, router]);
  // Un modérateur n'a pas la vue d'ensemble : direction la file de signalements.
  useEffect(() => { if (me && RANK[me.role] === 1 && path === '/admin') router.replace('/admin/reports'); }, [me, path, router]);

  // Ctrl/Cmd + K : met le curseur dans la recherche de menu visible.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) return;
      const el = [...document.querySelectorAll<HTMLInputElement>('input[data-admin-search]')].find((x) => x.offsetParent !== null);
      if (el) { e.preventDefault(); el.focus(); el.select(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!me || !allowed) return <div className="mx-auto max-w-md space-y-4 p-6"><Skeleton className="h-12" /><Skeleton className="h-80" /></div>;

  // Page réservée à un rôle supérieur (ex. un modérateur sur /admin/payments) : message clair plutôt qu'un tableau vide.
  const required = SECTIONS.flatMap((x) => x.items).filter((i) => (i.href === '/admin' ? path === '/admin' : path.startsWith(i.href))).sort((a, b) => b.href.length - a.href.length)[0];
  const forbidden = !!required && RANK[me.role] < RANK[required.min];
  const active = (href: string) => (href === '/admin' ? path === '/admin' : path.startsWith(href));
  const matches = SECTIONS.flatMap((x) => x.items.map((i) => ({ ...i, sec: x.id }))).filter((i) => {
    const needle = fold(q);
    return !!needle && RANK[me.role] >= RANK[i.min] && (fold(t(`admin.nav.${i.key}`)).includes(needle) || fold(t(`admin.sections.${i.sec}`)).includes(needle));
  });
  const nav = (
    <nav aria-label={t('admin.menu')} className="scroll-dark flex flex-1 flex-col gap-5 overflow-y-auto py-2 pr-1">
      {SECTIONS.map((s) => {
        const needle = fold(q);
        const items = s.items.filter((i) => RANK[me.role] >= RANK[i.min] && (!needle || fold(t(`admin.nav.${i.key}`)).includes(needle) || fold(t(`admin.sections.${s.id}`)).includes(needle)));
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
      {q.trim() && matches.length === 0 && <p className="px-3 text-sm text-white/60">{t('admin.menuSearchEmpty')}</p>}
    </nav>
  );
  const search = (
    <div className="relative mx-1">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/50" aria-hidden />
      <input
        data-admin-search type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('admin.menuSearch')} aria-label={t('admin.menuSearch')} autoComplete="off"
        onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) { router.push(matches[0].href); setQ(''); setOpen(false); } else if (e.key === 'Escape') setQ(''); }}
        className="h-10 w-full rounded-xl border border-white/15 bg-white/10 pr-3 pl-9 text-sm text-white placeholder:text-white/50 focus:border-white/40 focus:outline-none"
      />
    </div>
  );
  const account = (
    <div className="space-y-2 border-t border-white/15 pt-3">
      <Link href="/discover" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white"><ArrowLeft className="size-4.5" aria-hidden />{t('admin.backToApp')}</Link>
      <div className="flex items-center gap-3 px-3 py-1.5"><Avatar src={me.profile?.thumbUrl} name={me.profile?.displayName ?? '?'} size={36} /><span className="min-w-0 flex-1"><span className="flex items-center gap-1 text-sm font-semibold leading-tight text-white"><span className="truncate">{me.profile?.displayName}</span>{me.profile?.verified && <BadgeCheck className="size-4 shrink-0 fill-sky-500 text-white" aria-label={t('profile.verification')} />}</span><span className="block truncate text-xs leading-tight text-white/60">{t(`admin.roles.${me.role}`)}</span></span>
        <button type="button" aria-label={t('settings.account.logout')} className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white" onClick={() => void post('/auth/logout').finally(() => router.replace('/login'))}><LogOut className="size-4.5" /></button></div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-soft/40 lg:grid lg:grid-cols-[16.5rem_1fr]">
      <a href="#main" className="skip-link">{t('common.skipToContent')}</a>
      <aside className="hidden flex-col gap-3 bg-[#1b1a24] p-4 lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-[16.5rem]">
        <Link href="/admin" className="px-2 pt-1" aria-label="Crushduo"><Logo variant="dark" /></Link>
        {search}{nav}{account}
      </aside>
      {open && <div className="fixed inset-0 z-50 lg:hidden"><button aria-label={t('common.close')} className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} /><aside className="absolute inset-y-0 left-0 flex w-72 flex-col gap-3 bg-[#1b1a24] p-4 shadow-pop"><div className="flex items-center justify-between px-2"><Logo variant="dark" /><button aria-label={t('common.close')} className="rounded-full p-2 text-white" onClick={() => setOpen(false)}><X className="size-5" /></button></div>{search}{nav}{account}</aside></div>}
      <div className="flex min-w-0 flex-col lg:col-start-2">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur lg:px-8">
          <IconButton label={t('nav.menu')} tone="plain" className="lg:hidden" aria-expanded={open} onClick={() => setOpen(true)}><Menu className="size-5" /></IconButton>
          <p className="hidden text-sm font-semibold text-muted lg:block">{t('admin.title')}</p>
          <div className="flex items-center gap-1"><LocaleSwitcher /><ThemeToggle /></div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-4 py-6 lg:px-8">{forbidden ? <Alert variant="text">{t('admin.forbidden')}</Alert> : children}</main>
      </div>
    </div>
  );
}
