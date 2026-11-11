'use client';
import { CalendarDays } from 'lucide-react';
import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button, Popover, RangeCalendar, cn, toIsoDate, type DateRange } from '@duomatch/ui';

/** Période d'un tableau de bord : un nombre de jours glissants, ou deux dates (bornes incluses, jours calendaires UTC comme le serveur). */
export type Period = { days: number } | { from: string; to: string };
export const MAX_PERIOD_DAYS = 366;

/** Paramètres d'URL de la période (`days=30` ou `from=…&to=…`). */
export const periodQuery = (p: Period) => ('days' in p ? `days=${p.days}` : `from=${p.from}&to=${p.to}`);

const utcDay = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
const parse = (v: string) => { const [y, m, d] = v.split('-').map(Number); return new Date(y!, m! - 1, d); };

/** Boutons « 7 / 30 / 90 jours » + « Personnalisée » : ouvre un calendrier où l'on choisit un début et une fin. */
export function PeriodPicker({ presets, label, value, onChange, className }: { presets: readonly number[]; label: (days: number) => string; value: Period; onChange: (p: Period) => void; className?: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();
  const custom = 'from' in value;
  const today = new Date();
  const fmt = (d: Date) => d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const span = draft?.from && draft.to ? Math.round((utcDay(draft.to).getTime() - utcDay(draft.from).getTime()) / 86_400_000) + 1 : 0;
  const ok = span >= 1 && span <= MAX_PERIOD_DAYS;
  const pill = (on: boolean) => cn('rounded-full px-3.5 py-1.5 text-sm font-semibold transition', on ? 'bg-brand-strong text-white' : 'text-muted hover:bg-soft hover:text-fg');

  return (
    <div ref={root} className={cn('relative inline-flex', className)}>
      <div role="group" aria-label={t('admin.period.label')} className="inline-flex flex-wrap rounded-full border border-field-line bg-field p-1">
        {presets.map((p) => <button key={p} type="button" aria-pressed={!custom && 'days' in value && value.days === p} onClick={() => { setOpen(false); onChange({ days: p }); }} className={pill(!custom && 'days' in value && value.days === p)}>{label(p)}</button>)}
        <button type="button" aria-pressed={custom} aria-haspopup="dialog" aria-expanded={open} onClick={() => { if (!open) setDraft(custom ? { from: parse(value.from), to: parse(value.to) } : undefined); setOpen((o) => !o); }} className={cn(pill(custom), 'inline-flex items-center gap-1.5')}>
          <CalendarDays className="size-4" aria-hidden />{custom ? `${fmt(parse(value.from))} – ${fmt(parse(value.to))}` : t('admin.period.custom')}
        </button>
      </div>
      <Popover open={open} anchorRef={root} onClose={() => setOpen(false)} align="end">
        <RangeCalendar value={draft} onChange={setDraft} locale={locale} max={today} maxDays={MAX_PERIOD_DAYS} />
        <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-3">
          <p className={cn('text-sm', draft?.from && !ok ? 'text-danger-ink' : 'text-muted')} role={draft?.from && !ok ? 'alert' : undefined}>
            {!draft?.from ? t('admin.period.pick') : !draft.to ? `${fmt(draft.from)} → …` : ok ? `${fmt(draft.from)} → ${fmt(draft.to)} · ${t('admin.period.days', { n: span })}` : t('admin.period.invalid', { max: MAX_PERIOD_DAYS })}
          </p>
          <Button size="sm" disabled={!ok} onClick={() => { if (draft?.from && draft.to) { onChange({ from: toIsoDate(draft.from), to: toIsoDate(draft.to) }); setOpen(false); } }}>{t('admin.period.apply')}</Button>
        </div>
      </Popover>
    </div>
  );
}
