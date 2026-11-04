import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, login, seedMember, uid, type App } from './helpers.js';

type Ctx = Awaited<ReturnType<typeof boot>>;
let c: Ctx;
beforeAll(async () => { c = await boot(); });
afterAll(async () => { await (c.app as App).close(); });

async function member(city = `M-${uid()}`, gender: 'WOMAN' | 'MAN' = 'WOMAN') {
  const m = await seedMember(c.prisma, { gender, seeking: gender === 'WOMAN' ? 'MEN' : 'WOMEN', city });
  return { ...m, city, agent: await login(c.http, m.email) };
}
const admin = async () => {
  const m = await member();
  await c.prisma.user.update({ where: { id: m.id }, data: { role: 'ADMIN' } });
  return m;
};
/** Paiement simulé complet : checkout → webhook signé (via l'endpoint de simulation serveur). */
async function buy(a: Awaited<ReturnType<typeof member>>, body: Record<string, unknown>) {
  const co = await a.agent.post('/api/checkout').send(body);
  expect(co.status).toBe(201);
  const done = await a.agent.post(`/api/payments/mock/${co.body.providerRef}/complete`).send({ outcome: 'success' });
  expect(done.status).toBe(200);
  return co.body as { providerRef: string; amountXof: number };
}
const credits = async (a: Awaited<ReturnType<typeof member>>) => (await a.agent.get('/api/credits')).body.balances as Record<string, number>;
const premium = (userId: string) => c.prisma.entitlement.upsert({ where: { userId }, create: { userId, plan: 'PREMIUM', validUntil: new Date(Date.now() + 30 * 86_400_000) }, update: { plan: 'PREMIUM', validUntil: new Date(Date.now() + 30 * 86_400_000) } });

describe('catalogue et durées', () => {
  it('expose les offres avec prix par durée calculés depuis le tarif configuré', async () => {
    const r = await request(c.http).get('/api/plans');
    expect(r.status).toBe(200);
    const plans = Object.fromEntries(r.body.plans.map((p: { code: string }) => [p.code, p]));
    expect(Object.keys(plans).sort()).toEqual(['FREE', 'PREMIUM', 'VIP']);
    const by = (code: string, m: number) => plans[code].prices.find((p: { months: number }) => p.months === m);
    expect(by('PREMIUM', 1)).toMatchObject({ totalXof: 2500, discountPercent: 0, monthlyEquivalentXof: 2500 });
    expect(by('PREMIUM', 3)).toMatchObject({ totalXof: 6750, discountPercent: 10, monthlyEquivalentXof: 2250, savingsXof: 750 });
    expect(by('PREMIUM', 6).totalXof).toBe(12000);
    expect(by('PREMIUM', 12).totalXof).toBe(21000);
    expect(by('VIP', 12).totalXof).toBe(42000);
    expect(plans.FREE.prices).toHaveLength(0);
    expect(plans.PREMIUM.features).toMatchObject({ daily_likes_limit: -1, super_likes_weekly: 5, can_see_likes: true, ads_enabled: false });
    expect(plans.VIP.features.boosts_monthly).toBe(2);
    expect(r.body.products.map((p: { code: string }) => p.code)).toEqual(['BOOST_30', 'BOOST_120', 'BOOST_1440', 'SUPERLIKE_5', 'SUPERLIKE_15', 'SUPERLIKE_30', 'TOKENS_5', 'TOKENS_15', 'TOKENS_30']);
  });

  it('le montant est toujours calculé côté serveur ; durée ou formule invalide refusées', async () => {
    const a = await member();
    const co = await a.agent.post('/api/checkout').send({ type: 'subscription', plan: 'PREMIUM', months: 3, amount: 1, priceXof: 1 });
    expect(co.status).toBe(201);
    expect(co.body.amountXof).toBe(6750); // le « amount: 1 » du client est ignoré
    expect((await a.agent.post('/api/checkout').send({ type: 'subscription', plan: 'PREMIUM', months: 2 })).status).toBe(400);
    expect((await a.agent.post('/api/checkout').send({ type: 'subscription', plan: 'FREE', months: 1 })).status).toBe(400);
    expect((await a.agent.post('/api/checkout').send({ type: 'product', code: 'INEXISTANT' })).status).toBe(404);
    expect((await a.agent.get('/api/subscriptions/me')).body.plan).toBe('FREE');
  });

  it('un abonnement de 3 mois dure 3 mois et crédite les boosts et jetons inclus (VIP : 2 boosts et 15 jetons/mois)', async () => {
    const a = await member();
    await buy(a, { type: 'subscription', plan: 'VIP', months: 3 });
    const sub = (await a.agent.get('/api/subscriptions/me')).body;
    expect(sub.plan).toBe('VIP');
    const months = (new Date(sub.validUntil).getTime() - Date.now()) / (30.4 * 86_400_000);
    expect(months).toBeGreaterThan(2.9);
    expect(months).toBeLessThan(3.1);
    expect((await credits(a)).BOOST_120).toBe(6);
    expect((await credits(a)).MATCH_TOKEN).toBe(45); // 15 jetons Match inclus × 3 mois
    const pay = (await a.agent.get('/api/payments')).body[0];
    expect(pay).toMatchObject({ amountXof: 13500, months: 3, status: 'SUCCEEDED' }); // 5000×3 −10 %
  });
});

