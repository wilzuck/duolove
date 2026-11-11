'use client';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { enUS, fr } from 'react-day-picker/locale';
import 'react-day-picker/style.css';
import { cn } from './cn';
import { Popover } from './popover';

const LOCALES = { fr, en: enUS } as const;

/** YYYY-MM-DD en heure locale (pas d'UTC : évite le décalage d'un jour). */
export const toIsoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const parseIsoDate = (v: string) => (v ? new Date(`${v}T00:00:00`) : undefined);

export interface DatePickerProps {
  id?: string;
  /** Valeur ISO « YYYY-MM-DD » (identique à un <input type="date">). */
  value: string;
  onChange: (value: string) => void;
  locale: string;
  /** Libellés fournis par l'application (traduits). */
  labels: { placeholder: string; clear: string };
  min?: Date;
  max?: Date;
  /** Menus année/mois : indispensable pour une date de naissance (évite des dizaines de clics). */
  dropdowns?: boolean;
  invalid?: boolean;
  'aria-describedby'?: string;
  className?: string;
}

/**
 * Sélecteur de date atomique (react-day-picker, base du calendrier shadcn/ui), adapté de WaMarcket.
 * Utiliser ce composant pour TOUTE date de calendrier de l'application.
 */
export function DatePicker({ id, value, onChange, locale, labels, min, max, dropdowns, invalid, className, ...aria }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const selected = parseIsoDate(value);
  const thisYear = new Date().getFullYear();

  return (
    <div ref={root} className={cn('relative', className)}>
      <button id={id} type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open} aria-invalid={invalid || undefined} aria-describedby={aria['aria-describedby']}
        className="flex h-12 w-full items-center justify-between gap-2 rounded-xl border border-field-line bg-field px-4 text-left transition hover:border-field-line-hover focus:border-brand aria-invalid:border-danger">
        <span className={selected ? '' : 'text-muted'}>
          {selected ? selected.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) : labels.placeholder}
        </span>
        <span className="flex items-center gap-1 text-muted">
          {selected && (
            <span role="button" tabIndex={0} aria-label={labels.clear} className="rounded-full p-1 hover:bg-soft"
              onClick={(e) => { e.stopPropagation(); onChange(''); setOpen(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onChange(''); } }}>
              <X className="size-4" />
            </span>
          )}
          <CalendarIcon className="size-4" aria-hidden />
        </span>
      </button>

      <Popover open={open} anchorRef={root} onClose={() => setOpen(false)}>
        <DayPicker mode="single" locale={LOCALES[locale as keyof typeof LOCALES] ?? enUS} selected={selected} defaultMonth={selected ?? max}
          captionLayout={dropdowns ? 'dropdown' : 'label'} startMonth={min ?? new Date(thisYear - 100, 0)} endMonth={max ?? new Date(thisYear + 10, 11)}
          disabled={[...(min ? [{ before: min }] : []), ...(max ? [{ after: max }] : [])]}
          onSelect={(d) => { onChange(d ? toIsoDate(d) : ''); setOpen(false); }} />
      </Popover>
    </div>
  );
}
