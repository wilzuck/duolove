'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Copy, MapPin, ShieldCheck, Star } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge, Button, Card, Dialog, Field, Input, Select, Skeleton, Textarea, cn } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { useEngagementConfig } from '@/hooks/useQueries';
import { api, del, post, put } from '@/lib/api';
import { formatDate, formatTime } from '@/lib/format';
import { useUi } from '@/lib/store';
import type { DateItem } from '@/lib/types';

const KINDS = ['CAFE', 'RESTAURANT', 'PARK', 'MALL', 'CULTURE', 'OTHER_PUBLIC'] as const;
const DURATIONS = [60, 90, 120, 180] as const;
const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Formulaire de proposition (ou de nouvel horaire). La saisie locale est convertie en heure universelle avant l'envoi. */
function DateForm({ onSubmit, pending, minNotice, maxDays }: { onSubmit: (body: Record<string, unknown>) => void; pending: boolean; minNotice: number; maxDays: number }) {
  const t = useTranslations();
  const [now] = useState(() => Date.now()); // instantané pris à l'ouverture : bornes des champs date
  const earliest = new Date(now + minNotice * 3600_000);
  const [f, setF] = useState({ date: localDate(new Date(now + 2 * 86400_000)), time: '18:00', duration: 120, placeKind: 'CAFE', placeName: '', note: '' });
  const submit = () => {
    const start = new Date(`${f.date}T${f.time}`);
    onSubmit({ startsAt: start.toISOString(), endsAt: new Date(start.getTime() + f.duration * 60_000).toISOString(), placeKind: f.placeKind, placeName: f.placeName.trim(), ...(f.note.trim() ? { note: f.note.trim() } : {}) });
  };
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <Field label={t('dates.date')}>{(p) => <Input {...p} type="date" required min={localDate(earliest)} max={localDate(new Date(now + maxDays * 86400_000))} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />}</Field>
      <Field label={t('dates.time')}>{(p) => <Input {...p} type="time" required value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />}</Field>
      <Field label={t('dates.duration')}>{(p) => <Select {...p} value={f.duration} onChange={(e) => setF({ ...f, duration: Number(e.target.value) })}>{DURATIONS.map((d) => <option key={d} value={d}>{d >= 60 && d % 60 === 0 ? t('dates.hours', { n: d / 60 }) : t('dates.minutes', { n: d })}</option>)}</Select>}</Field>
      <Field label={t('dates.placeKind')}>{(p) => <Select {...p} value={f.placeKind} onChange={(e) => setF({ ...f, placeKind: e.target.value })}>{KINDS.map((k) => <option key={k} value={k}>{t(`dates.kind.${k}`)}</option>)}</Select>}</Field>
      <div className="sm:col-span-2"><Field label={t('dates.placeName')} hint={t('dates.placeHint')}>{(p) => <Input {...p} required minLength={2} maxLength={120} value={f.placeName} onChange={(e) => setF({ ...f, placeName: e.target.value })} />}</Field></div>
      <div className="sm:col-span-2"><Field label={t('dates.note')}>{(p) => <Textarea {...p} maxLength={300} className="min-h-20" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />}</Field></div>
      <div className="sm:col-span-2"><Button type="submit" loading={pending}>{t('dates.send')}</Button></div>
    </form>
  );
}

