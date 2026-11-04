import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.PAYMENT_PROVIDER = 'kkiapay';
process.env.KKIAPAY_PUBLIC_KEY = 'pk_test_fake';
process.env.KKIAPAY_PRIVATE_KEY = 'private_fake';
process.env.KKIAPAY_WEBHOOK_SECRET = 'hash-secret-for-tests';
process.env.KKIAPAY_SANDBOX = 'true';
process.env.SITE_NAME = 'DuoMatch';

type H = typeof import('./helpers.js');
let h: H;
let c: Awaited<ReturnType<H['boot']>>;
const RUN = Math.random().toString(36).slice(2, 8).toUpperCase(); // les identifiants de transaction ne doivent pas se recouper entre exécutions
let revertStatus = 200;
const reverts: string[] = [];
const kkiapay = new Map<string, { status: string; amount: number; partnerId?: string }>();

beforeAll(async () => {
  h = await import('./helpers.js');
  c = await h.boot();
  // API KKiaPay simulée : aucun appel réseau réel.
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body: string; headers: Record<string, string> }) => {
    expect(init.headers['x-api-key']).toBe('private_fake'); // clé privée, comme WaMarcket
    if (url === 'https://api-sandbox.kkiapay.me/api/v1/transactions/revert') {
      reverts.push((JSON.parse(init.body) as { transactionId: string }).transactionId);
      return new Response('{}', { status: revertStatus });
    }
    expect(url).toBe('https://api-sandbox.kkiapay.me/api/v1/transactions/status');
    const tx = kkiapay.get((JSON.parse(init.body) as { transactionId: string }).transactionId);
    return tx ? new Response(JSON.stringify(tx), { status: 200 }) : new Response('{}', { status: 404 });
  }));
});
afterAll(async () => { vi.unstubAllGlobals(); await c.app.close(); });
beforeEach(() => kkiapay.clear());

async function member() {
  const m = await h.seedMember(c.prisma, { gender: 'WOMAN', seeking: 'MEN', city: `K-${h.uid()}` });
  return { ...m, agent: await h.login(c.http, m.email) };
}
const plan = async (a: Awaited<ReturnType<typeof member>>) => (await a.agent.get('/api/subscriptions/me')).body.plan as string;

