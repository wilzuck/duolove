import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REFERRAL } from '@duomatch/types';
import { boot, login, PASSWORD, seedMember, uid, type App } from './helpers.js';

type Ctx = Awaited<ReturnType<typeof boot>>;
let c: Ctx;
beforeAll(async () => { c = await boot(); });
afterAll(async () => { await (c.app as App).close(); });

type M = Awaited<ReturnType<typeof member>>;
async function member() {
  const m = await seedMember(c.prisma, { gender: 'WOMAN', seeking: 'MEN', city: `P-${uid()}` });
  return { ...m, agent: await login(c.http, m.email) };
}
const admin = async () => {
  const m = await member();
  await c.prisma.user.update({ where: { id: m.id }, data: { role: 'ADMIN' } });
  return m;
};
const tokens = async (u: M) => (await u.agent.get('/api/credits')).body.balances.MATCH_TOKEN as number;
const newCode = (p = 'T') => `${p}${uid()}`.toUpperCase();
async function createPromo(a: M, body: Record<string, unknown>) {
  const r = await a.agent.post('/api/admin/promos').send(body);
  expect(r.status).toBe(201);
  return r.body as { id: string; code: string };
}

describe('codes promo : remise en pourcentage', () => {
  it('seul un ADMIN crée un code ; données incohérentes refusées ; action auditée', async () => {
    const u = await member();
    expect((await u.agent.post('/api/admin/promos').send({ code: newCode(), kind: 'PERCENT', percent: 10 })).status).toBe(403);
    const a = await admin();
    expect((await a.agent.post('/api/admin/promos').send({ code: newCode(), kind: 'PERCENT', percent: 95 })).status).toBe(400); // 90 % maximum
    expect((await a.agent.post('/api/admin/promos').send({ code: newCode(), kind: 'PERCENT', tokens: 3 })).status).toBe(400);
    const p = await createPromo(a, { code: newCode(), kind: 'PERCENT', percent: 20 });
    expect((await a.agent.post('/api/admin/promos').send({ code: p.code, kind: 'PERCENT', percent: 20 })).status).toBe(409);
    expect(await c.prisma.auditLog.count({ where: { action: 'promo.create', targetId: p.code } })).toBe(1);
  });

  it('la remise est calculée par le serveur : aperçu et paiement concordent, le montant client n\'existe pas', async () => {
    const a = await admin();
    const p = await createPromo(a, { code: newCode(), kind: 'PERCENT', percent: 20 });
    const u = await member();
    const prev = await u.agent.post('/api/promo/preview').send({ code: p.code.toLowerCase(), target: { type: 'subscription', plan: 'PREMIUM', months: 1 } });
    expect(prev.status).toBe(200);
    expect(prev.body).toMatchObject({ percent: 20, baseXof: 2500, discountXof: 500, finalXof: 2000 });
    const co = await u.agent.post('/api/checkout').send({ type: 'subscription', plan: 'PREMIUM', months: 1, promoCode: p.code, amountXof: 1 });
    expect(co.status).toBe(201);
    expect(co.body.amountXof).toBe(2000);
    const pay = await c.prisma.payment.findFirstOrThrow({ where: { userId: u.id } });
    expect(pay).toMatchObject({ amountXof: 2000, discountXof: 500, promoCodeId: p.id });
    // Remise aussi sur un achat ponctuel.
    const a2 = await member();
    const co2 = await a2.agent.post('/api/checkout').send({ type: 'product', code: 'TOKENS_5', promoCode: p.code });
    expect(co2.body.amountXof).toBe(800);
  });

  it('un code ne sert qu\'une fois par membre ; inconnu, expiré ou désactivé : même erreur', async () => {
    const a = await admin();
    const p = await createPromo(a, { code: newCode(), kind: 'PERCENT', percent: 10 });
    const u = await member();
    expect((await u.agent.post('/api/checkout').send({ type: 'product', code: 'TOKENS_5', promoCode: p.code })).status).toBe(201);
    const again = await u.agent.post('/api/checkout').send({ type: 'product', code: 'TOKENS_5', promoCode: p.code });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('PROMO_ALREADY_USED');

    const other = await member();
    for (const bad of [newCode('NOPE'), ((await createPromo(a, { code: newCode('EXP'), kind: 'PERCENT', percent: 10, startsAt: new Date(Date.now() - 2 * 86_400_000), expiresAt: new Date(Date.now() - 86_400_000) })).code)]) {
      const r = await other.agent.post('/api/checkout').send({ type: 'product', code: 'TOKENS_5', promoCode: bad });
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('PROMO_INVALID');
    }
    const off = await createPromo(a, { code: newCode('OFF'), kind: 'PERCENT', percent: 10 });
    expect((await a.agent.patch(`/api/admin/promos/${off.id}`).send({ active: false })).status).toBe(200);
    expect((await other.agent.post('/api/checkout').send({ type: 'product', code: 'TOKENS_5', promoCode: off.code })).body.error.code).toBe('PROMO_INVALID');
  });

  it('un paiement échoué libère le code ; un code « jetons » ne s\'applique pas à un paiement', async () => {
    const a = await admin();
    const p = await createPromo(a, { code: newCode(), kind: 'PERCENT', percent: 50, maxRedemptions: 1 });
    const u = await member();
    const co = await u.agent.post('/api/checkout').send({ type: 'product', code: 'TOKENS_5', promoCode: p.code });
    expect(co.status).toBe(201);
    const v = await member();
    expect((await v.agent.post('/api/checkout').send({ type: 'product', code: 'TOKENS_5', promoCode: p.code })).body.error.code).toBe('PROMO_EXHAUSTED');
    await u.agent.post(`/api/payments/mock/${co.body.providerRef}/complete`).send({ outcome: 'fail' });
    expect((await v.agent.post('/api/checkout').send({ type: 'product', code: 'TOKENS_5', promoCode: p.code })).status).toBe(201);

    const t = await createPromo(a, { code: newCode('TK'), kind: 'TOKENS', tokens: 3 });
    expect((await u.agent.post('/api/checkout').send({ type: 'product', code: 'TOKENS_5', promoCode: t.code })).body.error.code).toBe('PROMO_NOT_APPLICABLE');
  });

  it('plafond global respecté sous concurrence : un seul des deux paiements simultanés obtient la remise', async () => {
    const a = await admin();
    const p = await createPromo(a, { code: newCode(), kind: 'PERCENT', percent: 30, maxRedemptions: 1 });
    const [x, y] = [await member(), await member()];
    const rs = await Promise.all([x, y].map((u) => u.agent.post('/api/checkout').send({ type: 'product', code: 'TOKENS_5', promoCode: p.code })));
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await c.prisma.payment.count({ where: { promoCodeId: p.id } })).toBe(1);
  });

  it('une remise reste correcte au remboursement (le montant remboursé est celui payé)', async () => {
    const a = await admin();
    const p = await createPromo(a, { code: newCode(), kind: 'PERCENT', percent: 40 });
    const u = await member();
    const co = await u.agent.post('/api/checkout').send({ type: 'subscription', plan: 'PREMIUM', months: 1, promoCode: p.code });
    await u.agent.post(`/api/payments/mock/${co.body.providerRef}/complete`).send({ outcome: 'success' });
    const pay = await c.prisma.payment.findFirstOrThrow({ where: { userId: u.id } });
    const req = await u.agent.post(`/api/payments/${pay.id}/refund-request`).send({ reason: 'Je change d\'avis' });
    const done = await a.agent.post(`/api/admin/refunds/${req.body.id}/approve`).send({});
    expect(done.status).toBe(200);
    expect((await c.prisma.refund.findFirstOrThrow({ where: { paymentId: pay.id } })).amountXof).toBe(1500); // 2500 − 40 %
  });
});

