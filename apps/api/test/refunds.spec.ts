import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, login, seedMember, uid, type App } from './helpers.js';

type Ctx = Awaited<ReturnType<typeof boot>>;
type M = Awaited<ReturnType<typeof member>>;
let c: Ctx;
beforeAll(async () => { c = await boot(); });
afterAll(async () => { await (c.app as App).close(); });

async function member() {
  const m = await seedMember(c.prisma, { gender: 'WOMAN', seeking: 'MEN', city: `R-${uid()}` });
  return { ...m, agent: await login(c.http, m.email) };
}
async function admin() {
  const m = await member();
  await c.prisma.user.update({ where: { id: m.id }, data: { role: 'ADMIN' } });
  return m;
}
async function buy(a: M, body: Record<string, unknown>) {
  const co = await a.agent.post('/api/checkout').send(body);
  expect((await a.agent.post(`/api/payments/mock/${co.body.providerRef}/complete`).send({ outcome: 'success' })).status).toBe(200);
  return co.body.paymentId as string;
}
const plan = async (a: M) => (await a.agent.get('/api/subscriptions/me')).body.plan as string;
const credits = async (a: M) => (await a.agent.get('/api/credits')).body.balances as Record<string, number>;
const payment = (id: string) => c.prisma.payment.findUniqueOrThrow({ where: { id } });

describe('demande de remboursement par le membre', () => {
  it('délai, propriétaire, doublon ; approbation d\'un administrateur → droits retirés', async () => {
    const u = await member();
    const other = await member();
    const ad = await admin();
    const pid = await buy(u, { type: 'subscription', plan: 'PREMIUM', months: 1 });
    expect(await plan(u)).toBe('PREMIUM');

    expect((await other.agent.post(`/api/payments/${pid}/refund-request`).send({ reason: 'pas à moi' })).status).toBe(404);
    expect((await u.agent.post(`/api/payments/${pid}/refund-request`).send({ reason: 'x' })).status).toBe(400); // motif trop court
    const req = await u.agent.post(`/api/payments/${pid}/refund-request`).send({ reason: 'Paiement fait par erreur' });
    expect(req.status).toBe(201);
    expect((await u.agent.post(`/api/payments/${pid}/refund-request`).send({ reason: 'encore une fois' })).body.error.code).toBe('REFUND_EXISTS');
    expect((await u.agent.get('/api/payments')).body[0].refund).toBe('REQUESTED');

    // seul un administrateur traite
    expect((await u.agent.post(`/api/admin/refunds/${req.body.id}/approve`).send({})).status).toBe(403);
    const ok = await ad.agent.post(`/api/admin/refunds/${req.body.id}/approve`).send({ note: 'Erreur confirmée' });
    expect(ok.body.status).toBe('COMPLETED');
    expect((await payment(pid)).status).toBe('REFUNDED');
    expect(await plan(u)).toBe('FREE');
    expect(await c.prisma.subscription.count({ where: { userId: u.id, status: 'CANCELED' } })).toBeGreaterThanOrEqual(1);
    expect((await u.agent.get('/api/payments')).body[0].refund).toBe('COMPLETED');
    expect((await c.prisma.notification.findFirst({ where: { userId: u.id, type: 'REFUND_UPDATE' } }))?.data).toMatchObject({ status: 'COMPLETED' });
    expect((await ad.agent.get('/api/admin/audit-logs?action=refund.approve')).body.items.length).toBeGreaterThan(0);
    // un paiement déjà remboursé ne se rembourse pas deux fois
    expect((await u.agent.post(`/api/payments/${pid}/refund-request`).send({ reason: 'et encore' })).body.error.code).toBe('NOT_REFUNDABLE');
  });

  it('refuse hors délai, et un paiement non réussi', async () => {
    const u = await member();
    const pid = await buy(u, { type: 'product', code: 'BOOST_30' });
    await c.prisma.payment.update({ where: { id: pid }, data: { paidAt: new Date(Date.now() - 10 * 86_400_000) } });
    expect((await u.agent.post(`/api/payments/${pid}/refund-request`).send({ reason: 'trop tard sans doute' })).body.error.code).toBe('REFUND_WINDOW_EXPIRED');
    const pending = await u.agent.post('/api/checkout').send({ type: 'product', code: 'BOOST_30' });
    expect((await u.agent.post(`/api/payments/${pending.body.paymentId}/refund-request`).send({ reason: 'pas encore payé' })).body.error.code).toBe('NOT_REFUNDABLE');
  });

  it('rejet : le paiement reste valide et une nouvelle demande est possible', async () => {
    const u = await member();
    const ad = await admin();
    const pid = await buy(u, { type: 'product', code: 'BOOST_120' });
    const r1 = await u.agent.post(`/api/payments/${pid}/refund-request`).send({ reason: 'Je n’en veux plus' });
    expect((await ad.agent.post(`/api/admin/refunds/${r1.body.id}/reject`).send({ note: 'Boost déjà utilisé' })).body.status).toBe('REJECTED');
    expect((await payment(pid)).status).toBe('SUCCEEDED');
    expect((await credits(u)).BOOST_120).toBe(1);
    expect((await u.agent.post(`/api/payments/${pid}/refund-request`).send({ reason: 'Nouvelle demande motivée' })).status).toBe(201);
  });
});

