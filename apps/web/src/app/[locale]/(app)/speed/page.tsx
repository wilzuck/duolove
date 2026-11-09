'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Hourglass, MapPin, ShieldCheck, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge, Button, Card, Skeleton } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { Link } from '@/i18n/navigation';
import { api, del, post } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useUi } from '@/lib/store';
import type { SpeedEventInfo } from '@/lib/types';
import { FeatureOffDialog } from '@/components/app/FeatureOffDialog';

export default function SpeedPage() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const q = useQuery({ queryKey: ['speed', 'list'], queryFn: () => api<{ items: SpeedEventInfo[] }>('/speed-events'), refetchInterval: 30_000 });
  const act = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => (on ? post(`/speed-events/${id}/register`) : del(`/speed-events/${id}/register`)),
    onSuccess: (_d, v) => { toast('success', t(v.on ? 'speed.registeredToast' : 'speed.unregisteredToast')); void qc.invalidateQueries({ queryKey: ['speed'] }); },
    onError: (e) => toast('error', err(e)),
  });
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 lg:p-8">
      <FeatureOffDialog flag="speed_dating" />
      <header>
        <h1 className="flex items-center gap-3 font-display text-3xl font-extrabold"><Hourglass className="size-8 text-brand" aria-hidden />{t('speed.title')}</h1>
        <p className="mt-2 text-muted">{t('speed.subtitle')}</p>
      </header>
      <Card className="space-y-3 p-5">
        <h2 className="font-bold">{t('speed.how')}</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted"><li>{t('speed.h1')}</li><li>{t('speed.h2')}</li><li>{t('speed.h3')}</li></ol>
        <p className="flex items-start gap-2 text-sm"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />{t('speed.safe')}</p>
      </Card>
      {q.isLoading && <Skeleton className="h-40" />}
      {q.data && q.data.items.length === 0 && <p className="py-10 text-center text-muted">{t('speed.empty')}</p>}
      <ul className="space-y-4">
        {q.data?.items.map((e) => {
          const mine = e.myStatus === 'REGISTERED';
          const live = e.phase !== 'UPCOMING';
          return (
            <li key={e.id}>
              <Card className="space-y-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="text-lg font-bold">{e.title}</h2>
                  {mine ? <Badge tone="success">{t('speed.registered')}</Badge> : e.spotsLeft === 0 ? <Badge tone="neutral">{t('speed.full')}</Badge> : <Badge tone="brand">{t('speed.spots', { n: e.spotsLeft })}</Badge>}
                </div>
                {e.description && <p className="text-sm text-muted">{e.description}</p>}
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                  <li className="flex items-center gap-1"><CalendarClock className="size-4" aria-hidden />{t('speed.when', { date: formatDate(e.startsAt, locale, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) })}</li>
                  <li className="flex items-center gap-1"><MapPin className="size-4" aria-hidden />{e.city ?? t('speed.anyCity')}</li>
                  <li className="flex items-center gap-1"><Users className="size-4" aria-hidden />{t('speed.ages', { min: e.ageMin, max: e.ageMax })}</li>
                  <li>{t('speed.rounds', { n: e.rounds, m: Math.round(e.roundSeconds / 60) })}</li>
                </ul>
                {e.eligible && !mine && <p className="text-sm text-muted" role="note">{t(`speed.reason.${e.eligible}` as never)}</p>}
                <div className="flex flex-wrap gap-2">
                  {mine && <Link href={`/speed/${e.id}`}><Button>{t('speed.enter')}</Button></Link>}
                  {mine && !live && <Button variant="outline" onClick={() => act.mutate({ id: e.id, on: false })} loading={act.isPending}>{t('speed.unregister')}</Button>}
                  {!mine && !live && <Button onClick={() => act.mutate({ id: e.id, on: true })} loading={act.isPending} disabled={e.spotsLeft === 0 || !!e.eligible}>{t('speed.register')}</Button>}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
