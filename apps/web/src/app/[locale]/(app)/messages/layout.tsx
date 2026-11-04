'use client';
import { Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';
import { Avatar, Badge, Input, Skeleton, cn } from '@duomatch/ui';
import { useConversations } from '@/hooks/useQueries';
import { Link, usePathname } from '@/i18n/navigation';
import { timeAgo } from '@/lib/format';

export default function MessagesLayout({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const locale = useLocale();
  const path = usePathname();
  const open = /^\/messages\/.+/.test(path);
  const activeId = open ? path.split('/')[2] : null;
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => { const id = setTimeout(() => setTerm(q.trim()), 250); return () => clearTimeout(id); }, [q]);
  const { data, isLoading } = useConversations(term);
  const fresh = (data ?? []).filter((c) => !c.lastMessage);

  return (
    <div className="mx-auto flex h-[calc(100dvh-3.5rem)] max-w-6xl lg:h-[calc(100dvh-4rem)]">
      <section aria-label={t('app.nav.messages')} className={cn('w-full shrink-0 flex-col border-r border-line lg:flex lg:w-96', open ? 'hidden' : 'flex')}>
        <div className="space-y-3 p-4">
          <h1 className="text-2xl font-extrabold">{t('chat.title')}</h1>
          <div className="relative"><Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" aria-hidden /><Input aria-label={t('chat.search')} placeholder={t('chat.search')} value={q} onChange={(e) => setQ(e.target.value)} className="h-11 pl-11" type="search" /></div>
        </div>
        <div className="flex-1 overflow-y-auto pb-24 lg:pb-4">
          {fresh.length > 0 && !term && (
            <div className="px-4 pb-3"><h2 className="mb-2 text-sm font-bold text-muted">{t('chat.newMatches')}</h2>
              <ul className="scrollbar-none flex gap-4 overflow-x-auto">{fresh.map((c) => (
                <li key={c.id} className="shrink-0"><Link href={`/messages/${c.id}`} className="flex w-16 flex-col items-center gap-1"><span className="rounded-full p-0.5 ring-2 ring-brand"><Avatar src={c.user.thumbUrl} name={c.user.displayName} size={56} /></span><span className="w-full truncate text-center text-xs font-medium">{c.user.displayName}</span></Link></li>
              ))}</ul>
            </div>
          )}
          {isLoading && <div className="space-y-2 px-4"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>}
          {data && data.length === 0 && <p className="px-6 py-10 text-center text-muted">{term ? t('chat.noResults') : t('chat.empty')}</p>}
          <ul>
            {data?.filter((c) => c.lastMessage || term).map((c) => (
              <li key={c.id}>
                <Link href={`/messages/${c.id}`} aria-current={activeId === c.id ? 'page' : undefined} className={cn('flex items-center gap-3 px-4 py-3 transition hover:bg-soft', activeId === c.id && 'bg-soft')}>
                  <Avatar src={c.user.thumbUrl} name={c.user.displayName} size={52} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2"><span className="truncate font-semibold">{c.user.displayName}</span>{c.lastMessage && <time className="shrink-0 text-xs text-muted" dateTime={c.lastMessage.createdAt}>{timeAgo(c.lastMessage.createdAt, locale)}</time>}</span>
                    <span className={cn('block truncate text-sm', c.unread ? 'font-semibold text-fg' : 'text-muted')}>{c.lastMessage ? (c.lastMessage.mine ? `${t('chat.you')} ` : '') + (c.lastMessage.body ?? (c.lastMessage.hasImage ? t('chat.photo') : t('chat.deleted'))) : t('chat.sayHello')}</span>
                  </span>
                  {c.unread > 0 && <Badge className="bg-brand-strong text-white" aria-label={t('chat.unread', { count: c.unread })}>{c.unread}</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <div className={cn('min-w-0 flex-1 flex-col lg:flex', open ? 'flex' : 'hidden')}>{children}</div>
    </div>
  );
}
