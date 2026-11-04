'use client';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useApiError } from '@/hooks/useApiError';
import { useRouter } from '@/i18n/navigation';
import { post } from '@/lib/api';
import { payWithKkiapay, type KkiapayWidgetConfig } from '@/lib/kkiapay';
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
  const m = useMutation({
    mutationFn: async ({ body }: { key: string; body: Body }) => {
      const r = await post<{ checkoutUrl?: string; widget?: KkiapayWidgetConfig }>('/checkout', body);
      if (r.widget) {
        let transactionId: string;
        try { transactionId = await payWithKkiapay(r.widget); } catch { router.replace('/settings?tab=payments&status=fail'); return; }
        const c = await post<{ status: string }>('/payments/kkiapay/confirm', { reference: r.widget.reference, transactionId });
        if (c.status === 'PENDING') { toast('info', t('premium.pending')); return; }
        router.replace(`/settings?tab=payments&status=${c.status === 'SUCCEEDED' ? 'success' : 'fail'}`);
        return;
      }
      if (r.checkoutUrl) window.location.href = r.checkoutUrl;
    },
    onError: (e) => toast('error', err(e)),
  });
  return { pay: m.mutate, pending: m.isPending, variables: m.variables };
}
