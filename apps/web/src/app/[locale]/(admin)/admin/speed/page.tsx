'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge, Button, Card, DataTable, Field, Input, Select, Skeleton, Textarea } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
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
  const [now] = useState(() => Date.now());
  const [f, setF] = useState({ title: '', description: '', city: '', intent: '', ageMin: 18, ageMax: 99, capacity: 20, roundSeconds: 180, rounds: 4, startsAt: localInput(new Date(now + 24 * 3600_000)) });
  const create = useMutation({
    mutationFn: () => post('/admin/speed-events', { title: f.title, description: f.description, city: f.city.trim() || null, intent: f.intent || null, ageMin: f.ageMin, ageMax: f.ageMax, capacity: f.capacity, roundSeconds: f.roundSeconds, rounds: f.rounds, startsAt: new Date(f.startsAt).toISOString() }),
    onSuccess: () => { toast('success', t('admin.speed.created')); setF({ ...f, title: '', description: '' }); void qc.invalidateQueries({ queryKey: ['admin', 'speed'] }); },
    onError: (e) => toast('error', err(e)),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => post(`/admin/speed-events/${id}/cancel`),
    onSuccess: () => { toast('success', t('admin.speed.cancelled')); void qc.invalidateQueries({ queryKey: ['admin', 'speed'] }); },
    onError: (e) => toast('error', err(e)),
  });
  const num = (v: string, fb: number) => (v === '' || Number.isNaN(Number(v)) ? fb : Math.round(Number(v)));
  return (
    <div className="space-y-6">
      <header><h2 className="text-lg font-bold">{t('admin.speed.title')}</h2><p className="max-w-2xl text-sm text-muted">{t('admin.speed.subtitle')}</p><p className="mt-1 text-xs text-muted">{t('admin.speed.settingsNote')}</p></header>
      <Card className="p-5">
        <h3 className="mb-3 font-bold">{t('admin.speed.new')}</h3>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <div className="sm:col-span-2"><Field label={t('admin.speed.name')}>{(p) => <Input {...p} required minLength={3} maxLength={80} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />}</Field></div>
          <div className="sm:col-span-2"><Field label={t('admin.speed.description')}>{(p) => <Textarea {...p} maxLength={600} className="min-h-20" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field></div>
          <Field label={t('admin.speed.startsAt')}>{(p) => <Input {...p} type="datetime-local" required value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} />}</Field>
          <Field label={t('admin.speed.city')}>{(p) => <Input {...p} maxLength={80} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />}</Field>
          <Field label={t('admin.speed.intent')}>{(p) => <Select {...p} value={f.intent} onChange={(e) => setF({ ...f, intent: e.target.value })}><option value="">{t('admin.speed.anyIntent')}</option>{INTENTS.map((i) => <option key={i} value={i}>{t(`intent.${i}` as never)}</option>)}</Select>}</Field>
          <Field label={t('admin.speed.capacity')}>{(p) => <Input {...p} type="number" min={4} max={100} value={f.capacity} onChange={(e) => setF({ ...f, capacity: num(e.target.value, 20) })} />}</Field>
          <Field label={t('admin.speed.ageMin')}>{(p) => <Input {...p} type="number" min={18} max={99} value={f.ageMin} onChange={(e) => setF({ ...f, ageMin: num(e.target.value, 18) })} />}</Field>
          <Field label={t('admin.speed.ageMax')}>{(p) => <Input {...p} type="number" min={18} max={99} value={f.ageMax} onChange={(e) => setF({ ...f, ageMax: num(e.target.value, 99) })} />}</Field>
          <Field label={t('admin.speed.roundSeconds')}>{(p) => <Input {...p} type="number" min={60} max={600} value={f.roundSeconds} onChange={(e) => setF({ ...f, roundSeconds: num(e.target.value, 180) })} />}</Field>
          <Field label={t('admin.speed.rounds')}>{(p) => <Input {...p} type="number" min={2} max={10} value={f.rounds} onChange={(e) => setF({ ...f, rounds: num(e.target.value, 4) })} />}</Field>
          <div className="sm:col-span-2"><Button type="submit" loading={create.isPending}>{t('admin.speed.create')}</Button></div>
        </form>
      </Card>
      {q.isLoading && <Skeleton className="h-32" />}
      {q.data && <p className="text-sm text-muted">{t('admin.speed.stats', { events: q.data.stats.events, regs: q.data.stats.registrations, mutual: q.data.stats.mutualInterests, pairs: q.data.stats.pairs })}</p>}
      {q.data && q.data.items.length === 0 && <p className="text-center text-muted">{t('admin.speed.empty')}</p>}
      {!!q.data?.items.length && (
        <DataTable
          rows={q.data.items} rowKey={(r) => r.id} minWidth="44rem"
          columns={[
            { key: 'title', header: t('admin.speed.colTitle'), cell: (r) => <span className="font-semibold">{r.title}</span> },
            { key: 'when', header: t('admin.speed.colWhen'), cell: (r) => formatDate(r.startsAt, locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) },
            { key: 'reg', header: t('admin.speed.colRegistered'), cell: (r) => `${r.registered} / ${r.capacity}` },
            { key: 'status', header: t('admin.speed.colStatus'), cell: (r) => <Badge tone={r.phase === 'CANCELED' ? 'neutral' : r.phase === 'ROUND' || r.phase === 'DECISION' ? 'success' : 'brand'}>{t(`admin.speed.phase.${r.phase}` as never)}</Badge> },
            { key: 'mutual', header: t('admin.speed.colMutual'), cell: (r) => `${r.mutualInterests} / ${r.pairs}` },
            { key: 'act', header: t('admin.speed.cancel'), srOnlyHeader: true, cell: (r) => (r.status === 'SCHEDULED' || r.status === 'RUNNING') ? <Button size="sm" variant="outline" onClick={() => cancel.mutate(r.id)}>{t('admin.speed.cancel')}</Button> : null },
          ]}
        />
      )}
    </div>
  );
}
