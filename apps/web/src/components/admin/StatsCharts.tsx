'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Card, cn } from '@duomatch/ui';
import { Delta, type Flow, type SeriesPoint } from './DashboardParts';

export interface Line { key: string; label: string; points: SeriesPoint[]; /** classe Tailwind `text-*` : la couleur de la courbe (currentColor) */ color: string }

/**
 * Courbes (une ou plusieurs séries) sur les mêmes jours, avec survol : un repère vertical et une infobulle donnent la valeur de chaque série ce jour-là.
 * Un tableau caché reprend les valeurs pour les lecteurs d'écran ; la légende nomme chaque courbe (la couleur ne porte jamais seule l'information).
 */
export function LineChart({ title, subtitle, lines, locale, format, area = false, delta }: { title: string; subtitle?: string; lines: Line[]; locale: string; format: (v: number) => string; area?: boolean; delta?: Flow }) {
  const t = useTranslations();
  const [hover, setHover] = useState<number | null>(null);
  const n = lines[0]?.points.length ?? 0;
  const max = Math.max(1, ...lines.flatMap((l) => l.points.map((p) => p.value)));
  const W = 600, H = 170, top = 10, bottom = 4;
  const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => H - bottom - (v / max) * (H - top - bottom);
  const date = (iso: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(`${iso}T00:00:00`));
  const empty = n === 0 || lines.every((l) => l.points.every((p) => p.value === 0));
  const path = (pts: SeriesPoint[]) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
  };
  const hx = hover == null ? 0 : (x(hover) / W) * 100;
  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div><h3 className="font-bold">{title}</h3>{subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}</div>
        {delta && <Delta flow={delta} />}
      </div>
      {lines.length > 1 && <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">{lines.map((l) => <li key={l.key} className="flex items-center gap-1.5"><span className={cn('h-1 w-4 rounded-full bg-current', l.color)} aria-hidden />{l.label}</li>)}</ul>}
      {empty ? <p className="py-10 text-center text-sm text-muted">{t('admin.dash.noData')}</p> : (
        <>
          <div className="relative">
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="h-44 w-full touch-pan-y" onMouseMove={onMove} onMouseLeave={() => setHover(null)} onTouchMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const c = e.touches[0]; if (c) setHover(Math.max(0, Math.min(n - 1, Math.round(((c.clientX - r.left) / r.width) * (n - 1))))); }} onTouchEnd={() => setHover(null)} preserveAspectRatio="none">
              {[0, 0.5, 1].map((r) => <line key={r} x1="0" x2={W} y1={H - bottom - r * (H - top - bottom)} y2={H - bottom - r * (H - top - bottom)} className="stroke-line" strokeWidth="1" strokeDasharray={r === 0 ? undefined : '3 4'} vectorEffect="non-scaling-stroke" />)}
              {lines.map((l) => (
                <g key={l.key} className={l.color}>
                  {(area || lines.length === 1) && <path d={`${path(l.points)} L${x(n - 1)},${H - bottom} L${x(0)},${H - bottom} Z`} fill="currentColor" fillOpacity="0.14" />}
                  <path d={path(l.points)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                </g>
              ))}
              {hover != null && <line x1={x(hover)} x2={x(hover)} y1={top} y2={H - bottom} className="stroke-muted" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
            </svg>
            {hover != null && (
              <>
                {lines.map((l) => <span key={l.key} aria-hidden className={cn('pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current ring-2 ring-card', l.color)} style={{ left: `${hx}%`, top: `${(y(l.points[hover]!.value) / H) * 100}%` }} />)}
                <div aria-hidden className="pointer-events-none absolute top-0 z-10 min-w-28 rounded-xl border border-line bg-card px-3 py-2 text-xs shadow-pop" style={{ left: `${hx}%`, transform: `translateX(${hx > 60 ? '-105%' : '5%'})` }}>
                  <p className="mb-1 font-semibold">{date(lines[0]!.points[hover]!.day)}</p>
                  {lines.map((l) => <p key={l.key} className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-muted"><span className={cn('size-2 rounded-full bg-current', l.color)} />{l.label}</span><span className="font-bold">{format(l.points[hover]!.value)}</span></p>)}
                </div>
              </>
            )}
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted"><span>{date(lines[0]!.points[0]!.day)}</span><span>{date(lines[0]!.points[n - 1]!.day)}</span></div>
          <table className="sr-only"><caption>{title}</caption>
            <thead><tr><th scope="col">{t('admin.dash.day')}</th>{lines.map((l) => <th key={l.key} scope="col">{l.label}</th>)}</tr></thead>
            <tbody>{lines[0]!.points.map((p, i) => <tr key={p.day}><th scope="row">{date(p.day)}</th>{lines.map((l) => <td key={l.key}>{format(l.points[i]!.value)}</td>)}</tr>)}</tbody></table>
        </>
      )}
    </Card>
  );
}
