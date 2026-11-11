'use client';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@duomatch/ui';
import type { Affinity } from '@/lib/types';

/** Affinité estimée et raisons de la recommandation. Toujours présentée comme une estimation, jamais comme une garantie. */
export function AffinityPanel({ affinity }: { affinity: Affinity }) {
  const t = useTranslations();
  return (
    <section aria-labelledby="aff" className="space-y-3 rounded-3xl bg-soft p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 id="aff" className="flex items-center gap-2 font-bold"><Sparkles className="size-4 text-brand-ink" aria-hidden />{t('engagement.affinity.title')}</h3>
        <span className="font-display text-2xl font-extrabold text-brand-ink" aria-label={t('card.compat', { n: affinity.score })}>{affinity.score}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-card" role="presentation"><div className="h-full rounded-full bg-brand-strong" style={{ width: `${affinity.score}%` }} /></div>
      {affinity.reasons.length > 0 && (
        <div><p className="mb-1 text-sm font-semibold">{t('engagement.affinity.why')}</p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm marker:text-brand-ink">{affinity.reasons.map((r) => <li key={r.code}>{(t as unknown as (k: string, v?: Record<string, unknown>) => string)(`engagement.affinity.reasons.${r.code}`, { n: r.n ?? 0 })}</li>)}</ul>
        </div>
      )}
      {affinity.commonInterests.length > 0 && (
        <div><p className="mb-1 text-sm font-semibold">{t('engagement.affinity.common')}</p>
          <ul className="flex flex-wrap gap-1.5">{affinity.commonInterests.map((s) => <li key={s}><Badge tone="brand" className="border border-brand-strong/70">{t(`interest.${s}` as never)}</Badge></li>)}</ul>
        </div>
      )}
      <p className="text-xs text-muted">{t('engagement.affinity.disclaimer')}</p>
    </section>
  );
}
