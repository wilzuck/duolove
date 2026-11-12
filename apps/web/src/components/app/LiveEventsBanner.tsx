'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, CalendarClock, Radio } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge, Button, Card } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { api, del, put } from '@/lib/api';
import { formatDate, formatTime } from '@/lib/format';
import { useUi } from '@/lib/store';

interface LiveEventView { id: string; title: string; description: string; city: string | null; startsAt: string; endsAt: string; phase: 'upcoming' | 'live'; rsvps: number; rsvped: boolean }
const KEY = ['live', 'events'];

/** Prochaine soirée Duo : date, nombre d'inscrits, rappel en un clic ; « en cours » avec le nombre de personnes connectées. */
export function LiveEventsBanner() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const { data } = useQuery({ queryKey: KEY, refetchInterval: 60_000, queryFn: () => api<{ events: LiveEventView[]; onlineNow: number }>('/live/events') });
  const toggle = useMutation({
    mutationFn: (e: LiveEventView) => (e.rsvped ? del(`/live/events/${e.id}/rsvp`) : put(`/live/events/${e.id}/rsvp`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (e) => toast('error', err(e)),
  });
  const ev = data?.events.find((e) => e.phase === 'live') ?? data?.events[0];
  if (!ev) return null;
  const live = ev.phase === 'live';
  return (
    <Card className="flex flex-wrap items-center gap-4 border-brand/30 bg-soft p-4 sm:p-5">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-strong text-white" aria-hidden>{live ? <Radio className="size-5" /> : <CalendarClock className="size-5" />}</span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-bold">{ev.title}{live && <Badge tone="success">{t('liveEvents.live')}</Badge>}</p>
        <p className="text-sm text-muted">
          {t('liveEvents.when', { date: formatDate(ev.startsAt, locale), start: formatTime(ev.startsAt, locale), end: formatTime(ev.endsAt, locale) })}{ev.city ? ` · ${ev.city}` : ''}
          {' · '}{live ? t('liveEvents.online', { n: data?.onlineNow ?? 0 }) : t('liveEvents.going', { n: ev.rsvps })}
        </p>
        {ev.description && <p className="mt-1 text-sm">{ev.description}</p>}
      </div>
      <Button variant={ev.rsvped ? 'secondary' : 'primary'} size="sm" loading={toggle.isPending} onClick={() => toggle.mutate(ev)} aria-pressed={ev.rsvped}>
        <BellRing className="size-4" aria-hidden />{ev.rsvped ? t('liveEvents.reminded') : t('liveEvents.remind')}
      </Button>
    </Card>
  );
}