describe('crédits et formules', () => {
  it('rembourser un pack reprend seulement les crédits restants (le consommé ne se reprend pas) ; approbation rejouée sans effet', async () => {
    const city = `P-${uid()}`;
    const u = await member();
    const ad = await admin();
    const targets = await Promise.all([seedMember(c.prisma, { gender: 'MAN', seeking: 'WOMEN', city: (await c.prisma.profile.findUniqueOrThrow({ where: { userId: u.id } })).city })]);
    void city;
    const pid = await buy(u, { type: 'product', code: 'SUPERLIKE_5' });
    expect((await u.agent.post('/api/swipes').send({ targetId: targets[0]!.id, action: 'SUPER_LIKE' })).status).toBe(200);
    expect((await credits(u)).SUPER_LIKE).toBe(4);
    const req = await u.agent.post(`/api/payments/${pid}/refund-request`).send({ reason: 'Remboursement du reliquat' });
    const a1 = await ad.agent.post(`/api/admin/refunds/${req.body.id}/approve`).send({});
    expect(a1.body).toMatchObject({ status: 'COMPLETED', creditsReversed: 4 });
    expect((await credits(u)).SUPER_LIKE).toBe(0);
    const a2 = await ad.agent.post(`/api/admin/refunds/${req.body.id}/approve`).send({});
    expect(a2.body.status).toBe('COMPLETED');
    expect(await c.prisma.creditTransaction.count({ where: { userId: u.id, reason: 'REFUND' } })).toBe(1);
  });

  it('rembourser un VIP reprend aussi les boosts et jetons inclus non utilisés', async () => {
    const u = await member();
    const ad = await admin();
    const pid = await buy(u, { type: 'subscription', plan: 'VIP', months: 3 });
    expect((await credits(u)).BOOST_120).toBe(6);
    expect((await credits(u)).MATCH_TOKEN).toBe(45);
    const req = await u.agent.post(`/api/payments/${pid}/refund-request`).send({ reason: 'Changement de situation' });
    expect((await ad.agent.post(`/api/admin/refunds/${req.body.id}/approve`).send({})).body.creditsReversed).toBe(51); // 6 boosts + 45 jetons
    expect((await credits(u)).BOOST_120).toBe(0);
    expect((await credits(u)).MATCH_TOKEN).toBe(0);
    expect(await plan(u)).toBe('FREE');
  });
});

describe('double validation et concurrence', () => {
  it('une demande administrateur ne peut pas être approuvée par son auteur', async () => {
    const u = await member();
    const a1 = await admin();
    const a2 = await admin();
    const mod = await member();
    await c.prisma.user.update({ where: { id: mod.id }, data: { role: 'MODERATOR' } });
    const pid = await buy(u, { type: 'subscription', plan: 'PREMIUM', months: 1 });
    expect((await (await login(c.http, mod.email)).post('/api/admin/refunds').send({ paymentId: pid, reason: 'moderateur interdit' })).status).toBe(403);
    const created = await a1.agent.post('/api/admin/refunds').send({ paymentId: pid, reason: 'Geste commercial suite à un incident' });
    expect(created.status).toBe(201);
    const self = await a1.agent.post(`/api/admin/refunds/${created.body.id}/approve`).send({});
    expect(self.status).toBe(403);
    expect(self.body.error.code).toBe('SELF_APPROVAL');
    expect((await payment(pid)).status).toBe('SUCCEEDED');
    expect((await a2.agent.post(`/api/admin/refunds/${created.body.id}/approve`).send({})).body.status).toBe('COMPLETED');
    expect((await payment(pid)).status).toBe('REFUNDED');
    const list = await a2.agent.get('/api/admin/refunds?status=COMPLETED');
    expect(list.body.items.some((r: { id: string; source: string }) => r.id === created.body.id && r.source === 'ADMIN')).toBe(true);
  });

  it('deux approbations simultanées : un seul remboursement exécuté', async () => {
    const u = await member();
    const a1 = await admin();
    const a2 = await admin();
    const pid = await buy(u, { type: 'product', code: 'SUPERLIKE_5' });
    const req = await u.agent.post(`/api/payments/${pid}/refund-request`).send({ reason: 'Double clic de l’administrateur' });
    const [x, y] = await Promise.all([a1.agent.post(`/api/admin/refunds/${req.body.id}/approve`).send({}), a2.agent.post(`/api/admin/refunds/${req.body.id}/approve`).send({})]);
    expect([x.status, y.status]).toEqual([200, 200]);
    expect(await c.prisma.refund.count({ where: { paymentId: pid } })).toBe(1);
    expect(await c.prisma.creditTransaction.count({ where: { userId: u.id, reason: 'REFUND' } })).toBe(1);
    expect((await credits(u)).SUPER_LIKE).toBe(0);
    expect((await payment(pid)).status).toBe('REFUNDED');
  });
});
