'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useApiError } from '@/hooks/useApiError';
import { useRouter } from '@/i18n/navigation';
import { post } from '@/lib/api';
import { CANCELLED, SUPERSEDED, payWithKkiapay, type KkiapayWidgetConfig } from '@/lib/kkiapay';
import { useUi } from '@/lib/store';

type Body = { type: 'subscription'; plan: string; months: number; promoCode?: string } | { type: 'product'; code: string; promoCode?: string };

/**
 * Paiement unifié (abonnement ou achat ponctuel). Le client n'envoie JAMAIS de montant : le serveur le calcule.
 * Fournisseur à widget (KKiaPay) : le serveur re-vérifie la transaction ; fournisseur à redirection : retour via webhook.
 */
export function usePay() {
  const t = useTranslations();
  const router = useRouter();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const qc = useQueryClient();
  const again = useRef<(() => void) | null>(null);
  const run = useRef(0);  // numéro du dernier paiement lancé : une attente abandonnée (nouveau clic) ne doit plus rien afficher
  const [opened, setOpened] = useState(false);  // la fenêtre KKiaPay est ouverte : le bouton n'est plus en chargement (fermée, on peut recommencer)
  const m = useMutation({
    mutationFn: async ({ body }: { key: string; body: Body }) => {
      const me = ++run.current;
      const r = await post<{ checkoutUrl?: string; widget?: KkiapayWidgetConfig }>('/checkout', body);
      if (r.widget) {
        let transactionId: string;
        try { transactionId = await payWithKkiapay(r.widget, () => { if (me === run.current) setOpened(true); }); } catch (e) {
          if (me !== run.current || (e instanceof Error && e.message === SUPERSEDED)) return;  // remplacé par un nouveau clic
          setOpened(false);
          if (e instanceof Error && e.message === CANCELLED) {  // fenêtre fermée sans payer : on rend la main (bouton libéré) et on propose de réessayer
            useUi.getState().setPayInterrupted({ retry: () => again.current?.() });
            return;
          }
          router.replace('/settings?tab=payments&status=fail');
          return;
        }
        setOpened(false);
        const c = await post<{ status: string }>('/payments/kkiapay/confirm', { reference: r.widget.reference, transactionId });
        if (c.status === 'PENDING') { toast('info', t('premium.pending')); return; }
        await qc.invalidateQueries({ queryKey: ['me'] });  // l'accès payant se relit tout de suite : le membre entre sans attendre
        router.replace(`/settings?tab=payments&status=${c.status === 'SUCCEEDED' ? 'success' : 'fail'}`);
        return;
      }
      if (r.checkoutUrl) window.location.href = r.checkoutUrl;
    },
    onError: (e) => { setOpened(false); toast('error', err(e)); },
  });
  const pay: typeof m.mutate = (vars, opts) => { again.current = () => m.mutate(vars); m.mutate(vars, opts); };
  return { pay, pending: m.isPending && !opened, variables: m.variables };
}