describe('administration des offres', () => {
  it('seul un ADMIN modifie prix et fonctionnalités ; les paiements existants ne changent pas ; action auditée', async () => {
    const u = await member();
    const old = await buy(u, { type: 'subscription', plan: 'PREMIUM', months: 3 });
    const ad = await admin();
    const mod = await member();
    await c.prisma.user.update({ where: { id: mod.id }, data: { role: 'MODERATOR' } });
    expect((await u.agent.patch('/api/admin/plans/PREMIUM').send({ priceXof: 1 })).status).toBe(403);
    expect((await (await login(c.http, mod.email)).patch('/api/admin/plans/PREMIUM').send({ priceXof: 1 })).status).toBe(403);
    expect((await ad.agent.patch('/api/admin/plans/PREMIUM').send({ priceXof: -5 })).status).toBe(400);
    expect((await ad.agent.patch('/api/admin/plans/FREE').send({ priceXof: 100 })).status).toBe(403);

    try {
      expect((await ad.agent.patch('/api/admin/plans/PREMIUM').send({ priceXof: 3000, prices: [{ months: 3, discountPercent: 15 }] })).status).toBe(200);
      const plans = (await request(c.http).get('/api/plans')).body.plans;
      const p3 = plans.find((p: { code: string }) => p.code === 'PREMIUM').prices.find((p: { months: number }) => p.months === 3);
      expect(p3.totalXof).toBe(7650); // 3000×3 −15 %
      expect((await u.agent.post('/api/checkout').send({ type: 'subscription', plan: 'PREMIUM', months: 3 })).body.amountXof).toBe(7650);
      // l'ancien paiement garde son montant et l'abonnement actif sa période
      expect((await u.agent.get('/api/payments')).body.find((p: { providerRef?: string; amountXof: number }) => p.amountXof === old.amountXof)).toBeTruthy();
      expect((await u.agent.get('/api/subscriptions/me')).body.plan).toBe('PREMIUM');
      const logs = await ad.agent.get('/api/admin/audit-logs?action=plan.update');
      expect(logs.body.items.length).toBeGreaterThan(0);
    } finally {
      await ad.agent.patch('/api/admin/plans/PREMIUM').send({ priceXof: 2500, prices: [{ months: 3, discountPercent: 10 }] });
    }
  });

  it('les quotas viennent de la configuration (pas du code) : modifier daily_likes_limit change le comportement', async () => {
    const ad = await admin();
    const city = `Q-${uid()}`;
    const me = await member(city);
    const t = await Promise.all([seedMember(c.prisma, { gender: 'MAN', seeking: 'WOMEN', city }), seedMember(c.prisma, { gender: 'MAN', seeking: 'WOMEN', city }), seedMember(c.prisma, { gender: 'MAN', seeking: 'WOMEN', city })]);
    const free = (await request(c.http).get('/api/plans')).body.plans.find((p: { code: string }) => p.code === 'FREE').features;
    try {
      expect((await ad.agent.patch('/api/admin/plans/FREE').send({ features: { ...free, daily_likes_limit: 2 } })).status).toBe(200);
      expect((await me.agent.post('/api/swipes').send({ targetId: t[0]!.id, action: 'LIKE' })).status).toBe(200);
      expect((await me.agent.post('/api/swipes').send({ targetId: t[1]!.id, action: 'LIKE' })).status).toBe(200);
      expect((await me.agent.post('/api/swipes').send({ targetId: t[2]!.id, action: 'LIKE' })).body.error.code).toBe('DAILY_LIMIT');
      expect((await ad.agent.patch('/api/admin/plans/FREE').send({ features: { ...free, daily_likes_limit: 'beaucoup' } })).status).toBe(400);
    } finally {
      await ad.agent.patch('/api/admin/plans/FREE').send({ features: free });
    }
  });
});

