'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge, CrudTable, Field, Input, Select } from '@duomatch/ui';
import { PageLoader } from '@/components/PageLoader';
import { useApiError } from '@/hooks/useApiError';
import { useTableLabels } from '@/hooks/useTableLabels';
import { api, post } from '@/lib/api';
import { formatDate, formatTime } from '@/lib/format';
import { useUi } from '@/lib/store';

interface EventRow { id: string; title: string; description: string; city: string | null; startsAt: string; endsAt: string; phase: 'upcoming' | 'live' | 'ended' | 'canceled'; rsvps: number; tzOffset: number }
const blank = { title: '', description: '', city: '', start: '', minutes: '120', tz: '60' };
const TONE = { upcoming: 'brand', live: 'success', ended: 'neutral', canceled: 'neutral' } as const;

export default function AdminLiveEvents() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const tableLabels = useTableLabels();
  const [f, setF] = useState(blank);
  const list = useQuery({ queryKey: ['admin', 'live-events'], queryFn: () => api<{ items: EventRow[] }>('/admin/live-events') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'live-events'] });
  const create = useMutation({
    // Le champ « date et heure » est lu dans le fuseau du navigateur de l'administrateur, puis envoyé en UTC.
    mutationFn: () => post('/admin/live-events', { title: f.title.trim(), description: f.description.trim(), city: f.city.trim() || null, startsAt: new Date(f.start).toISOString(), durationMinutes: Number(f.minutes), tzOffset: Number(f.tz) }),
    onSuccess: () => { toast('success', t('admin.liveEvents.created')); void refresh(); },
    onError: (e) => toast('error', err(e)),
  });
  const cancel = useMutation({ mutationFn: (e: EventRow) => post(`/admin/live-events/${e.id}/cancel`), onSuccess: () => { toast('success', t('admin.liveEvents.canceled')); void refresh(); }, onError: (e) => toast('error', err(e)) });
  return (
    <CrudTable
      title={t('admin.liveEvents.title')} description={t('admin.liveEvents.subtitle')}
      addLabel={t('admin.liveEvents.new')} dialogTitle={t('admin.liveEvents.new')} submitLabel={t('admin.liveEvents.create')}
      exportName="soirees-match" tableLabels={tableLabels} cancelLabel={t('common.cancel')} closeLabel={t('common.close')}
      onOpen={() => setF(blank)} onSubmit={() => create.mutateAsync()} submitting={create.isPending}
      footnote={t('admin.liveEvents.footnote')}
      rows={list.data?.items} rowKey={(e) => e.id} loading={<PageLoader inline />} empty={t('admin.liveEvents.empty')}
      rowActions={(e) => (e.phase === 'upcoming' || e.phase === 'live' ? [{ label: t('admin.liveEvents.cancel'), icon: <Ban className="size-4" aria-hidden />, onSelect: () => cancel.mutate(e) }] : [])}
      columns={[
        { key: 'title', header: t('admin.liveEvents.name'), value: (e) => e.title, filter: 'text', cell: (e) => <span className="font-semibold">{e.title}{e.city ? <span className="font-normal text-muted"> · {e.city}</span> : null}</span> },
        { key: 'when', header: t('admin.liveEvents.when'), value: (e) => e.startsAt, cell: (e) => `${formatDate(e.startsAt, locale)} · ${formatTime(e.startsAt, locale)}–${formatTime(e.endsAt, locale)}` },
        { key: 'rsvps', mobileHidden: true, header: t('admin.liveEvents.rsvps'), value: (e) => e.rsvps, cell: (e) => e.rsvps },
        { key: 'status', header: t('admin.status'), value: (e) => e.phase, filter: { options: (['upcoming', 'live', 'ended', 'canceled'] as const).map((p) => ({ value: p, label: t(`admin.liveEvents.phase.${p}`) })) }, cell: (e) => <Badge tone={TONE[e.phase]}>{t(`admin.liveEvents.phase.${e.phase}` as never)}</Badge> },
      ]}
    >
      <Field label={t('admin.liveEvents.name')}>{(p) => <Input {...p} required minLength={3} maxLength={100} placeholder={t('admin.liveEvents.namePh')} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />}</Field>
      <Field label={t('admin.liveEvents.start')} hint={t('admin.liveEvents.startHint')}>{(p) => <Input {...p} required type="datetime-local" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />}</Field>
      <Field label={t('admin.liveEvents.duration')}>{(p) => <Select {...p} value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })}>{[60, 90, 120, 180, 240].map((m) => <option key={m} value={m}>{t('admin.liveEvents.hours', { n: m / 60 })}</option>)}</Select>}</Field>
      <Field label={t('admin.liveEvents.tz')} hint={t('admin.liveEvents.tzHint')}>{(p) => <Select {...p} value={f.tz} onChange={(e) => setF({ ...f, tz: e.target.value })}><option value="0">UTC+0 · Abidjan, Dakar, Lomé, Ouagadougou</option><option value="60">UTC+1 · Cotonou, Niamey, Douala, Kinshasa</option><option value="120">UTC+2 · Lubumbashi, Kigali</option></Select>}</Field>
      <Field label={t('admin.liveEvents.city')}>{(p) => <Input {...p} maxLength={80} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />}</Field>
      <Field label={t('admin.liveEvents.description')}>{(p) => <Input {...p} maxLength={500} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
    </CrudTable>
  );
}
