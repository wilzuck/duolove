'use client';
import { useTranslations } from 'next-intl';
import type { Affinity } from '@/lib/types';

const AXES = ['intent', 'preferences', 'interests', 'location'] as const;

/** Compatibilité en quatre axes lisibles (jamais un pourcentage trompeur) : intention, préférences, centres d'intérêt, proximité. */
export function DuoGauge({ affinity, tone = 'light' }: { affinity: Affinity; tone?: 'light' | 'dark' }) {
  const t = useTranslations();
  const axes = affinity.axes;
  if (!axes) return null;
  const tier = (v: number) => (v >= 75 ? 'strong' : v >= 50 ? 'good' : v >= 25 ? 'fair' : 'light');
  const dark = tone === 'dark';
  return (
    <dl className="space-y-1.5" aria-label={t('engagement.gauge.title')}>
      {AXES.map((k) => {
        const v = Math.max(0, Math.min(100, axes[k] ?? 0));
        const word = k === 'interests' && affinity.commonInterests.length > 0 ? t('engagement.gauge.common', { n: affinity.commonInterests.length }) : t(`engagement.gauge.tier.${tier(v)}`);
        return (
          <div key={k} className="grid grid-cols-[6.5rem_1fr_5.5rem] items-center gap-2 text-xs">
            <dt className={dark ? 'text-white/90' : 'text-fg'}>{t(`engagement.gauge.axis.${k}`)}</dt>
            <dd className="contents">
              <span role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-label={t(`engagement.gauge.axis.${k}`)} className={dark ? 'h-1.5 rounded-full bg-white/25' : 'h-1.5 rounded-full bg-soft'}>
                <span className={dark ? 'block h-1.5 rounded-full bg-white' : 'block h-1.5 rounded-full bg-brand-strong'} style={{ width: `${Math.max(v, 4)}%` }} />
              </span>
              <span className={dark ? 'text-right text-white/90' : 'text-right text-muted'}>{word}</span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
