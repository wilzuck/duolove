export interface KkiapayWidgetConfig { publicKey: string; sandbox: boolean; amount: number; reference: string; name: string }

interface KkiapayGlobals {
  openKkiapayWidget?: (o: Record<string, unknown>) => void;
  addKkiapayListener?: (event: 'success' | 'failed', cb: (r: { transactionId?: string }) => void) => void;
  removeKkiapayListener?: (event: 'success' | 'failed') => void;
  addSuccessListener?: (cb: (r: { transactionId?: string }) => void) => void;
  addFailedListener?: (cb: (r: unknown) => void) => void;
}
const g = () => window as unknown as KkiapayGlobals;

function loadScript(): Promise<void> {
  if (g().openKkiapayWidget) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.kkiapay.me/k.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('KKIAPAY_SCRIPT'));
    document.head.appendChild(s);
  });
}

/**
 * Ouvre le widget KKiaPay. Résout avec l'identifiant de transaction (à faire vérifier par le serveur),
 * rejette avec 'failed' si le paiement échoue. Le résultat du widget n'active jamais rien par lui-même.
 */
export async function payWithKkiapay(c: KkiapayWidgetConfig): Promise<string> {
  await loadScript();
  const k = g();
  return new Promise<string>((resolve, reject) => {
    const onSuccess = (r: { transactionId?: string }) => (r.transactionId ? resolve(r.transactionId) : reject(new Error('failed')));
    const onFailed = () => reject(new Error('failed'));
    if (k.addKkiapayListener) { k.addKkiapayListener('success', onSuccess); k.addKkiapayListener('failed', onFailed); }
    else { k.addSuccessListener?.(onSuccess); k.addFailedListener?.(onFailed); }
    k.openKkiapayWidget?.({ amount: c.amount, key: c.publicKey, sandbox: c.sandbox, partnerId: c.reference, paymentMethods: ['momo', 'card'], reason: c.name, position: 'center' });
  }).finally(() => { g().removeKkiapayListener?.('success'); g().removeKkiapayListener?.('failed'); });
}