function DateCard({ d, name, onAct, busy, reschedule }: { d: DateItem; name: string; onAct: (a: string, v?: unknown) => Promise<unknown>; busy: boolean; reschedule: () => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const toast = useUi((s) => s.toast);
  const [link, setLink] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const started = new Date(d.startsAt).getTime() <= now;
  const tone = d.status === 'ACCEPTED' || d.status === 'COMPLETED' ? 'success' : d.status === 'PROPOSED' ? 'brand' : 'neutral';
  const copy = async () => { if (link) { await navigator.clipboard.writeText(link); toast('success', t('dates.shareCopied')); } };
  return (
    <Card className={cn('space-y-3 p-4', ['DECLINED', 'CANCELED', 'RESCHEDULED'].includes(d.status) && 'opacity-70')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="flex items-center gap-2 font-bold"><CalendarClock className="size-4 text-brand-ink" aria-hidden />{formatDate(d.startsAt, locale, { weekday: 'long', day: 'numeric', month: 'long' })} · {formatTime(d.startsAt, locale)}–{formatTime(d.endsAt, locale)}</p>
          <p className="flex items-center gap-2 text-sm"><MapPin className="size-4 text-brand-ink" aria-hidden />{d.placeName} <span className="text-muted">({t(`dates.kind.${d.placeKind}` as never)})</span></p>
          <p className="text-xs text-muted">{d.proposedByMe ? t('dates.fromMe') : t('dates.fromThem', { name })}</p>
          {d.note && <p className="text-sm italic text-muted">« {d.note} »</p>}
        </div>
        <Badge tone={tone}>{t(`dates.status.${d.status}` as never)}</Badge>
      </div>
      {d.status === 'PROPOSED' && !d.proposedByMe && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => onAct('accept')} loading={busy}>{t('dates.accept')}</Button>
          <Button size="sm" variant="outline" onClick={() => onAct('decline')} disabled={busy}>{t('dates.decline')}</Button>
          <Button size="sm" variant="ghost" onClick={reschedule}>{t('dates.reschedule')}</Button>
        </div>
      )}
      {d.status === 'PROPOSED' && d.proposedByMe && (
        <div className="flex flex-wrap items-center gap-2"><p className="text-sm text-muted">{t('dates.waiting', { name })}</p><Button size="sm" variant="outline" onClick={() => onAct('cancel')} disabled={busy}>{t('dates.cancel')}</Button></div>
      )}
      {d.status === 'ACCEPTED' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            {!started && (
              <label className="text-sm font-medium">{t('dates.reminder')}
                <Select className="mt-1 h-10" value={d.reminderMinutes ?? 0} onChange={(e) => onAct('reminder', Number(e.target.value))}>
                  <option value={0}>{t('dates.reminderNone')}</option><option value={60}>{t('dates.reminder60')}</option><option value={1440}>{t('dates.reminder1440')}</option>
                </Select>
              </label>
            )}
            {started && <div><Button size="sm" onClick={() => onAct('complete')} loading={busy}>{t('dates.complete')}</Button><p className="mt-1 text-xs text-muted">{t('dates.completeHint')}</p></div>}
            <Button size="sm" variant="outline" onClick={async () => { const r = await onAct('share'); if (r) setLink((r as { url: string }).url); }} disabled={busy}><ShieldCheck className="size-4" aria-hidden />{t('dates.share')}</Button>
            {d.shared && <Button size="sm" variant="ghost" onClick={() => { setLink(null); onAct('unshare'); }}>{t('dates.shareStop')}</Button>}
            <Button size="sm" variant="ghost" onClick={reschedule}>{t('dates.reschedule')}</Button>
            <Button size="sm" variant="ghost" onClick={() => onAct('cancel')} disabled={busy}>{t('dates.cancel')}</Button>
          </div>
          {d.shared && !link && <p className="text-xs text-muted">{t('dates.shareActive')}</p>}
          {link && (
            <div className="space-y-2 rounded-2xl bg-soft p-3 text-sm">
              <p>{t('dates.shareDone')}</p>
              <div className="flex gap-2"><Input readOnly aria-label={t('dates.shareCopy')} value={link} onFocus={(e) => e.currentTarget.select()} /><Button type="button" variant="outline" onClick={() => void copy()}><Copy className="size-4" aria-hidden />{t('dates.shareCopy')}</Button></div>
            </div>
          )}
        </div>
      )}
      {d.status === 'COMPLETED' && (
        <div className="space-y-1.5">
          {d.myFeedback == null ? (
            <>
              <p className="text-sm font-semibold">{t('dates.feedbackTitle')}</p><p className="text-xs text-muted">{t('dates.feedbackHint')}</p>
              <div className="flex gap-1" role="group" aria-label={t('dates.feedbackTitle')}>
                {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" onClick={() => onAct('feedback', n)} aria-label={t('dates.feedbackRate', { n })} className="rounded-full p-1.5 text-brand-ink hover:bg-soft"><Star className="size-6" /></button>)}
              </div>
            </>
          ) : <p className="text-sm text-muted">{t('dates.feedbackThanks')}</p>}
        </div>
      )}
    </Card>
  );
}

