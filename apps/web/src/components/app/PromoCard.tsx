'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gift, Sparkles, Timer, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button, Card, Field, Input, cn } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { api, post } from '@/lib/api';
import { useUi } from '@/lib/store';

export interface AppliedPromo { code: string; percent: number }
type Featured = { code: string; kind: 'PERCENT' | 'TOKENS'; percent: number | null; tokens: number | null; remaining: number | null; deadline: string | null };
type Lookup = { code: string; kind: 'PERCENT' | 'TOKENS'; percent?: number; tokens?: number };

/** Compte à rebours jusqu'à la fin RÉELLE du délai (fixée par le serveur à l'inscription : recharger la page ou changer d'appareil ne la prolonge pas). À zéro, l'offre est retirée. */
function Countdown({ to, onEnd }: { to: string; onEnd: () => void }) {
  const t = useTranslations();
  const end = new Date(to).getTime();
  const [left, setLeft] = useState(() => end - Date.now());
  useEffect(() => {
    const h = setInterval(() => { const d = end - Date.now(); setLeft(d); if (d <= 0) { clearInterval(h); onEnd(); } }, 1000);
    return () => clearInterval(h);
  }, [end, onEnd]);
  const s = Math.max(0, Math.floor(left / 1000));
  const p2 = (n: number) => String(n).padStart(2, '0');
  const clock = `${p2(Math.floor(s / 3600))}:${p2(Math.floor((s % 3600) / 60))}:${p2(s % 60)}`;
  const urgent = s < 3600;
  return <span role="timer" aria-label={t('promo.endsIn', { time: clock })} className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs font-semibold tabular-nums', urgent ? 'bg-danger/10 text-danger-ink' : 'bg-card text-brand-ink')}><Timer className="size-3.5" aria-hidden />{clock}</span>;
}

/** Prix affiché après remise : même arrondi que le serveur (qui reste seul juge du montant réellement payé). */
export const discounted = (priceXof: number, percent: number) => priceXof - Math.round((priceXof * percent) / 100);

/**
 * Saisie d'un code promo. Remise en % → mémorisée par la page pour le prochain paiement ;
 * jetons offerts → bouton de récupération (crédités une seule fois côté serveur).
 */
export function PromoCard({ applied, onApply }: { applied: AppliedPromo | null; onApply: (p: AppliedPromo | null) => void }) {
  const t = useTranslations();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const [code, setCode] = useState('');
  const [offer, setOffer] = useState<Lookup | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Codes que l'administration propose à tous : affichés d'office, un clic sur « Appliquer » suffit.
  const featured = useQuery({ queryKey: ['promo-featured'], queryFn: () => api<{ items: Featured[] }>('/promo/featured'), staleTime: 60_000 });
  const refetchOffers = () => { void featured.refetch(); };
  const offers = (featured.data?.items ?? []).filter((o) => o.code !== applied?.code);
  const lookup = useMutation({
    mutationFn: (c?: string) => post<Lookup>('/promo/lookup', { code: (c ?? code).trim().toUpperCase() }),
    onSuccess: (r) => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['promo-featured'] });
      if (r.kind === 'PERCENT') { onApply({ code: r.code, percent: r.percent ?? 0 }); setOffer(null); } else { onApply(null); setOffer(r); }
    },
    onError: (e) => { setOffer(null); setError(err(e)); },
  });
  const redeem = useMutation({
    mutationFn: () => post<{ tokens: number }>('/promo/redeem', { code: offer!.code }),
    onSuccess: (r) => { toast('success', t('promo.claimed', { n: r.tokens })); setOffer(null); setCode(''); void qc.invalidateQueries({ queryKey: ['promo-featured'] }); void qc.invalidateQueries({ queryKey: ['credits'] }); void qc.invalidateQueries({ queryKey: ['live'] }); },
    onError: (e) => setError(err(e)),
  });

  return (
    <Card className="space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-bold"><Gift className="size-4 text-brand" aria-hidden />{t('promo.title')}</h2>
      {offers.map((o) => (
        <div key={o.code} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand/30 bg-soft p-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-ink"><Sparkles className="size-4" aria-hidden />{o.kind === 'PERCENT' ? t('promo.offerPercent', { percent: o.percent ?? 0 }) : t('promo.offerTokens', { n: o.tokens ?? 0 })}</p>
            <p className="mt-0.5 text-sm text-muted"><span className="font-mono font-semibold text-fg">{o.code}</span>{o.remaining !== null && <> · {t('promo.remaining', { n: o.remaining })}</>}</p>
            {o.deadline && <p className="mt-1.5 flex items-center gap-2 text-xs text-muted">{t('promo.endsLabel')}<Countdown to={o.deadline} onEnd={refetchOffers} /></p>}
          </div>
          <Button size="sm" loading={lookup.isPending && lookup.variables === o.code} onClick={() => lookup.mutate(o.code)}>{t('promo.apply')}</Button>
        </div>
      ))}
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim().length >= 3) lookup.mutate(undefined); }}>
        <div className="flex-1"><Field label={t('promo.label')} error={error ?? undefined}>{(p) => <Input {...p} autoComplete="off" autoCapitalize="characters" maxLength={32} value={code} onChange={(e) => setCode(e.target.value)} />}</Field></div>
        <Button type="submit" variant="secondary" loading={lookup.isPending} disabled={code.trim().length < 3}>{t('promo.apply')}</Button>
      </form>
      {applied && (
        <p role="status" className="flex items-center justify-between gap-2 rounded-2xl bg-soft p-3 text-sm font-medium text-brand-ink">
          <span>{t('promo.percentApplied', { code: applied.code, percent: applied.percent })}</span>
          <button type="button" className="inline-flex size-8 items-center justify-center rounded-full hover:bg-white/60" aria-label={t('promo.remove')} onClick={() => { onApply(null); setCode(''); }}><X className="size-4" aria-hidden /></button>
        </p>
      )}
      {offer && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-soft p-3 text-sm font-medium text-brand-ink">
          <span>{t('promo.tokensOffer', { code: offer.code, n: offer.tokens ?? 0 })}</span>
          <Button size="sm" loading={redeem.isPending} onClick={() => redeem.mutate()}>{t('promo.claim')}</Button>
        </div>
      )}
      <p className="text-xs text-muted">{t('promo.hint')}</p>
    </Card>
  );
}
