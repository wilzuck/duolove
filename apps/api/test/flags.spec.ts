import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FEATURE_FLAGS, type FlagKey } from '@duomatch/types';
import { boot, login, PASSWORD, seedMember, uid, type App } from './helpers.js';

type Ctx = Awaited<ReturnType<typeof boot>>;
let c: Ctx;
beforeAll(async () => { c = await boot(); await c.prisma.featureFlag.deleteMany({}); }); // état de départ propre : lignes laissées par d'autres fichiers effacées
afterAll(async () => {
  await c.prisma.featureFlag.deleteMany({}); // ne laisse aucun interrupteur coupé aux autres fichiers de test
  await (c.app as App).close();
});

type M = Awaited<ReturnType<typeof member>>;
async function member(gender: 'WOMAN' | 'MAN' = 'WOMAN') {
  const m = await seedMember(c.prisma, { gender, seeking: gender === 'WOMAN' ? 'MEN' : 'WOMEN', city: `F-${uid()}` });
  return { ...m, agent: await login(c.http, m.email) };
}
async function admin() {
  const m = await member();
  await c.prisma.user.update({ where: { id: m.id }, data: { role: 'ADMIN' } });
  return m;
}
const setFlag = (a: M, key: FlagKey, enabled: boolean) => a.agent.put(`/api/admin/feature-flags/${key}`).send({ enabled });
const register = async (referralCode?: string) => {
  const email = `fl-${uid()}-${uid()}@test.duomatch`;
  const res = await request(c.http).post('/api/auth/register').send({ displayName: 'Nouveau', email, password: PASSWORD, birthDate: '1995-05-05', gender: 'MAN', country: 'TG', city: `R-${uid()}`, acceptTerms: true, ...(referralCode ? { referralCode } : {}) });
  return Object.assign(res, { email });
};
const codeOf = (r: request.Response) => r.body?.error?.code;

describe('catalogue des flags', () => {
  it('liste toutes les fonctions pilotables avec leur état ; réservé aux administrateurs ; clés inconnues refusées', async () => {
    const a = await admin();
    const list = (await a.agent.get('/api/admin/feature-flags')).body as { key: string; enabled: boolean; category: string; emergency: boolean; overridden: boolean }[];
    expect(list.map((f) => f.key)).toEqual(FEATURE_FLAGS.map((f) => f.key));
    expect(list.every((f) => f.enabled && !f.overridden)).toBe(true); // tout est actif par défaut, aucune ligne en base
    const pub = (await request(c.http).get('/api/feature-flags')).body as Record<string, boolean>;
    expect(Object.keys(pub).sort()).toEqual(FEATURE_FLAGS.map((f) => f.key).sort());
    const u = await member();
    expect((await u.agent.get('/api/admin/feature-flags')).status).toBe(403);
    expect((await setFlag(u, 'live_match', false)).status).toBe(403);
    expect((await a.agent.put('/api/admin/feature-flags/inconnu').send({ enabled: false })).body.error.code).toBe('UNKNOWN_FLAG');
    expect((await a.agent.put('/api/admin/feature-flags/live_match').send({ enabled: 'non' })).status).toBe(400);
  });

  it('chaque changement est audité (avant → après) et visible tout de suite', async () => {
    const a = await admin();
    expect((await setFlag(a, 'boosts', false)).status).toBe(200);
    const row = (await a.agent.get('/api/admin/feature-flags')).body.find((f: { key: string }) => f.key === 'boosts');
    expect(row).toMatchObject({ enabled: false, overridden: true });
    expect((await request(c.http).get('/api/feature-flags')).body.boosts).toBe(false);
    const log = await c.prisma.auditLog.findFirstOrThrow({ where: { action: 'flag.set', targetId: 'boosts', actorId: a.id } });
    expect(log.metadata).toMatchObject({ before: true, enabled: false });
    await setFlag(a, 'boosts', true);
  });
});

