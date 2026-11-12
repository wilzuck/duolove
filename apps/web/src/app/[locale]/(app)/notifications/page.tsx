'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Bell, Megaphone, CalendarHeart, CreditCard, Heart, Hourglass, MessageCircle, Phone, ShieldAlert, Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Button, EmptyState, Skeleton, cn } from '@duomatch/ui';
import { keys, useNotifications } from '@/hooks/useQueries';
import { Link } from '@/i18n/navigation';
import { post } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import type { NotificationItem } from '@/lib/types';

const META: Record<string, { icon: typeof Bell; href: (n: NotificationItem) => string }> = {
  LIKE: { icon: Heart, href: () => '/likes' },
  MATCH: { icon: Sparkles, href: (n) => (n.data.conversationId ? `/messages/${n.data.conversationId}` : '/messages') },
  MESSAGE: { icon: MessageCircle, href: (n) => (n.data.conversationId ? `/messages/${n.data.conversationId}` : '/messages') },
  PROFILE_VERIFIED: { icon: BadgeCheck, href: () => '/profile' },
  SUBSCRIPTION_ACTIVATED: { icon: CreditCard, href: () => '/settings?tab=subscription' },
  SUBSCRIPTION_EXPIRING: { icon: CreditCard, href: () => '/premium' },
  SECURITY_ALERT: { icon: ShieldAlert, href: () => '/settings?tab=security' },
  REFUND_UPDATE: { icon: CreditCard, href: () => '/settings?tab=payments' },
  LIVE_INVITE: { icon: Sparkles, href: () => '/match' },
  LIVE_ACCEPTED: { icon: Sparkles, href: () => '/match' },
  REFERRAL_REWARD: { icon: Sparkles, href: () => '/referral' },
  DATE_UPDATE: { icon: CalendarHeart, href: (n) => (n.data.conversationId ? `/messages/${n.data.conversationId}` : '/messages') },
  SPEED_REMINDER: { icon: Hourglass, href: (n) => (n.data.eventId ? `/speed/${String(n.data.eventId)}` : '/speed') },
  CALL_MISSED: { icon: Phone, href: (n) => (n.data.conversationId ? `/messages/${n.data.conversationId}` : '/messages') },
  ANNOUNCEMENT: { icon: Megaphone, href: () => '/discover' },
  DATE_REMINDER: { icon: CalendarHeart, href: (n) => (n.data.conversationId ? `/messages/${n.data.conversationId}` : '/messages') },
};

export default function NotificationsPage() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const { data, isLoading } = useNotifications();
  const refresh = () => { void qc.invalidateQueries({ queryKey: keys.notifications }); void qc.invalidateQueries({ queryKey: keys.me }); };
  const readAll = useMutation({ mutationFn: () => post('/notifications/read-all'), onSuccess: refresh });
  const readOne = useMutation({ mutationFn: (id: string) => post(`/notifications/${id}/read`), onSuccess: refresh });
  const body = (n: NotificationItem): ReactNode => (n.type === 'ANNOUNCEMENT' ? <><span className="block">{String(n.data.subject ?? '')}</span>{!!n.data.excerpt && <span className="block text-sm font-normal text-muted">{String(n.data.excerpt)}</span>}</> : bodyOf(n));
  const bodyOf = (n: NotificationItem): ReactNode => t(`notifications.types.${n.type}${n.type === 'SUBSCRIPTION_EXPIRING' && n.data.reason ? '_FAILED' : n.type === 'SUBSCRIPTION_EXPIRING' && n.data.daysLeft ? '_DAYS' : n.type === 'SUBSCRIPTION_ACTIVATED' && n.data.product ? '_PURCHASE' : n.type === 'REFUND_UPDATE' ? `_${String(n.data.status ?? 'COMPLETED')}` : n.type === 'DATE_UPDATE' ? `_${String(n.data.status ?? '')}` : n.type === 'MESSAGE' && Number(n.data.count ?? 1) > 1 ? '_MANY' : ''}` as never, { count: String(n.data.count ?? 1), plan: String(n.data.plan ?? ''), event: String(n.data.event ?? ''), product: String(n.data.product ?? ''), n: String(n.data.daysLeft ?? '') } as never);
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-extrabold">{t('app.nav.notifications')}</h1>{data?.items.some((n) => !n.readAt) && <Button variant="ghost" size="sm" onClick={() => readAll.mutate()}>{t('notifications.readAll')}</Button>}</div>
      {isLoading && <Skeleton className="h-64" />}
      {data && data.items.length === 0 && <EmptyState icon={<Bell className="size-8" />} title={t('notifications.empty')} />}
      <ul className="space-y-2">
        {data?.items.map((n) => {
          const m = META[n.type] ?? { icon: Bell, href: () => '/discover' };
          const Icon = m.icon;
          return (
            <li key={n.id}>
              <Link href={m.href(n)} onClick={() => !n.readAt && readOne.mutate(n.id)} className={cn('flex items-center gap-4 rounded-2xl border p-4 transition hover:bg-soft', n.readAt ? 'border-line' : 'border-brand/30 bg-soft/60')}>
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-soft text-brand"><Icon className="size-5" aria-hidden /></span>
                <span className="min-w-0 flex-1"><span className={cn('block', !n.readAt && 'font-semibold')}>{body(n)}</span><time className="text-xs text-muted" dateTime={n.createdAt}>{timeAgo(n.createdAt, locale)}</time></span>
                {!n.readAt && <span className="size-2.5 rounded-full bg-brand-strong" aria-label={t('notifications.unread')} />}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
