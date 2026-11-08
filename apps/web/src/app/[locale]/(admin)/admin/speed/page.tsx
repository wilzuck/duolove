'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge, CrudTable, Field, Input, RangeSlider, Select, Textarea } from '@duomatch/ui';
import { PageLoader } from '@/components/PageLoader';
import { useApiError } from '@/hooks/useApiError';
import { useTableLabels } from '@/hooks/useTableLabels';
import { api, post } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useUi } from '@/lib/store';
import type { AdminSpeedRow } from '@/lib/types';

const INTENTS = ['SERIOUS', 'MARRIAGE', 'DATING', 'FRIENDSHIP', 'UNSURE'] as const;
const pad = (n: number) => String(n).padStart(2, '0');
const localInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export default function AdminSpeed() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const q = useQuery({ queryKey: ['admin', 'speed'], queryFn: () => api<{ items: AdminSpeedRow[]; stats: { events: number; registrations: number; pairs: number; mutualInterests: number } }>('/admin/speed-events'), refetchInterval: 15_000 });
  const tableLabels = useTableLabels();
  const blank = () => ({ title: '', description: '', city: '', intent: '', ageMin: 18, ageMax: 99, capacity: 20, roundSeconds: 180, rounds: 4, startsAt: localInput(new Date(Date.now() + 24 * 3600_000)) });
  const [f, setF] = useState(blank);
  const create = useMutation({
    mutationFn: () => post('/admin/speed-events', { title: f.title, description: f.description, city: f.city.trim() || null, intent: f.intent || null, ageMin: f.ageMin, ageMax: f.ageMax, capacity: f.capacity, roundSeconds: f.roundSeconds, rounds: f.rounds, startsAt: new Date(f.startsAt).toISOString() }),
    onSuccess: () => { toast('success', t('admin.speed.created')); void qc.invalidateQueries({ queryKey: ['admin', 'speed'] }); },
    onError: (e) => toast('error', err(e)),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => post(`/admin/speed-events/${id}/cancel`),
    onSuccess: () => { toast('success', t('admin.speed.cancelled')); void qc.invalidateQueries({ queryKey: ['admin', 'speed'] }); },
    onError: (e) => toast('error', err(e)),
  });
  const num = (v: string, fb: number) => (v === '' || Number.isNaN(Number(v)) ? fb : Math.round(Number(v)));
  return (
    <CrudTable
      title={t('admin.speed.title')} description={t('admin.speed.subtitle')}
      intro={<>
        <p className="text-xs text-muted">{t('admin.speed.settingsNote')}</p>
        {q.data && <p className="text-sm text-muted">{t('admin.speed.stats', { events: q.data.stats.events, regs: q.data.stats.registrations, mutual: q.data.stats.mutualInterests, pairs: q.data.stats.pairs })}</p>}
      </>}
      addLabel={t('admin.speed.new')} dialogTitle={t('admin.speed.new')} submitLabel={t('admin.speed.create')}
      exportName="speed-dating" tableLabels={tableLabels} cancelLabel={t('common.cancel')} closeLabel={t('common.close')}
      onOpen={() => setF(blank())} onSubmit={() => create.mutateAsync()} submitting={create.isPending}
      rows={q.data?.items} rowKey={(r) => r.id} loading={<PageLoader inline />} empty={t('admin.speed.empty')} minWidth="44rem"
      rowActions={(r) => ((r.status === 'SCHEDULED' || r.status === 'RUNNING') ? [{ label: t('admin.speed.cancel'), icon: <Ban className="size-4" aria-hidden />, tone: 'danger' as const, onSelect: () => cancel.mutate(r.id) }] : [])}
      columns={[
        { key: 'title', header: t('admin.speed.colTitle'), value: (r) => r.title, filter: 'text', cell: (r) => <span className="font-semibold">{r.title}</span> },
        { key: 'when', header: t('admin.speed.colWhen'), value: (r) => r.startsAt, cell: (r) => formatDate(r.startsAt, locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) },
        { key: 'reg', mobileHidden: true, header: t('admin.speed.colRegistered'), value: (r) => r.registered, cell: (r) => `${r.registered} / ${r.capacity}` },
        { key: 'status', header: t('admin.speed.colStatus'), value: (r) => r.phase, filter: { options: (['UPCOMING', 'ROUND', 'BREAK', 'DECISION', 'ENDED', 'CANCELED'] as const).map((p) => ({ value: p, label: t(`admin.speed.phase.${p}` as never) })) }, cell: (r) => <Badge tone={r.phase === 'CANCELED' ? 'neutral' : r.phase === 'ROUND' || r.phase === 'DECISION' ? 'success' : 'brand'}>{t(`admin.speed.phase.${r.phase}` as never)}</Badge> },
        { key: 'mutual', mobileHidden: true, header: t('admin.speed.colMutual'), value: (r) => r.mutualInterests, cell: (r) => `${r.mutualInterests} / ${r.pairs}` },
        ]}
    >
      <div className="sm:col-span-2"><Field label={t('admin.speed.name')}>{(p) => <Input {...p} required minLength={3} maxLength={80} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />}</Field></div>
      <div className="sm:col-span-2"><Field label={t('admin.speed.description')}>{(p) => <Textarea {...p} maxLength={600} className="min-h-20" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field></div>
      <Field label={t('admin.speed.startsAt')}>{(p) => <Input {...p} type="datetime-local" required value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} />}</Field>
      <Field label={t('admin.speed.city')}>{(p) => <Input {...p} maxLength={80} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />}</Field>
      <Field label={t('admin.speed.intent')}>{(p) => <Select {...p} value={f.intent} onChange={(e) => setF({ ...f, intent: e.target.value })}><option value="">{t('admin.speed.anyIntent')}</option>{INTENTS.map((i) => <option key={i} value={i}>{t(`intent.${i}` as never)}</option>)}</Select>}</Field>
      <Field label={t('admin.speed.capacity')}>{(p) => <Input {...p} type="number" min={4} max={100} value={f.capacity} onChange={(e) => setF({ ...f, capacity: num(e.target.value, 20) })} />}</Field>
      <div className="sm:col-span-2"><RangeSlider label={t('live.ageRange')} min={18} max={99} value={[f.ageMin, f.ageMax]} minLabel={t('admin.speed.ageMin')} maxLabel={t('admin.speed.ageMax')}
        valueText={t('live.ageBetween', { min: f.ageMin, max: f.ageMax })} onChange={([a, b]) => setF({ ...f, ageMin: a, ageMax: b })} /></div>
      <Field label={t('admin.speed.roundSeconds')}>{(p) => <Input {...p} type="number" min={60} max={600} value={f.roundSeconds} onChange={(e) => setF({ ...f, roundSeconds: num(e.target.value, 180) })} />}</Field>
      <Field label={t('admin.speed.rounds')}>{(p) => <Input {...p} type="number" min={2} max={10} value={f.rounds} onChange={(e) => setF({ ...f, rounds: num(e.target.value, 4) })} />}</Field>
    </CrudTable>
  );
}