describe('les flags sont appliqués côté serveur', () => {
  it('registration_open : plus d\'inscription, mais les membres existants se connectent encore', async () => {
    const a = await admin();
    await setFlag(a, 'registration_open', false);
    const r = await register();
    expect(r.status).toBe(503);
    expect(codeOf(r)).toBe('FEATURE_DISABLED');
    const u = await member();
    expect((await u.agent.get('/api/users/me')).status).toBe(200);
    await setFlag(a, 'registration_open', true);
    expect((await register()).status).toBe(201);
  });

  it('payments_enabled : plus de nouveau paiement, mais un paiement déjà lancé peut se terminer (personne n\'est lésé)', async () => {
    const a = await admin();
    const u = await member();
    const pending = await u.agent.post('/api/checkout').send({ type: 'product', code: 'TOKENS_5' });
    expect(pending.status).toBe(201);
    await setFlag(a, 'payments_enabled', false);
    const r = await u.agent.post('/api/checkout').send({ type: 'product', code: 'TOKENS_5' });
    expect([r.status, codeOf(r)]).toEqual([503, 'FEATURE_DISABLED']);
    expect((await u.agent.post('/api/checkout').send({ type: 'subscription', plan: 'PREMIUM', months: 1 })).status).toBe(503);
    expect((await u.agent.post(`/api/payments/mock/${pending.body.providerRef}/complete`).send({ outcome: 'success' })).status).toBe(200);
    expect((await u.agent.get('/api/credits')).body.balances.MATCH_TOKEN).toBe(5);
    await setFlag(a, 'payments_enabled', true);
    expect((await u.agent.post('/api/checkout').send({ type: 'product', code: 'TOKENS_5' })).status).toBe(201);
  });

  it('promo_codes : codes refusés (consultation, jetons, remise au paiement) ; les paiements sans code continuent', async () => {
    const a = await admin();
    const p = (await a.agent.post('/api/admin/promos').send({ code: `FLG${uid()}`.toUpperCase(), kind: 'PERCENT', percent: 10 })).body as { code: string };
    const u = await member();
    await setFlag(a, 'promo_codes', false);
    expect((await u.agent.post('/api/promo/lookup').send({ code: p.code })).status).toBe(503);
    expect((await u.agent.post('/api/promo/redeem').send({ code: p.code })).status).toBe(503);
    expect((await u.agent.post('/api/checkout').send({ type: 'product', code: 'TOKENS_5', promoCode: p.code })).status).toBe(503);
    expect((await u.agent.post('/api/checkout').send({ type: 'product', code: 'TOKENS_5' })).status).toBe(201);
    await setFlag(a, 'promo_codes', true);
    expect((await u.agent.post('/api/promo/lookup').send({ code: p.code })).status).toBe(200);
  });

  it('boosts, live_match, super_likes, chat_images : coupés puis rétablis', async () => {
    const a = await admin();
    const u = await member();
    const target = await member('MAN');
    await setFlag(a, 'boosts', false);
    expect(codeOf(await u.agent.post('/api/boosts/activate').send({ creditType: 'BOOST_30' }))).toBe('FEATURE_DISABLED');
    await setFlag(a, 'boosts', true);
    expect(codeOf(await u.agent.post('/api/boosts/activate').send({ creditType: 'BOOST_30' }))).not.toBe('FEATURE_DISABLED');

    await setFlag(a, 'live_match', false);
    expect((await u.agent.get('/api/live/state')).status).toBe(503);
    await setFlag(a, 'live_match', true);
    expect((await u.agent.get('/api/live/state')).status).toBe(200);

    await setFlag(a, 'super_likes', false);
    expect(codeOf(await u.agent.post('/api/swipes').send({ targetId: target.id, action: 'SUPER_LIKE' }))).toBe('FEATURE_DISABLED');
    expect((await u.agent.post('/api/swipes').send({ targetId: target.id, action: 'LIKE' })).status).toBe(200); // les likes normaux continuent
    await setFlag(a, 'super_likes', true);

    await setFlag(a, 'chat_images', false);
    expect((await u.agent.post('/api/conversations/inconnue/images')).status).toBe(503);
    await setFlag(a, 'chat_images', true);
    expect((await u.agent.post('/api/conversations/inconnue/images')).status).not.toBe(503);
  });

  it('referral_program : plus de rattachement ni de récompense ; les filleuls en attente sont payés à la réactivation', async () => {
    const a = await admin();
    const p = await member();
    const code = (await p.agent.get('/api/referral/me')).body.code as string;

    await setFlag(a, 'referral_program', false);
    expect((await p.agent.get('/api/referral/me')).body.enabled).toBe(false);
    const off = await register(code);
    expect(off.status).toBe(201); // l'inscription n'est jamais bloquée par le parrainage
    expect(await c.prisma.referral.count({ where: { referrerId: p.id } })).toBe(0);

    await setFlag(a, 'referral_program', true);
    const on = await register(code);
    const email = on.email;
    const fid = (await c.prisma.user.update({ where: { email }, data: { emailVerifiedAt: new Date() } })).id;
    await c.prisma.profile.update({ where: { userId: fid }, data: { completeness: 100 } });
    await setFlag(a, 'referral_program', false);
    const f = await login(c.http, email);
    await f.get('/api/live/state'); // qualifié mais programme coupé : rien n'est versé
    expect((await p.agent.get('/api/credits')).body.balances.MATCH_TOKEN).toBe(0);
    expect(await c.prisma.referral.count({ where: { refereeId: fid, status: 'PENDING' } })).toBe(1);
    await setFlag(a, 'referral_program', true);
    await f.get('/api/live/state');
    expect((await p.agent.get('/api/credits')).body.balances.MATCH_TOKEN).toBe(5);
  });
});
