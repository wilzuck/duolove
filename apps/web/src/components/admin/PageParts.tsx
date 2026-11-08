'use client';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { cn } from '@duomatch/ui';
import { api } from '@/lib/api';

export interface Summary {
  users: Record<string, number>; reports: Record<string, number>;
  payments?: Record<string, number>; subscriptions?: Record<string, number>; refunds?: Record<string, number>; contact?: Record<string, number>;
}

/** Compteurs par section (indicateurs et onglets) ; rafraîchis chaque minute et après toute action d'administration. */
export function useAdminSummary() {
  return useQuery({ queryKey: ['admin', 'summary'], queryFn: () => api<Summary>('/admin/summary'), refetchInterval: 60_000 });
}

/** En-tête de page : titre, phrase qui dit à quoi sert la page, actions éventuelles à droite. */
export function PageHeader({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-xl font-extrabold">{title}</h2>
        {description && <p className="mt-0.5 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

type Tone = 'default' | 'success' | 'warn' | 'danger';
const TONE: Record<Tone, string> = { default: '', success: 'text-success-ink', warn: 'text-gold-ink', danger: 'text-danger-ink' };

/** Bandeau de chiffres clés en tête de page : on voit l'état d'un coup d'œil avant de lire le tableau. */
export function StatStrip({ items }: { items: { label: string; value: string | number | undefined; tone?: Tone; hint?: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((i) => (
        <div key={i.label} className="rounded-2xl border border-line bg-card px-4 py-3">
          <dt className="text-xs font-medium text-muted">{i.label}</dt>
          <dd className={cn('mt-0.5 font-display text-2xl font-extrabold', TONE[i.tone ?? 'default'])}>{i.value ?? '–'}</dd>
          {i.hint && <p className="text-xs text-muted">{i.hint}</p>}
        </div>
      ))}
    </dl>
  );
}

/** Onglets de statut avec compteur (remplacent une liste déroulante : tous les états sont visibles, un clic suffit). */
export function StatusTabs<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { key: T; label: string; count?: number }[] }) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o.key} type="button" role="tab" aria-selected={value === o.key} onClick={() => onChange(o.key)}
          className={cn('inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition',
            value === o.key ? 'border-brand-strong bg-brand-strong text-white' : 'border-field-line bg-field text-fg hover:bg-soft')}>
          {o.label}
          {o.count !== undefined && <span className={cn('min-w-5 rounded-full px-1.5 text-center text-xs', value === o.key ? 'bg-white/25' : 'bg-soft text-muted')}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Compteur d'un statut (undefined tant que la synthèse n'est pas chargée). */
export const countOf = (r: Record<string, number> | undefined, k: string) => (r ? (r[k] ?? 0) : undefined);
