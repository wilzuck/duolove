'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Gift, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, Card, Field, Input } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { post } from '@/lib/api';
import { useUi } from '@/lib/store';

export interface AppliedPromo { code: string; percent: number }
type Lookup = { code: string; kind: 'PERCENT' | 'TOKENS'; percent?: number; tokens?: number };

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

  const lookup = useMutation({
    mutationFn: () => post<Lookup>('/promo/lookup', { code: code.trim().toUpperCase() }),
    onSuccess: (r) => {
      setError(null);
      if (r.kind === 'PERCENT') { onApply({ code: r.code, percent: r.percent ?? 0 }); setOffer(null); } else { onApply(null); setOffer(r); }
    },
    onError: (e) => { setOffer(null); setError(err(e)); },
  });
  const redeem = useMutation({
    mutationFn: () => post<{ tokens: number }>('/promo/redeem', { code: offer!.code }),
    onSuccess: (r) => { toast('success', t('promo.claimed', { n: r.tokens })); setOffer(null); setCode(''); void qc.invalidateQueries({ queryKey: ['credits'] }); void qc.invalidateQueries({ queryKey: ['live'] }); },
    onError: (e) => setError(err(e)),
  });

  return (
    <Card className="space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-bold"><Gift className="size-4 text-brand" aria-hidden />{t('promo.title')}</h2>
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim().length >= 3) lookup.mutate(); }}>
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