/** Mode rendez-vous d'une conversation : liste, proposition, réponses, rappels, partage volontaire avec un proche, retour facultatif. */
export function DatesPanel({ conversationId, name, open, onClose }: { conversationId: string; name: string; open: boolean; onClose: () => void }) {
  const t = useTranslations();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const { data: cfg } = useEngagementConfig();
  const [form, setForm] = useState<{ replaces: string | null } | null>(null);
  const q = useQuery({ queryKey: ['dates', conversationId], queryFn: () => api<{ items: DateItem[] }>(`/conversations/${conversationId}/dates`), enabled: open, retry: false });
  const refresh = () => qc.invalidateQueries({ queryKey: ['dates', conversationId] });
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => (form?.replaces ? post<DateItem>(`/dates/${form.replaces}/reschedule`, body) : post<DateItem>(`/conversations/${conversationId}/dates`, body)),
    onSuccess: () => { toast('success', t('dates.toast.proposed')); setForm(null); void refresh(); },
    onError: (e) => toast('error', err(e)),
  });
  const act = useMutation({
    mutationFn: ({ id, action, value }: { id: string; action: string; value?: unknown }) => {
      if (action === 'reminder') return put(`/dates/${id}/reminder`, { minutesBefore: value });
      if (action === 'feedback') return put(`/dates/${id}/feedback`, { rating: value });
      if (action === 'unshare') return del(`/dates/${id}/share`);
      return post(`/dates/${id}/${action}`);
    },
    onSuccess: (_r, v) => { if (v.action !== 'share') toast('success', t('dates.toast.updated')); void refresh(); },
    onError: (e) => toast('error', err(e)),
  });
  const run = async (id: string, action: string, value?: unknown) => { try { return await act.mutateAsync({ id, action, value }); } catch { return undefined; } };
  const items = q.data?.items ?? [];
  const tips = t.raw('dates.safety') as string[];
  return (
    <Dialog open={open} onClose={() => { setForm(null); onClose(); }} title={t('dates.title', { name })} closeLabel={t('common.close')} className="w-[min(96vw,40rem)]">
      <div className="max-h-[75dvh] space-y-4 overflow-y-auto pr-1">
        <section aria-labelledby="safe" className="rounded-2xl bg-soft p-4 text-sm">
          <h3 id="safe" className="mb-1 flex items-center gap-2 font-bold"><ShieldCheck className="size-4 text-brand-ink" aria-hidden />{t('dates.safetyTitle')}</h3>
          <ul className="list-disc space-y-0.5 pl-5 marker:text-brand-ink">{tips.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>
        {form ? (
          <section aria-labelledby="newd" className="space-y-3"><h3 id="newd" className="font-bold">{t(form.replaces ? 'dates.reschedule' : 'dates.propose')}</h3>
            <DateForm onSubmit={(b) => create.mutate(b)} pending={create.isPending} minNotice={cfg?.dates.minNoticeHours ?? 2} maxDays={cfg?.dates.maxDaysAhead ?? 30} />
            <Button variant="ghost" onClick={() => setForm(null)}>{t('common.cancel')}</Button></section>
        ) : <Button onClick={() => setForm({ replaces: null })}><CalendarClock className="size-4" aria-hidden />{t('dates.propose')}</Button>}
        {q.isLoading && <Skeleton className="h-24" />}
        {q.data && items.length === 0 && !form && <p className="text-sm text-muted">{t('dates.empty')}</p>}
        <ul className="space-y-3">{items.map((d) => <li key={d.id}><DateCard d={d} name={name} busy={act.isPending} onAct={(a, v) => run(d.id, a, v)} reschedule={() => setForm({ replaces: d.id })} /></li>)}</ul>
      </div>
    </Dialog>
  );
}