describe('paiement KKiaPay', () => {
  it('le checkout renvoie la configuration du widget (nom depuis .env) et n\'active rien', async () => {
    const a = await member();
    const r = await a.agent.post('/api/subscriptions/checkout').send({ plan: 'PREMIUM' });
    expect(r.status).toBe(201);
    expect(r.body.checkoutUrl).toBeUndefined();
    expect(r.body.widget).toMatchObject({ publicKey: 'pk_test_fake', sandbox: true, amount: 2500, name: 'DuoMatch' });
    expect(r.body.widget.reference).toMatch(/^kk_/);
    expect(await plan(a)).toBe('FREE');
    // les clés privées ne sortent jamais
    expect(JSON.stringify(r.body)).not.toContain('private_fake');
  });

  it('active après vérification serveur, de façon idempotente, avec facture au nom configuré', async () => {
    const a = await member();
    const { widget } = (await a.agent.post('/api/subscriptions/checkout').send({ plan: 'PREMIUM' })).body;
    // transaction inconnue ou non réussie : rien ne change
    expect((await a.agent.post('/api/payments/kkiapay/confirm').send({ reference: widget.reference, transactionId: `TX_UNKNOWN_${RUN}` })).status).toBe(400);
    kkiapay.set(`TX_PENDING_${RUN}`, { status: 'PENDING', amount: 2500 });
    expect((await a.agent.post('/api/payments/kkiapay/confirm').send({ reference: widget.reference, transactionId: `TX_PENDING_${RUN}` })).body.status).toBe('PENDING');
    expect(await plan(a)).toBe('FREE');

    kkiapay.set(`TX_OK1_${RUN}`, { status: 'SUCCESS', amount: 2500 });
    const ok = await a.agent.post('/api/payments/kkiapay/confirm').send({ reference: widget.reference, transactionId: `TX_OK1_${RUN}` });
    expect(ok.body.status).toBe('SUCCEEDED');
    expect(await plan(a)).toBe('PREMIUM');
    const again = await a.agent.post('/api/payments/kkiapay/confirm').send({ reference: widget.reference, transactionId: `TX_OK1_${RUN}` });
    expect(again.status).toBe(200);
    expect(await c.prisma.payment.count({ where: { userId: a.id, status: 'SUCCEEDED' } })).toBe(1);
    const hist = (await a.agent.get('/api/payments')).body;
    const inv = (await a.agent.get(`/api/payments/${hist[0].id}/invoice`)).body;
    expect(inv.description).toContain('DuoMatch');
    expect(inv.amountXof).toBe(2500);
  });

  it('refuse un montant différent et une transaction réutilisée pour un autre paiement', async () => {
    const a = await member();
    const w1 = (await a.agent.post('/api/subscriptions/checkout').send({ plan: 'VIP' })).body.widget; // 5000
    kkiapay.set(`TX_SMALL_${RUN}`, { status: 'SUCCESS', amount: 2500 });
    await a.agent.post('/api/payments/kkiapay/confirm').send({ reference: w1.reference, transactionId: `TX_SMALL_${RUN}` });
    expect(await plan(a)).toBe('FREE');
    expect((await a.agent.get('/api/payments')).body[0]).toMatchObject({ status: 'FAILED' });

    const w2 = (await a.agent.post('/api/subscriptions/checkout').send({ plan: 'PREMIUM' })).body.widget; // 2500
    kkiapay.set(`TX_ONCE_${RUN}`, { status: 'SUCCESS', amount: 2500 });
    await a.agent.post('/api/payments/kkiapay/confirm').send({ reference: w2.reference, transactionId: `TX_ONCE_${RUN}` });
    expect(await plan(a)).toBe('PREMIUM');
    // même transaction rejouée sur un 2e paiement de même montant → refusée
    const w3 = (await a.agent.post('/api/subscriptions/checkout').send({ plan: 'PREMIUM' })).body.widget;
    const reuse = await a.agent.post('/api/payments/kkiapay/confirm').send({ reference: w3.reference, transactionId: `TX_ONCE_${RUN}` });
    expect(reuse.status).toBe(409);
    expect(reuse.body.error.code).toBe('TRANSACTION_ALREADY_USED');
  });

  it('un autre membre ne peut pas confirmer le paiement d\'autrui', async () => {
    const a = await member();
    const b = await member();
    const w = (await a.agent.post('/api/subscriptions/checkout').send({ plan: 'PREMIUM' })).body.widget;
    kkiapay.set(`TX_A_${RUN}`, { status: 'SUCCESS', amount: 2500 });
    expect((await b.agent.post('/api/payments/kkiapay/confirm').send({ reference: w.reference, transactionId: `TX_A_${RUN}` })).status).toBe(404);
    expect(await plan(b)).toBe('FREE');
  });

  it('webhook : secret exigé, transaction re-vérifiée, rejeu ignoré', async () => {
    const a = await member();
    const w = (await a.agent.post('/api/subscriptions/checkout').send({ plan: 'PREMIUM' })).body.widget;
    kkiapay.set(`TX_HOOK_${RUN}`, { status: 'SUCCESS', amount: 2500, partnerId: w.reference });
    const body = JSON.stringify({ transactionId: `TX_HOOK_${RUN}`, event: 'transaction.success', isPaymentSucces: true });
    const post = (secret?: string) => {
      const r = request(c.http).post('/api/payments/webhook/kkiapay').set('content-type', 'application/json');
      return (secret ? r.set('x-kkiapay-secret', secret) : r).send(body);
    };
    expect((await post()).status).toBe(401);
    expect((await post('mauvais-secret')).status).toBe(401);
    expect(await plan(a)).toBe('FREE');
    expect((await post('hash-secret-for-tests')).status).toBe(200);
    expect(await plan(a)).toBe('PREMIUM');
    expect((await post('hash-secret-for-tests')).body.duplicate).toBe(true);

    // un webhook authentique pour une transaction que KKiaPay ne connaît pas n'active rien
    const forged = JSON.stringify({ transactionId: `TX_FORGED_${RUN}`, event: 'transaction.success' });
    const f = await request(c.http).post('/api/payments/webhook/kkiapay').set('content-type', 'application/json').set('x-kkiapay-secret', 'hash-secret-for-tests').send(forged);
    expect(f.status).toBe(200);
    expect(await c.prisma.payment.count({ where: { provider: 'kkiapay', status: 'SUCCEEDED' } })).toBeGreaterThanOrEqual(1);
  });

  it('la simulation de paiement est inactive avec KKiaPay', async () => {
    const a = await member();
    expect((await a.agent.post('/api/payments/mock/mock_x/complete').send({ outcome: 'success' })).status).toBe(404);
  });
});

