'use client';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, type ReactNode } from 'react';
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

/** Courbe lisse passant par tous les points (Catmull-Rom → Bézier), sans dépasser les valeurs voisines pour ne jamais « creuser » sous zéro. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0]!.x.toFixed(2)},${pts[0]!.y.toFixed(2)}`;
  let d = `M${pts[0]!.x.toFixed(2)},${pts[0]!.y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[i + 2] ?? p2;
    const lo = Math.min(p1.y, p2.y), hi = Math.max(p1.y, p2.y);
    const c1y = Math.min(hi, Math.max(lo, p1.y + (p2.y - p0.y) / 6));
    const c2y = Math.min(hi, Math.max(lo, p2.y - (p3.y - p1.y) / 6));
    d += ` C${(p1.x + (p2.x - p0.x) / 6).toFixed(2)},${c1y.toFixed(2)} ${(p2.x - (p3.x - p1.x) / 6).toFixed(2)},${c2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

/** Mini-courbe décorative (la valeur exacte est écrite à côté). */
export function Sparkline({ points, className }: { points: SeriesPoint[]; className?: string }) {
  if (points.length < 2) return null;
  const max = Math.max(1, ...points.map((p) => p.value));
  const x = (i: number) => (i / (points.length - 1)) * 100;
  const y = (v: number) => 30 - (v / max) * 26;
  const line = smoothPath(points.map((p, i) => ({ x: x(i), y: y(p.value) })));
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

/** Courbe lissée par jour : repère au survol avec infobulle, repères horizontaux, et tableau équivalent pour les lecteurs d'écran. */
export function TrendChart({ title, points, format, locale, total, delta }: { title: string; points: SeriesPoint[]; format: (v: number) => string; locale: string; total: string; delta?: Flow }) {
  const t = useTranslations();
  const gid = useId();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => p.value));
  const date = (iso: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(`${iso}T00:00:00`));
  const W = 600, H = 150, top = 14;
  const px = (i: number) => (points.length > 1 ? (i / (points.length - 1)) * W : W / 2);
  const py = (v: number) => H - (v / max) * (H - top);
  const xy = points.map((p, i) => ({ x: px(i), y: py(p.value) }));
  const line = smoothPath(xy);
  const peak = points.reduce((a, p) => (p.value > a.value ? p : a), points[0] ?? { day: '', value: 0 });
  const h = hover !== null ? points[hover] : undefined;
  const hx = hover !== null ? (xy[hover]!.x / W) * 100 : 0;
  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div><h3 className="font-bold">{title}</h3><p className="mt-0.5 text-sm text-muted">{total}</p></div>
        {delta && <Delta flow={delta} />}
      </div>
      {points.length === 0 || peak.value === 0 ? <p className="py-10 text-center text-sm text-muted">{t('admin.dash.noData')}</p> : (
        <>
          <div className="relative h-44 w-full" onPointerLeave={() => setHover(null)}>
            <svg viewBox={`0 0 ${W} ${H + 2}`} preserveAspectRatio="none" role="img" aria-label={title} className="absolute inset-0 size-full overflow-visible">
              <defs>
                <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--brand-strong)" stopOpacity="0.28" /><stop offset="100%" stopColor="var(--brand-strong)" stopOpacity="0" /></linearGradient>
              </defs>
              {[0, 0.5, 1].map((r) => <line key={r} x1="0" x2={W} y1={H - r * (H - top)} y2={H - r * (H - top)} className="stroke-line" strokeWidth="1" strokeDasharray={r === 0 ? undefined : '3 4'} vectorEffect="non-scaling-stroke" />)}
              <path d={`${line} L${xy[xy.length - 1]!.x.toFixed(2)},${H} L${xy[0]!.x.toFixed(2)},${H} Z`} fill={`url(#${gid})`} />
              <path d={line} fill="none" stroke="var(--brand-strong)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>
            {points.map((p, i) => <span key={p.day} className="absolute inset-y-0 cursor-crosshair" style={{ left: `${(xy[i]!.x / W) * 100 - 50 / points.length}%`, width: `${100 / points.length}%` }} onPointerEnter={() => setHover(i)} />)}
            {h && (
              <>
                <span aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-brand-strong/25" style={{ left: `${hx}%` }} />
                <span aria-hidden className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand-strong shadow" style={{ left: `${hx}%`, top: `${(xy[hover!]!.y / (H + 2)) * 100}%` }} />
                <span aria-hidden className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg bg-fg px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-bg shadow-pop" style={{ left: `${Math.min(88, Math.max(12, hx))}%` }}>{date(h.day)} · {format(h.value)}</span>
              </>
            )}
          </div>
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
