import { randomToken } from '../common/crypto.js';
import { getEnv } from '../config/env.js';
import type { PaymentProvider } from './payments.service.js';

export interface KkiapayTransaction { status: 'SUCCESS' | 'FAILED' | 'PENDING'; amount: number; reference: string | null; method: string | null }

const STATES: Record<string, KkiapayTransaction['status']> = { SUCCESS: 'SUCCESS', FAILED: 'FAILED', FAILURE: 'FAILED', PENDING: 'PENDING' };

const BASE = { sandbox: 'https://api-sandbox.kkiapay.me', live: 'https://api.kkiapay.me' } as const;

/**
 * KKiaPay : paiement par widget (Mobile Money + carte). Le navigateur n'est JAMAIS cru :
 * le serveur interroge l'API KKiaPay avec les clés privées pour obtenir le statut et le montant réels.
 */
export class KkiapayProvider implements PaymentProvider {
  readonly name = 'kkiapay';

  async refund(p: { providerRef: string }) {
    // providerRef devient `tx_<id>` une fois la transaction confirmée.
    const id = p.providerRef.startsWith('tx_') ? p.providerRef.slice(3) : null;
    if (!id) throw new Error('Transaction KKiaPay inconnue : remboursement manuel requis');
    await revertKkiapayTransaction(id);
    return {};
  }

  async createCheckout({ amountXof }: { paymentId: string; amountXof: number }) {
    const env = getEnv();
    const providerRef = `kk_${randomToken(12)}`;
    return {
      providerRef,
      widget: { publicKey: env.KKIAPAY_PUBLIC_KEY!, sandbox: env.KKIAPAY_SANDBOX, amount: amountXof, reference: providerRef, name: env.SITE_NAME },
    };
  }
}

/** Interroge KKiaPay pour connaître le statut réel d'une transaction. Lève une erreur si KKiaPay est injoignable. */
export async function verifyKkiapayTransaction(transactionId: string): Promise<KkiapayTransaction | null> {
  const env = getEnv();
  // Comme dans WaMarcket (en production) : l'en-tête x-api-key porte la clé PRIVÉE.
  const res = await fetch(`${env.KKIAPAY_SANDBOX ? BASE.sandbox : BASE.live}/api/v1/transactions/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': env.KKIAPAY_PRIVATE_KEY! },
    body: JSON.stringify({ transactionId }),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`KKiaPay ${res.status}`);
  const j = (await res.json().catch(() => null)) as { status?: string; amount?: number | string; partnerId?: string | null; source?: string } | null;
  const status = STATES[String(j?.status ?? '').toUpperCase()];
  if (!j || !status) throw new Error('KKiaPay : réponse inexploitable');
  // `partnerId` = notre référence de paiement, transmise au widget et restituée ici.
  return { status, amount: Number(j.amount), reference: j.partnerId ? String(j.partnerId) : null, method: j.source ? String(j.source).toLowerCase() : null };
}

/** Annule (rembourse) une transaction chez KKiaPay. Lève une erreur si KKiaPay refuse ou est injoignable. */
export async function revertKkiapayTransaction(transactionId: string): Promise<void> {
  const env = getEnv();
  const res = await fetch(`${env.KKIAPAY_SANDBOX ? BASE.sandbox : BASE.live}/api/v1/transactions/revert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': env.KKIAPAY_PRIVATE_KEY! },
    body: JSON.stringify({ transactionId }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`KKiaPay a refusé le remboursement (${res.status})`);
}
