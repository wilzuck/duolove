'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Moon, PauseCircle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Field, Input, Select, Skeleton, Switch } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { api, del, post, put } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useUi } from '@/lib/store';
import type { RhythmState } from '@/lib/types';

const DAYS = [3, 7, 14, 30] as const;

/** Votre rythme : mode pause, période de repos, rappels. Tout est facultatif et réversible ; les alertes de sécurité et d'abonnement restent toujours envoyées. */
export function RhythmCard() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const q = useQuery({ queryKey: ['engagement', 'rhythm'], queryFn: () => api<RhythmState>('/engagement/me/rhythm') });
  const [days, setDays] = useState<string>('7');
  const [quiet, setQuiet] = useState<{ start: string; end: string } | null>(null);
  const done = (r: RhythmState) => { qc.setQueryData(['engagement', 'rhythm'], r); void qc.invalidateQueries({ queryKey: ['me'] }); void qc.invalidateQueries({ queryKey: ['feed'] }); void qc.invalidateQueries({ queryKey: ['daily'] }); };
  const pause = useMutation({ mutationFn: () => post<RhythmState>('/engagement/me/pause', days === 'max' ? {} : { days: Number(days) }), onSuccess: (r) => { done(r); toast('success', t('rhythm.paused')); }, onError: (e) => toast('error', err(e)) });
  const resume = useMutation({ mutationFn: () => del<RhythmState>('/engagement/me/pause'), onSuccess: (r) => { done(r); toast('success', t('rhythm.resumed')); }, onError: (e) => toast('error', err(e)) });
  const save = useMutation({
    mutationFn: (b: Record<string, unknown>) => put<RhythmState>('/engagement/me/rhythm', { tzOffsetMinutes: -new Date().getTimezoneOffset(), ...b }),
    onSuccess: (r, b) => { done(r); if ('quietStart' in b) toast('success', t('rhythm.quietSaved')); },
    onError: (e) => toast('error', err(e)),
  });
  if (!q.data) return <Skeleton className="h-64" />;
  const r = q.data;
  const q2 = quiet ?? { start: r.quiet.start ?? '22:00', end: r.quiet.end ?? '07:00' };
  return (
    <div className="space-y-5">
      <p className="text-muted">{t('rhythm.intro')}</p>
      <Card className="space-y-4 p-5">
        <h3 className="flex items-center gap-2 font-bold"><PauseCircle className="size-5 text-brand-ink" aria-hidden />{t('rhythm.pauseTitle')}{r.pause.active && <Badge tone="brand">{t('rhythm.bannerTitle')}</Badge>}</h3>
        <p className="text-sm text-muted">{t('rhythm.pauseText')}</p>
        {r.pause.active ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-medium">{t('rhythm.pauseActive', { date: r.pause.endsAt ? formatDate(r.pause.endsAt, locale) : '' })}</p>
            <Button onClick={() => resume.mutate()} loading={resume.isPending}>{t('rhythm.resume')}</Button>
          </div>
        ) : r.pause.enabled ? (
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t('rhythm.pauseFor')}>{(p) => (
              <Select {...p} className="min-w-48" value={days} onChange={(e) => setDays(e.target.value)}>
                {DAYS.filter((d) => d <= r.pause.maxDays).map((d) => <option key={d} value={d}>{t('rhythm.days', { n: d })}</option>)}
                <option value="max">{t('rhythm.pauseUntilMax', { n: r.pause.maxDays })}</option>
              </Select>
            )}</Field>
            <Button variant="outline" onClick={() => pause.mutate()} loading={pause.isPending}>{t('rhythm.pauseStart')}</Button>
          </div>
        ) : <Alert tone="success">{t('rhythm.pauseOff')}</Alert>}
      </Card>

      <Card className="space-y-4 p-5">
        <h3 className="flex items-center gap-2 font-bold"><Moon className="size-5 text-brand-ink" aria-hidden />{t('rhythm.quietTitle')}{r.quiet.activeNow && <Badge tone="neutral">{t('rhythm.quietNow')}</Badge>}</h3>
        <p className="text-sm text-muted">{t('rhythm.quietText')}</p>
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate({ quietStart: q2.start, quietEnd: q2.end }); }}>
          <Field label={t('rhythm.quietStart')}>{(p) => <Input {...p} type="time" required value={q2.start} onChange={(e) => setQuiet({ ...q2, start: e.target.value })} />}</Field>
          <Field label={t('rhythm.quietEnd')}>{(p) => <Input {...p} type="time" required value={q2.end} onChange={(e) => setQuiet({ ...q2, end: e.target.value })} />}</Field>
          <Button type="submit" loading={save.isPending}>{t('rhythm.quietSave')}</Button>
          {r.quiet.start && <Button type="button" variant="ghost" onClick={() => { setQuiet(null); save.mutate({ quietStart: null, quietEnd: null }); }}>{t('rhythm.quietClear')}</Button>}
        </form>
        {!r.quiet.start && <p className="text-xs text-muted">{t('rhythm.quietOff')}</p>}
      </Card>

      <Card className="divide-y divide-line px-5">
        <div className="flex items-center justify-between gap-4 py-4">
          <div><p className="font-semibold">{t('rhythm.remindersTitle')}</p><p className="text-sm text-muted">{t('rhythm.remindersText')}</p></div>
          <Switch checked={r.dateReminders} onChange={(v) => save.mutate({ dateReminders: v })} label={t('rhythm.remindersTitle')} />
        </div>
        <p className="py-4 text-sm text-muted">{t('rhythm.emailCap', { n: r.limits.maxEmailsPerDay })}</p>
      </Card>
    </div>
  );
}