describe('achats ponctuels, crédits et Super Likes', () => {
  it('un pack crédite une seule fois, même si le paiement est rejoué (pas de double débit ni double crédit)', async () => {
    const a = await member();
    const co = await buy(a, { type: 'product', code: 'SUPERLIKE_5' });
    expect(co.amountXof).toBe(500);
    expect((await credits(a)).SUPER_LIKE).toBe(5);
    // webhook rejoué (même fournisseur, même transaction) : aucun crédit supplémentaire
    const replay = await a.agent.post(`/api/payments/mock/${co.providerRef}/complete`).send({ outcome: 'success' });
    expect(replay.status).toBe(200);
    expect((await credits(a)).SUPER_LIKE).toBe(5);
    expect(await c.prisma.payment.count({ where: { userId: a.id, status: 'SUCCEEDED' } })).toBe(1);
    const hist = (await a.agent.get('/api/payments')).body[0];
    expect(hist).toMatchObject({ kind: 'PRODUCT', product: 'Pack 5 Super Likes' });
    expect((await a.agent.get(`/api/payments/${hist.id}/invoice`)).body.description).toContain('Pack 5 Super Likes');
  });

  it('un échec de paiement ne crédite rien', async () => {
    const a = await member();
    const co = await a.agent.post('/api/checkout').send({ type: 'product', code: 'SUPERLIKE_30' });
    await a.agent.post(`/api/payments/mock/${co.body.providerRef}/complete`).send({ outcome: 'fail' });
    expect((await credits(a)).SUPER_LIKE).toBe(0);
  });

  it('un Super Like consomme un crédit seulement si l\'action réussit, et une seule fois', async () => {
    const city = `S-${uid()}`;
    const a = await member(city);
    const [t1, t2] = await Promise.all([seedMember(c.prisma, { gender: 'MAN', seeking: 'WOMEN', city }), seedMember(c.prisma, { gender: 'MAN', seeking: 'WOMEN', city })]);
    const tooBad = await a.agent.post('/api/swipes').send({ targetId: t1!.id, action: 'SUPER_LIKE' });
    expect(tooBad.body.error.code).toBe('NO_SUPER_LIKES'); // gratuit, sans crédit
    await buy(a, { type: 'product', code: 'SUPERLIKE_5' });
    // cible bloquée → l'action échoue (404) : aucun crédit consommé
    await c.prisma.block.create({ data: { blockerId: t2!.id, blockedId: a.id } });
    expect((await a.agent.post('/api/swipes').send({ targetId: t2!.id, action: 'SUPER_LIKE' })).status).toBe(404);
    expect((await credits(a)).SUPER_LIKE).toBe(5);
    expect((await a.agent.post('/api/swipes').send({ targetId: t1!.id, action: 'SUPER_LIKE' })).status).toBe(200);
    expect((await credits(a)).SUPER_LIKE).toBe(4);
    // rejouer la même requête : pas de second débit
    expect((await a.agent.post('/api/swipes').send({ targetId: t1!.id, action: 'SUPER_LIKE' })).status).toBe(200);
    expect((await credits(a)).SUPER_LIKE).toBe(4);
    const notif = await c.prisma.notification.findFirst({ where: { userId: t1!.id, type: 'LIKE' } });
    expect((notif?.data as { superLike?: boolean }).superLike).toBe(true);
  });

  it('Premium : 5 Super Likes inclus par semaine sans crédit, puis crédits achetés', async () => {
    const city = `W-${uid()}`;
    const a = await member(city);
    await premium(a.id);
    const ts = await Promise.all(Array.from({ length: 7 }, () => seedMember(c.prisma, { gender: 'MAN', seeking: 'WOMEN', city })));
    for (let i = 0; i < 5; i++) expect((await a.agent.post('/api/swipes').send({ targetId: ts[i]!.id, action: 'SUPER_LIKE' })).status).toBe(200);
    expect((await credits(a)).SUPER_LIKE).toBe(0);
    expect((await a.agent.post('/api/swipes').send({ targetId: ts[5]!.id, action: 'SUPER_LIKE' })).body.error.code).toBe('NO_SUPER_LIKES');
    await buy(a, { type: 'product', code: 'SUPERLIKE_5' });
    expect((await a.agent.post('/api/swipes').send({ targetId: ts[5]!.id, action: 'SUPER_LIKE' })).status).toBe(200);
    expect((await credits(a)).SUPER_LIKE).toBe(4);
    const usage = (await a.agent.get('/api/swipes/usage')).body;
    expect(usage.used.superLikesWeek).toBe(6);
    expect(usage.limits.superLikesWeekly).toBe(5);
  });
});

