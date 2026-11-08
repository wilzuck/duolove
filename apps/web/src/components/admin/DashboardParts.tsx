'use client';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Badge, Card, cn } from '@duomatch/ui';

export interface Flow { current: number; previous: number }
export interface SeriesPoint { day: string; value: number }

/** Évolution face à la période précédente : flèche + pourcentage + texte lisible par les lecteurs d'écran (la couleur ne porte jamais seule l'information). */
export function Delta({ flow }: { flow: Flow }) {
  const t = useTranslations();
  const { current, previous } = flow;
  if (previous === 0 && current === 0) return <Badge tone="neutral"><Minus className="size-3" aria-hidden />{t('admin.dash.stable')}</Badge>;
  if (previous === 0) return <Badge tone="brand"><TrendingUp className="size-3" aria-hidden />{t('admin.dash.isNew')}</Badge>;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return <Badge tone="neutral"><Minus className="size-3" aria-hidden />{t('admin.dash.stable')}</Badge>;
  return pct > 0
    ? <Badge tone="success"><TrendingUp className="size-3" aria-hidden /><span aria-hidden>+{pct} %</span><span className="sr-only">{t('admin.dash.up', { pct })}</span></Badge>
    : <Badge tone="danger"><TrendingDown className="size-3" aria-hidden /><span aria-hidden>{pct} %</span><span className="sr-only">{t('admin.dash.down', { pct: -pct })}</span></Badge>;
}

/** Mini-courbe décorative (la valeur exacte est écrite à côté). */
export function Sparkline({ points, className }: { points: SeriesPoint[]; className?: string }) {
  if (points.length < 2) return null;
  const max = Math.max(1, ...points.map((p) => p.value));
  const x = (i: number) => (i / (points.length - 1)) * 100;
  const y = (v: number) => 30 - (v / max) * 26;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden className={cn('h-10 w-full text-brand-strong', className)}>
      <path d={`${line} L100,32 L0,32 Z`} fill="currentColor" opacity="0.12" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Indicateur clé : libellé, grande valeur, évolution, mini-courbe, texte d'aide. */
export function KpiCard({ label, value, flow, series, hint, icon }: { label: string; value: string; flow?: Flow; series?: SeriesPoint[]; hint?: string; icon: ReactNode }) {
  return (
    <Card className="flex flex-col gap-2 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 text-sm text-muted"><span>{label}</span><span className="text-brand" aria-hidden>{icon}</span></div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display text-3xl font-extrabold tracking-tight">{value}</span>
        {flow && <Delta flow={flow} />}
      </div>
      {series && <Sparkline points={series} className="mt-1" />}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </Card>
  );
}

/** Graphique en barres par jour : infobulle native, repères, et tableau équivalent pour les lecteurs d'écran. */
export function TrendChart({ title, points, format, locale, total, delta }: { title: string; points: SeriesPoint[]; format: (v: number) => string; locale: string; total: string; delta?: Flow }) {
  const t = useTranslations();
  const max = Math.max(1, ...points.map((p) => p.value));
  const date = (iso: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(`${iso}T00:00:00`));
  const W = 600, H = 150, gap = points.length > 45 ? 1 : 3;
  const bw = (W - gap * (points.length - 1)) / points.length;
  const peak = points.reduce((a, p) => (p.value > a.value ? p : a), points[0] ?? { day: '', value: 0 });
  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div><h3 className="font-bold">{title}</h3><p className="mt-0.5 text-sm text-muted">{total}</p></div>
        {delta && <Delta flow={delta} />}
      </div>
      {points.length === 0 || peak.value === 0 ? <p className="py-10 text-center text-sm text-muted">{t('admin.dash.noData')}</p> : (
        <>
          <svg viewBox={`0 0 ${W} ${H + 2}`} role="img" aria-label={title} className="h-44 w-full">
            {[0, 0.5, 1].map((r) => <line key={r} x1="0" x2={W} y1={H - r * (H - 8)} y2={H - r * (H - 8)} className="stroke-line" strokeWidth="1" strokeDasharray={r === 0 ? undefined : '3 4'} />)}
            {points.map((p, i) => {
              const h = Math.max(p.value === 0 ? 0 : 3, (p.value / max) * (H - 8));
              return (
                <rect key={p.day} x={i * (bw + gap)} y={H - h} width={bw} height={h} rx={Math.min(3, bw / 2)} className={cn('fill-brand-strong transition-opacity hover:opacity-70', p.day === peak.day && 'fill-brand-strong')}>
                  <title>{`${date(p.day)} : ${format(p.value)}`}</title>
                </rect>
              );
            })}
          </svg>
          <div className="mt-1 flex justify-between text-xs text-muted"><span>{date(points[0]!.day)}</span><span>{t('admin.dash.peak', { value: format(peak.value), day: date(peak.day) })}</span><span>{date(points[points.length - 1]!.day)}</span></div>
          <table className="sr-only"><caption>{title}</caption><thead><tr><th scope="col">{t('admin.dash.day')}</th><th scope="col">{t('admin.dash.value')}</th></tr></thead>
            <tbody>{points.map((p) => <tr key={p.day}><th scope="row">{date(p.day)}</th><td>{format(p.value)}</td></tr>)}</tbody></table>
        </>
      )}
    </Card>
  );
}

/** Ligne de chiffre secondaire avec sa définition en clair. */
export function Metric({ label, value, hint, flow }: { label: string; value: string; hint?: string; flow?: Flow }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <dt className="flex items-center justify-between gap-2 text-sm text-muted"><span>{label}</span>{flow && <Delta flow={flow} />}</dt>
      <dd className="mt-1 font-display text-2xl font-extrabold">{value}</dd>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