describe('remboursement KKiaPay', () => {
  async function paid() {
    const a = await member();
    const { widget } = (await a.agent.post('/api/subscriptions/checkout').send({ plan: 'PREMIUM' })).body;
    const tx = `TX_RF_${RUN}_${Math.random().toString(36).slice(2, 7)}`;
    kkiapay.set(tx, { status: 'SUCCESS', amount: 2500 });
    await a.agent.post('/api/payments/kkiapay/confirm').send({ reference: widget.reference, transactionId: tx });
    const pid = (await c.prisma.payment.findFirstOrThrow({ where: { userId: a.id, status: 'SUCCEEDED' } })).id;
    const ad = await h.seedMember(c.prisma, { gender: 'MAN', seeking: 'WOMEN', city: `A-${h.uid()}` });
    await c.prisma.user.update({ where: { id: ad.id }, data: { role: 'ADMIN' } });
    const req = await a.agent.post(`/api/payments/${pid}/refund-request`).send({ reason: 'Demande de test remboursement' });
    return { a, tx, pid, refundId: req.body.id as string, admin: await h.login(c.http, ad.email) };
  }

  it('appelle l\'API de remboursement KKiaPay (clé privée) puis retire les droits', async () => {
    const { a, tx, pid, refundId, admin } = await paid();
    expect(await plan(a)).toBe('PREMIUM');
    const r = await admin.post(`/api/admin/refunds/${refundId}/approve`).send({});
    expect(r.body.status).toBe('COMPLETED');
    expect(reverts).toContain(tx);
    expect((await c.prisma.payment.findUniqueOrThrow({ where: { id: pid } })).status).toBe('REFUNDED');
    expect(await plan(a)).toBe('FREE');
  });

  it('si KKiaPay refuse : demande en échec, paiement et droits intacts', async () => {
    const { a, pid, refundId, admin } = await paid();
    revertStatus = 500;
    try {
      const r = await admin.post(`/api/admin/refunds/${refundId}/approve`).send({});
      expect(r.body.status).toBe('FAILED');
      expect(r.body.failureReason).toContain('refusé');
    } finally { revertStatus = 200; }
    expect((await c.prisma.payment.findUniqueOrThrow({ where: { id: pid } })).status).toBe('SUCCEEDED');
    expect(await plan(a)).toBe('PREMIUM');
    expect((await c.prisma.refund.findUniqueOrThrow({ where: { id: refundId } })).status).toBe('FAILED');
  });

  it('remboursement « manuel » (fait hors système) : pas d\'appel fournisseur', async () => {
    const { tx, pid, refundId, admin } = await paid();
    const before = reverts.length;
    const r = await admin.post(`/api/admin/refunds/${refundId}/approve`).send({ manual: true, note: 'Remboursé depuis le tableau de bord KKiaPay' });
    expect(r.body.status).toBe('COMPLETED');
    expect(reverts.length).toBe(before);
    expect(reverts).not.toContain(tx);
    expect((await c.prisma.payment.findUniqueOrThrow({ where: { id: pid } })).status).toBe('REFUNDED');
  });
});