describe('codes promo : jetons offerts', () => {
  it('crédite une seule fois par membre et respecte le plafond global', async () => {
    const a = await admin();
    const p = await createPromo(a, { code: newCode('TK'), kind: 'TOKENS', tokens: 4, maxRedemptions: 2 });
    const [x, y, z] = [await member(), await member(), await member()];
    const r1 = await x.agent.post('/api/promo/redeem').send({ code: p.code });
    expect(r1.status).toBe(200);
    expect(r1.body.tokens).toBe(4);
    expect(await tokens(x)).toBe(4);
    expect((await x.agent.post('/api/promo/redeem').send({ code: p.code })).body.error.code).toBe('PROMO_ALREADY_USED');
    expect(await tokens(x)).toBe(4);
    expect((await y.agent.post('/api/promo/redeem').send({ code: p.code })).status).toBe(200);
    expect((await z.agent.post('/api/promo/redeem').send({ code: p.code })).body.error.code).toBe('PROMO_EXHAUSTED');
    expect(await tokens(z)).toBe(0);
    const list = (await a.agent.get('/api/admin/promos')).body as { code: string; used: number }[];
    expect(list.find((q) => q.code === p.code)?.used).toBe(2);
  });

  it('rafales simultanées du même membre : un seul crédit ; un code de remise ne donne pas de jetons', async () => {
    const a = await admin();
    const p = await createPromo(a, { code: newCode('TK'), kind: 'TOKENS', tokens: 2 });
    const u = await member();
    const rs = await Promise.all([1, 2, 3].map(() => u.agent.post('/api/promo/redeem').send({ code: p.code })));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await tokens(u)).toBe(2);
    const pct = await createPromo(a, { code: newCode(), kind: 'PERCENT', percent: 10 });
    expect((await u.agent.post('/api/promo/redeem').send({ code: pct.code })).body.error.code).toBe('PROMO_NOT_APPLICABLE');
  });
});