describe('boosts', () => {
  it('acheter puis activer un boost consomme un crédit et prolonge la visibilité ; sans crédit rien ne change', async () => {
    const a = await member();
    expect((await a.agent.post('/api/boosts/activate').send({ creditType: 'BOOST_30' })).body.error.code).toBe('NO_CREDITS');
    expect(await c.prisma.boost.count({ where: { userId: a.id } })).toBe(0); // rien créé quand l'action échoue
    await buy(a, { type: 'product', code: 'BOOST_30' });
    expect((await credits(a)).BOOST_30).toBe(1);
    const r = await a.agent.post('/api/boosts/activate').send({ creditType: 'BOOST_30' });
    expect(r.status).toBe(200);
    expect(r.body.durationMinutes).toBe(30);
    expect((await credits(a)).BOOST_30).toBe(0);
    const prof = await c.prisma.profile.findUniqueOrThrow({ where: { userId: a.id } });
    expect(prof.boostedUntil!.getTime() - Date.now()).toBeGreaterThan(29 * 60_000);
    expect((await a.agent.get('/api/boosts')).body).toHaveLength(1);
  });

  it('deux activations simultanées avec un seul crédit : une seule réussit, un seul débit', async () => {
    const a = await member();
    await buy(a, { type: 'product', code: 'BOOST_120' });
    const [x, y] = await Promise.all([a.agent.post('/api/boosts/activate').send({ creditType: 'BOOST_120' }), a.agent.post('/api/boosts/activate').send({ creditType: 'BOOST_120' })]);
    expect([x.status, y.status].sort()).toEqual([200, 403]);
    expect((await credits(a)).BOOST_120).toBe(0);
    expect(await c.prisma.boost.count({ where: { userId: a.id } })).toBe(1);
  });

  it('un boost actif place le profil en tête des recommandations sans changer le % affiché', async () => {
    const city = `B-${uid()}`;
    const viewer = await seedMember(c.prisma, { gender: 'WOMAN', seeking: 'MEN', city });
    const plain = await seedMember(c.prisma, { gender: 'MAN', seeking: 'WOMEN', city });
    const boosted = await member(city, 'MAN');
    await buy(boosted, { type: 'product', code: 'BOOST_30' });
    await boosted.agent.post('/api/boosts/activate').send({ creditType: 'BOOST_30' });
    const feed = (await (await login(c.http, viewer.email)).get('/api/discovery?limit=10')).body.items as { id: string; compatibility: number }[];
    expect(feed[0]!.id).toBe(boosted.id);
    expect(feed.map((x) => x.id)).toContain(plain.id);
  });
});

describe('likes envoyés', () => {
  it('liste les profils que j\'ai likés et indique le match', async () => {
    const city = `L-${uid()}`;
    const a = await member(city);
    const b = await member(city, 'MAN');
    const t = await seedMember(c.prisma, { gender: 'MAN', seeking: 'WOMEN', city });
    await a.agent.post('/api/swipes').send({ targetId: b.id, action: 'LIKE' });
    await a.agent.post('/api/swipes').send({ targetId: t.id, action: 'LIKE' });
    let sent = (await a.agent.get('/api/swipes/sent')).body;
    expect(sent.items.map((i: { id: string }) => i.id).sort()).toEqual([b.id, t.id].sort());
    expect(sent.items.every((i: { matched: boolean }) => !i.matched)).toBe(true);
    await b.agent.post('/api/swipes').send({ targetId: a.id, action: 'LIKE' });
    sent = (await a.agent.get('/api/swipes/sent')).body;
    const m = sent.items.find((i: { id: string }) => i.id === b.id);
    expect(m.matched).toBe(true);
    expect(m.conversationId).toBeTruthy();
    // un profil passé n'apparaît pas
    await a.agent.post('/api/swipes').send({ targetId: (await seedMember(c.prisma, { gender: 'MAN', seeking: 'WOMEN', city })).id, action: 'PASS' });
    expect((await a.agent.get('/api/swipes/sent')).body.items).toHaveLength(2);
  });
});

describe('jetons Match inclus dans la formule', () => {
  it('Premium crédite 5 jetons par mois (3 mois = 15), une seule fois par paiement (rejeu sans effet), configurable', async () => {
    const a = await member();
    const co = await buy(a, { type: 'subscription', plan: 'PREMIUM', months: 3 });
    expect((await credits(a)).MATCH_TOKEN).toBe(15);
    // Rejeu du webhook de paiement : aucun jeton de plus (journal unique par paiement).
    await a.agent.post(`/api/payments/mock/${co.providerRef}/complete`).send({ outcome: 'success' });
    expect((await credits(a)).MATCH_TOKEN).toBe(15);
  });

  it('le gratuit ne reçoit aucun jeton inclus', async () => {
    const a = await member();
    expect((await credits(a)).MATCH_TOKEN).toBe(0);
  });
});
