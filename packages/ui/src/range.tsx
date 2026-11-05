'use client';
import { useId } from 'react';
import { cn } from './cn';

/** Curseur à deux poignées (minimum et maximum) fondé sur deux `<input type="range">` natifs : clavier, lecteur d'écran et tactile gratuits.
 *  Les poignées ne se croisent jamais ; `valueText` annonce la plage (« 25 à 40 ans »). */
export function RangeSlider({ label, min, max, step = 1, value, onChange, minLabel, maxLabel, valueText, className }: {
  label: string; min: number; max: number; step?: number; value: [number, number]; onChange: (v: [number, number]) => void;
  minLabel: string; maxLabel: string; valueText: string; className?: string;
}) {
  const id = useId();
  const [lo, hi] = value;
  const pct = (n: number) => ((n - min) / (max - min)) * 100;
  return (
    <div className={cn('space-y-2', className)} role="group" aria-labelledby={`${id}-l`}>
      <div className="flex items-baseline justify-between gap-3">
        <span id={`${id}-l`} className="text-sm font-medium text-fg">{label}</span>
        <output className="text-sm font-semibold text-brand-ink" aria-live="polite">{valueText}</output>
      </div>
      <div className="dual-range relative h-8">
        <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-soft" aria-hidden />
        <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-brand-strong" style={{ left: `${pct(lo)}%`, width: `${Math.max(pct(hi) - pct(lo), 0)}%` }} aria-hidden />
        <input type="range" min={min} max={max} step={step} value={lo} aria-label={minLabel} onChange={(e) => onChange([Math.min(Number(e.target.value), hi), hi])} />
        <input type="range" min={min} max={max} step={step} value={hi} aria-label={maxLabel} onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo)])} />
      </div>
    </div>
  );
}
