export interface KkiapayWidgetConfig { publicKey: string; sandbox: boolean; amount: number; reference: string; name: string; reason?: string; data?: string }

/** Le membre a fermé la fenêtre de paiement sans payer ni échouer. */
export const CANCELLED = 'cancelled';

interface KkiapayGlobals {
  openKkiapayWidget?: (o: Record<string, unknown>) => void;
  addKkiapayListener?: (event: 'success' | 'failed', cb: (r: { transactionId?: string }) => void) => void;
  removeKkiapayListener?: (event: 'success' | 'failed') => void;
  addSuccessListener?: (cb: (r: { transactionId?: string }) => void) => void;
  addFailedListener?: (cb: (r: unknown) => void) => void;
  addKkiapayCloseListener?: (cb: () => void) => void;
  removeKkiapayCloseListener?: () => void;
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

/** Fenêtre du widget encore affichée ? (cadre KKiaPay dans la page) : repli quand l'événement de fermeture n'est pas fourni par le script. */
const widgetOpen = () => !!document.querySelector('iframe[src*="kkiapay"], kkiapay-widget iframe, #kkiapay-iframe');

/**
 * Ouvre le widget KKiaPay. Résout avec l'identifiant de transaction (à faire vérifier par le serveur),
 * rejette avec 'failed' si le paiement échoue et avec CANCELLED si la fenêtre est fermée sans payer. Le résultat du widget n'active jamais rien par lui-même.
 */
export async function payWithKkiapay(c: KkiapayWidgetConfig): Promise<string> {
  await loadScript();
  const k = g();
  let poll: ReturnType<typeof setInterval> | undefined;
  let stop: ReturnType<typeof setTimeout> | undefined;
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => { if (!settled) { settled = true; fn(); } };
    const onSuccess = (r: { transactionId?: string }) => finish(() => (r.transactionId ? resolve(r.transactionId) : reject(new Error('failed'))));
    const onFailed = () => finish(() => reject(new Error('failed')));
    if (k.addKkiapayListener) { k.addKkiapayListener('success', onSuccess); k.addKkiapayListener('failed', onFailed); }
    else { k.addSuccessListener?.(onSuccess); k.addFailedListener?.(onFailed); }
    // Fermeture sans paiement : l'événement du script s'il existe, sinon on surveille le cadre. Court délai avant de conclure : un succès peut arriver juste après la fermeture.
    const cancel = () => { setTimeout(() => finish(() => reject(new Error(CANCELLED))), 1500); };
    k.addKkiapayCloseListener?.(cancel);
    let seen = false;
    poll = setInterval(() => {
      if (widgetOpen()) seen = true;
      else if (seen) { clearInterval(poll); cancel(); }
    }, 600);
    stop = setTimeout(() => clearInterval(poll), 30 * 60_000);
    k.openKkiapayWidget?.({ amount: c.amount, key: c.publicKey, sandbox: c.sandbox, partnerId: c.reference, paymentMethods: ['momo', 'card'], name: c.name, reason: c.reason ?? c.name, data: c.data, position: 'center' });
  }).finally(() => {
    clearInterval(poll);
    clearTimeout(stop);
    g().removeKkiapayListener?.('success');
    g().removeKkiapayListener?.('failed');
    g().removeKkiapayCloseListener?.();
  });
}