describe('parrainage', () => {
  const register = (referralCode?: string) => {
    const email = `ref-${uid()}-${uid()}@test.duomatch`;
    return request(c.http).post('/api/auth/register').send({ displayName: 'Filleul', email, password: PASSWORD, birthDate: '1995-05-05', gender: 'MAN', country: 'TG', city: `R-${uid()}`, acceptTerms: true, ...(referralCode ? { referralCode } : {}) }).then((r) => ({ r, email }));
  };
  /** Rend le filleul qualifié (profil 100 % + e-mail vérifié) puis déclenche la vérification comme le fait l'application. */
  async function qualify(email: string) {
    const u = await c.prisma.user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });
    await c.prisma.profile.update({ where: { userId: u.id }, data: { completeness: 100 } });
    const agent = await login(c.http, email);
    await agent.get('/api/live/state');
    return { id: u.id, agent };
  }

  it('chaque membre a un code stable ; il suffit de l\'indiquer à l\'inscription', async () => {
    const p = await member();
    const s1 = await p.agent.get('/api/referral/me');
    expect(s1.body.code).toMatch(/^[A-Z2-9]{8}$/);
    expect((await p.agent.get('/api/referral/me')).body.code).toBe(s1.body.code);
    const { r } = await register(s1.body.code.toLowerCase());
    expect(r.status).toBe(201);
    expect(await c.prisma.referral.count({ where: { referrerId: p.id, status: 'PENDING' } })).toBe(1);
    expect((await p.agent.get('/api/referral/me')).body).toMatchObject({ invited: 1, pending: 1, rewarded: 0, tokensEarned: 0 });
  });

  it('code inconnu : l\'inscription réussit quand même, sans aucune indication sur la validité', async () => {
    const { r, email } = await register('ZZZZZZZZ');
    expect(r.status).toBe(201);
    const u = await c.prisma.user.findUniqueOrThrow({ where: { email } });
    expect(await c.prisma.referral.count({ where: { refereeId: u.id } })).toBe(0);
  });

  it('récompense versée une seule fois, seulement quand le filleul est qualifié', async () => {
    const p = await member();
    const code = (await p.agent.get('/api/referral/me')).body.code;
    const { r, email } = await register(code);
    expect(r.status).toBe(201);
    // Profil incomplet : rien.
    const u = await c.prisma.user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });
    const agent = await login(c.http, email);
    await agent.get('/api/live/state');
    expect(await tokens(p)).toBe(0);
    // Qualifié : parrain +5, filleul +2 (+3 de cadeau de profil, distinct).
    await qualify(email);
    expect(await tokens(p)).toBe(REFERRAL.REFERRER_TOKENS);
    const bal = (await agent.get('/api/credits')).body.balances.MATCH_TOKEN as number;
    expect(bal).toBe(REFERRAL.REFEREE_TOKENS + 3);
    // Rejeu : rien de plus.
    await qualify(email);
    await Promise.all([1, 2, 3].map(() => agent.get('/api/live/state')));
    expect(await tokens(p)).toBe(REFERRAL.REFERRER_TOKENS);
    expect((await agent.get('/api/credits')).body.balances.MATCH_TOKEN).toBe(bal);
    expect(await c.prisma.referral.count({ where: { refereeId: u.id, status: 'REWARDED' } })).toBe(1);
    expect((await p.agent.get('/api/referral/me')).body).toMatchObject({ rewarded: 1, pending: 0, tokensEarned: REFERRAL.REFERRER_TOKENS });
    const notif = await c.prisma.notification.findMany({ where: { userId: p.id, type: 'REFERRAL_REWARD' } });
    expect(notif).toHaveLength(1);
  });

  it('plafond par parrain : au-delà, le filleul est récompensé mais plus le parrain', async () => {
    const p = await member();
    const code = (await p.agent.get('/api/referral/me')).body.code;
    for (let i = 0; i < REFERRAL.MAX_REWARDED_PER_REFERRER; i++) {
      const f = await member();
      await c.prisma.referral.create({ data: { referrerId: p.id, refereeId: f.id, status: 'REWARDED', rewardedAt: new Date() } });
    }
    const { email } = await register(code);
    const { agent } = await qualify(email);
    expect(await tokens(p)).toBe(0);
    expect((await agent.get('/api/credits')).body.balances.MATCH_TOKEN).toBe(REFERRAL.REFEREE_TOKENS + 3);
  });

  it('un parrain suspendu ne reçoit rien ; la route exige d\'être connecté', async () => {
    expect((await request(c.http).get('/api/referral/me')).status).toBe(401);
    const p = await member();
    const code = (await p.agent.get('/api/referral/me')).body.code;
    const { email } = await register(code);
    await c.prisma.user.update({ where: { id: p.id }, data: { status: 'SUSPENDED' } });
    await qualify(email);
    expect(await c.prisma.creditTransaction.count({ where: { userId: p.id } })).toBe(0);
  });
});

describe('consultation d\'un code', () => {
  it('indique ce que vaut le code pour ce membre, avec les mêmes refus que l\'utilisation réelle', async () => {
    const a = await admin();
    const pct = await createPromo(a, { code: newCode(), kind: 'PERCENT', percent: 15 });
    const tk = await createPromo(a, { code: newCode('TK'), kind: 'TOKENS', tokens: 6 });
    const u = await member();
    expect((await u.agent.post('/api/promo/lookup').send({ code: pct.code })).body).toMatchObject({ kind: 'PERCENT', percent: 15 });
    expect((await u.agent.post('/api/promo/lookup').send({ code: tk.code })).body).toMatchObject({ kind: 'TOKENS', tokens: 6 });
    expect((await u.agent.post('/api/promo/lookup').send({ code: newCode('NOPE') })).body.error.code).toBe('PROMO_INVALID');
    await u.agent.post('/api/promo/redeem').send({ code: tk.code });
    expect((await u.agent.post('/api/promo/lookup').send({ code: tk.code })).body.error.code).toBe('PROMO_ALREADY_USED');
  });
});
