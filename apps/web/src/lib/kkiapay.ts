export interface KkiapayWidgetConfig { publicKey: string; sandbox: boolean; amount: number; reference: string; name: string; email?: string | null; reason?: string; data?: string; /** Choisis par le serveur d'après le pays du profil : carte seule hors d'Afrique. */ paymentMethods?: ('momo' | 'card')[] }

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

/** Le membre a relancé un paiement : l'attente précédente est abandonnée sans message. */
export const SUPERSEDED = 'superseded';

/** Éléments visibles ajoutés à la page depuis `before` (le widget KKiaPay se greffe sur le <body>), ou cadre KKiaPay encore affiché. */
const widgetOpen = (before: Set<Element>) => {
  const visible = (n: Element) => n.isConnected && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden';
  return Array.from(document.body.children).some((n) => !before.has(n) && visible(n)) || !!document.querySelector('iframe[src*="kkiapay"]');
};

let current: { reject: (e: Error) => void } | null = null;

/**
 * Ouvre le widget KKiaPay. Résout avec l'identifiant de transaction (à faire vérifier par le serveur),
 * rejette avec 'failed' si le paiement échoue et avec CANCELLED si la fenêtre est fermée sans payer. Le résultat du widget n'active jamais rien par lui-même.
 * `onOpened` est appelé dès que la fenêtre est ouverte : l'appelant peut alors libérer son bouton (la fenêtre couvre l'écran ; fermée, le membre peut recommencer).
 */
export async function payWithKkiapay(c: KkiapayWidgetConfig, onOpened?: () => void): Promise<string> {
  await loadScript();
  const k = g();
  current?.reject(new Error(SUPERSEDED));  // un seul paiement à la fois : un nouveau clic abandonne l'attente du précédent
  let poll: ReturnType<typeof setInterval> | undefined;
  let stop: ReturnType<typeof setTimeout> | undefined;
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => { if (!settled) { settled = true; fn(); } };
    current = { reject: (e) => finish(() => reject(e)) };
    const onSuccess = (r: { transactionId?: string }) => finish(() => (r.transactionId ? resolve(r.transactionId) : reject(new Error('failed'))));
    const onFailed = () => finish(() => reject(new Error('failed')));
    if (k.addKkiapayListener) { k.addKkiapayListener('success', onSuccess); k.addKkiapayListener('failed', onFailed); }
    else { k.addSuccessListener?.(onSuccess); k.addFailedListener?.(onFailed); }
    // Fermeture sans paiement : l'événement du script s'il existe, sinon on surveille ce que le widget ajoute à la page. Court délai avant de conclure : un succès peut arriver juste après la fermeture.
    const cancel = () => { setTimeout(() => finish(() => reject(new Error(CANCELLED))), 1500); };
    k.addKkiapayCloseListener?.(cancel);
    const before = new Set<Element>(Array.from(document.body.children));
    let seen = false;
    poll = setInterval(() => {
      if (widgetOpen(before)) seen = true;
      else if (seen) { clearInterval(poll); cancel(); }
    }, 400);
    stop = setTimeout(() => clearInterval(poll), 30 * 60_000);
    k.openKkiapayWidget?.({ amount: c.amount, key: c.publicKey, sandbox: c.sandbox, partnerId: c.reference, paymentMethods: c.paymentMethods?.length ? c.paymentMethods : ['momo', 'card'], name: c.name, ...(c.email ? { email: c.email } : {}), reason: c.reason ?? c.name, data: c.data, position: 'center' });
    onOpened?.();
  }).finally(() => {
    clearInterval(poll);
    clearTimeout(stop);
    current = null;
    g().removeKkiapayListener?.('success');
    g().removeKkiapayListener?.('failed');
    g().removeKkiapayCloseListener?.();
  });
}
