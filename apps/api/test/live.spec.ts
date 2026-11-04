import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LIVE, type LiveCriteria } from '@duomatch/types';
import { acceptsSeeker, matchesCriteria, type Candidate } from '../src/live/criteria.js';
import { LiveService } from '../src/live/live.service.js';
import { boot, login, seedMember, uid, type App } from './helpers.js';

type Ctx = Awaited<ReturnType<typeof boot>>;
let c: Ctx;
beforeAll(async () => { c = await boot(); });
afterAll(async () => { await (c.app as App).close(); });

type M = Awaited<ReturnType<typeof member>>;
async function member(gender: 'WOMAN' | 'MAN' = 'MAN') {
  const city = `L-${uid()}`;
  const m = await seedMember(c.prisma, { gender, seeking: gender === 'WOMAN' ? 'MEN' : 'WOMEN', city });
  return { ...m, agent: await login(c.http, m.email) };
}
/** Code pays d'origine unique par test : isole les candidats des autres membres en base. */
const code = () => String.fromCharCode(65 + Math.floor(Math.random() * 26)) + String.fromCharCode(65 + Math.floor(Math.random() * 26));
const setProfile = (u: M, data: Record<string, unknown>) => c.prisma.profile.update({ where: { userId: u.id }, data });
const premium = (userId: string) => c.prisma.entitlement.upsert({ where: { userId }, create: { userId, plan: 'PREMIUM', validUntil: new Date(Date.now() + 30 * 86_400_000) }, update: { plan: 'PREMIUM', validUntil: new Date(Date.now() + 30 * 86_400_000) } });
const criteria = (origin: string, extra: Partial<LiveCriteria> = {}) => ({ seeking: 'MEN', ageMin: 18, ageMax: 60, originCountry: origin, ...extra });
const tokens = async (u: M) => (await u.agent.get('/api/credits')).body.balances.MATCH_TOKEN as number;
const backdate = (userId: string) => c.prisma.liveSearch.updateMany({ where: { userId }, data: { createdAt: new Date(Date.now() - 20 * 60_000) } });
async function buyTokens(u: M, codeProduct = 'TOKENS_5') {
  const co = await u.agent.post('/api/checkout').send({ type: 'product', code: codeProduct });
  expect(co.status).toBe(201);
  expect(co.body.amountXof).toBe(1000);
  expect((await u.agent.post(`/api/payments/mock/${co.body.providerRef}/complete`).send({ outcome: 'success' })).status).toBe(200);
}
/** Un candidat prêt à être invité : en ligne, origine donnée. */
async function candidate(origin: string) {
  const m = await member('MAN');
  await setProfile(m, { originCountry: origin });
  return m;
}
async function seeker(plan: 'FREE' | 'PREMIUM' = 'PREMIUM') {
  const s = await member('WOMAN');
  if (plan === 'PREMIUM') await premium(s.id);
  return s;
}

describe('critères (fonctions pures)', () => {
  const base: Candidate = { gender: 'MAN', birthDate: new Date(Date.UTC(1995, 0, 1)), country: 'TG', intent: 'SERIOUS', hasChildren: null, likesPets: true, living: 'ALONE', heightCm: 180, originCountry: 'TG' };
  const crit = (o: Partial<LiveCriteria> = {}): LiveCriteria => ({ seeking: 'MEN', ageMin: 18, ageMax: 60, hasChildren: 'ANY', likesPets: 'ANY', living: 'ANY', ...o });
  it('applique chaque critère et refuse les données absentes quand elles sont exigées', () => {
    const now = new Date(Date.UTC(2026, 5, 1));
    expect(matchesCriteria(crit(), base, now)).toBe(true);
    expect(matchesCriteria(crit({ seeking: 'WOMEN' }), base, now)).toBe(false);
    expect(matchesCriteria(crit({ ageMin: 40 }), base, now)).toBe(false);
    expect(matchesCriteria(crit({ likesPets: 'YES' }), base, now)).toBe(true);
    expect(matchesCriteria(crit({ likesPets: 'NO' }), base, now)).toBe(false);
    expect(matchesCriteria(crit({ hasChildren: 'NO' }), base, now)).toBe(false); // information absente : jamais devinée
    expect(matchesCriteria(crit({ hasChildren: 'NO' }), { ...base, hasChildren: false }, now)).toBe(true);
    expect(matchesCriteria(crit({ living: 'FAMILY' }), base, now)).toBe(false);
    expect(matchesCriteria(crit({ heightMin: 170, heightMax: 185 }), base, now)).toBe(true);
    expect(matchesCriteria(crit({ heightMin: 185 }), base, now)).toBe(false);
    expect(matchesCriteria(crit({ heightMin: 150 }), { ...base, heightCm: null }, now)).toBe(false);
    expect(matchesCriteria(crit({ originCountry: 'SN' }), base, now)).toBe(false);
    expect(matchesCriteria(crit({ intents: ['MARRIAGE'] }), base, now)).toBe(false);
  });
  it('réciprocité : la personne invitée doit accepter le genre et l’âge de qui cherche', () => {
    const woman = { gender: 'WOMAN', birthDate: new Date(Date.UTC(1995, 0, 1)) };
    const now = new Date(Date.UTC(2026, 5, 1));
    expect(acceptsSeeker({ seeking: 'WOMEN', ageMin: 18, ageMax: 40 }, woman, now)).toBe(true);
    expect(acceptsSeeker({ seeking: 'MEN', ageMin: 18, ageMax: 40 }, woman, now)).toBe(false);
    expect(acceptsSeeker({ seeking: 'WOMEN', ageMin: 18, ageMax: 25 }, woman, now)).toBe(false);
    expect(acceptsSeeker(null, woman, now)).toBe(false);
  });
});

describe('jetons offerts à 100 %', () => {
  it('3 jetons une seule fois, uniquement profil complet à 100 % et e-mail vérifié', async () => {
    const a = await member('MAN');
    expect((await a.agent.get('/api/live/state')).body.tokens).toBe(0); // 70 % : rien
    await setProfile(a, { completeness: 100 });
    const s1 = await a.agent.get('/api/live/state');
    expect(s1.body.tokens).toBe(LIVE.PROFILE_GIFT_TOKENS);
    expect((await a.agent.get('/api/live/state')).body.tokens).toBe(3); // pas de second cadeau
    // Même après avoir baissé puis remonté à 100 %, le cadeau ne se répète pas.
    await setProfile(a, { completeness: 60 });
    await setProfile(a, { completeness: 100 });
    expect((await a.agent.get('/api/live/state')).body.tokens).toBe(3);
    const hist = await c.prisma.creditTransaction.findMany({ where: { userId: a.id, reason: 'GRANT_PROFILE' } });
    expect(hist).toHaveLength(1);

    const b = await member('MAN');
    await c.prisma.user.update({ where: { id: b.id }, data: { emailVerifiedAt: null } });
    await setProfile(b, { completeness: 100 });
    // Compte non vérifié : la route est protégée (RequireVerified) et aucun jeton n'est accordé.
    expect([401, 403]).toContain((await b.agent.get('/api/live/state')).status);
    expect(await c.prisma.creditTransaction.count({ where: { userId: b.id } })).toBe(0);
  });
});

describe('accès : essais gratuits et formule', () => {
  it('le plan Gratuit a 2 essais, avec un délai de 15 min ; Premium est illimité', async () => {
    const o = code();
    await candidate(o);
    const f = await seeker('FREE');
    const st = await f.agent.get('/api/live/state');
    expect(st.body.access).toMatchObject({ unlimited: false, trialsLeft: 2, canStart: true });

    expect((await f.agent.post('/api/live/searches').send(criteria(o))).status).toBe(200);
    const again = await f.agent.post('/api/live/searches').send(criteria(o));
    expect(again.status).toBe(429); // délai de 15 min
    expect(again.body.error.code).toBe('LIVE_COOLDOWN');

    await backdate(f.id);
    expect((await f.agent.post('/api/live/searches').send(criteria(o))).status).toBe(200); // 2e essai
    await backdate(f.id);
    const third = await f.agent.post('/api/live/searches').send(criteria(o));
    expect(third.status).toBe(403);
    expect(third.body.error.code).toBe('PLAN_REQUIRED');
    expect((await f.agent.get('/api/live/state')).body.access).toMatchObject({ trialsLeft: 0, canStart: false });

    const p = await seeker('PREMIUM');
    for (let i = 0; i < 3; i++) {
      expect((await p.agent.post('/api/live/searches').send(criteria(o))).status).toBe(200);
      await backdate(p.id);
    }
    expect((await p.agent.get('/api/live/state')).body.access).toMatchObject({ unlimited: true, canStart: true });
  });

  it('refuse des critères invalides', async () => {
    const p = await seeker();
    const r = await p.agent.post('/api/live/searches').send({ seeking: 'MEN', ageMin: 40, ageMax: 20 });
    expect(r.status).toBe(400);
  });
});

describe('recherche, invitations et conversation payée en jetons', () => {
  it('invite seulement les personnes en ligne, compatibles, ouvertes et non bloquées', async () => {
    const o = code();
    const ok = await candidate(o);
    const wrongOrigin = await candidate(code() === o ? 'ZZ' : 'ZY');
    const optedOut = await candidate(o);
    await setProfile(optedOut, { liveOptIn: false });
    const offline = await candidate(o);
    await c.prisma.user.update({ where: { id: offline.id }, data: { lastActiveAt: new Date(Date.now() - 3_600_000) } });
    const blocker = await candidate(o);
    const s = await seeker();
    await c.prisma.block.create({ data: { blockerId: blocker.id, blockedId: s.id } });

    const r = await s.agent.post('/api/live/searches').send(criteria(o));
    expect(r.status).toBe(200);
    expect(r.body.invited).toBe(1);
    expect((await ok.agent.get('/api/live/invites')).body.items).toHaveLength(1);
    for (const u of [wrongOrigin, optedOut, offline, blocker]) expect((await u.agent.get('/api/live/invites')).body.items).toHaveLength(0);
  });

  it('une personne qui se connecte plus tard reçoit l’invitation tant que la recherche (24 h) est active', async () => {
    const o = code();
    const late = await candidate(o);
    await c.prisma.user.update({ where: { id: late.id }, data: { lastActiveAt: new Date(Date.now() - 3_600_000) } });
    const s = await seeker();
    expect((await s.agent.post('/api/live/searches').send(criteria(o))).body.invited).toBe(0);
    await c.app.get(LiveService).onPresence(late.id);
    expect((await late.agent.get('/api/live/invites')).body.items).toHaveLength(1);
    await c.app.get(LiveService).onPresence(late.id); // idempotent : toujours une seule invitation
    expect((await late.agent.get('/api/live/invites')).body.items).toHaveLength(1);
  });

  it('plafond d’invitations en attente par personne (anti-harcèlement)', async () => {
    const o = code();
    const target = await candidate(o);
    let invitedTotal = 0;
    for (let i = 0; i < LIVE.MAX_PENDING_PER_INVITEE + 1; i++) {
      const s = await seeker();
      invitedTotal += (await s.agent.post('/api/live/searches').send(criteria(o))).body.invited as number;
    }
    expect(invitedTotal).toBe(LIVE.MAX_PENDING_PER_INVITEE);
    expect((await target.agent.get('/api/live/invites')).body.items).toHaveLength(LIVE.MAX_PENDING_PER_INVITEE);
  });

  it('parcours complet : accepter, jetons insuffisants, achat, choix (1 jeton chacun, 2 au plus), jamais deux fois', async () => {
    const o = code();
    const [c1, c2, c3] = [await candidate(o), await candidate(o), await candidate(o)];
    const s = await seeker();
    expect((await s.agent.post('/api/live/searches').send(criteria(o))).body.invited).toBe(3);

    const inv = async (u: M) => ((await u.agent.get('/api/live/invites')).body.items as Array<{ inviteId: string }>)[0]!.inviteId;
    const [i1, i2, i3] = [await inv(c1), await inv(c2), await inv(c3)];

    // Un tiers ne peut ni accepter ni choisir l'invitation d'un autre.
    expect((await c2.agent.post(`/api/live/invites/${i1}/accept`).send()).status).toBe(404);
    expect((await c1.agent.post(`/api/live/invites/${i1}/choose`).send()).status).toBe(404);

    expect((await c1.agent.post(`/api/live/invites/${i1}/accept`).send()).status).toBe(200);
    expect((await c1.agent.post(`/api/live/invites/${i1}/accept`).send()).status).toBe(409); // une seule réponse
    expect((await c2.agent.post(`/api/live/invites/${i2}/accept`).send()).status).toBe(200);
    expect((await c3.agent.post(`/api/live/invites/${i3}/accept`).send()).status).toBe(200);

    const st = await s.agent.get('/api/live/state');
    expect(st.body.accepted.map((a: { inviteId: string }) => a.inviteId).sort()).toEqual([i1, i2, i3].sort());
    expect(st.body.search.choicesLeft).toBe(2);

    // Sans jeton : refus, rien n'est débité ni ouvert, l'invitation reste acceptée.
    const noTok = await s.agent.post(`/api/live/invites/${i1}/choose`).send();
    expect(noTok.status).toBe(403);
    expect(noTok.body.error.code).toBe('NO_TOKENS');
    expect((await c.prisma.liveInvite.findUnique({ where: { id: i1 } }))?.status).toBe('ACCEPTED');
    expect(await c.prisma.match.count({ where: { OR: [{ userAId: s.id }, { userBId: s.id }] } })).toBe(0);

    await buyTokens(s);
    expect(await tokens(s)).toBe(5);

    const ch1 = await s.agent.post(`/api/live/invites/${i1}/choose`).send();
    expect(ch1.status).toBe(200);
    expect(ch1.body).toMatchObject({ charged: 1, tokens: 4 });
    const again = await s.agent.post(`/api/live/invites/${i1}/choose`).send();
    expect(again.status).toBe(409);
    expect(await tokens(s)).toBe(4); // débité une seule fois

    // Le chat existe et fonctionne pour les deux.
    const msg = await s.agent.post(`/api/conversations/${ch1.body.conversationId}/messages`).send({ body: 'Bonjour !' });
    expect(msg.status).toBe(201);
    expect((await c1.agent.get(`/api/conversations/${ch1.body.conversationId}/messages`)).status).toBe(200);

    // Choix simultanés : un seul jeton par personne, 2 personnes au plus.
    const [x, y] = await Promise.all([s.agent.post(`/api/live/invites/${i2}/choose`).send(), s.agent.post(`/api/live/invites/${i3}/choose`).send()]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    expect(await tokens(s)).toBe(3);
    expect((await s.agent.get('/api/live/state')).body.search.choicesLeft).toBe(0);
    expect(await c.prisma.creditTransaction.count({ where: { userId: s.id, reason: 'CONSUME', type: 'MATCH_TOKEN' } })).toBe(2);
  });

  it('déjà en relation : aucun jeton consommé', async () => {
    const o = code();
    const t = await candidate(o);
    const s = await seeker();
    await buyTokens(s);
    await s.agent.post('/api/live/searches').send(criteria(o));
    const i = ((await t.agent.get('/api/live/invites')).body.items as Array<{ inviteId: string }>)[0]!.inviteId;
    await t.agent.post(`/api/live/invites/${i}/accept`).send();
    const [a, b] = s.id < t.id ? [s.id, t.id] : [t.id, s.id];
    await c.prisma.match.create({ data: { userAId: a, userBId: b, conversation: { create: {} } } });
    const r = await s.agent.post(`/api/live/invites/${i}/choose`).send();
    expect(r.status).toBe(200);
    expect(r.body.charged).toBe(0);
    expect(await tokens(s)).toBe(5);
  });

  it('refuser une invitation et se retirer du service', async () => {
    const o = code();
    const t = await candidate(o);
    const s = await seeker();
    await s.agent.post('/api/live/searches').send(criteria(o));
    const i = ((await t.agent.get('/api/live/invites')).body.items as Array<{ inviteId: string }>)[0]!.inviteId;
    expect((await t.agent.post(`/api/live/invites/${i}/decline`).send()).status).toBe(200);
    expect((await s.agent.get('/api/live/state')).body.accepted).toHaveLength(0);
    expect((await t.agent.put('/api/live/opt-in').send({ enabled: false })).body.optIn).toBe(false);
    expect((await s.agent.delete('/api/live/searches/active')).status).toBe(200);
    expect((await s.agent.get('/api/live/state')).body.search).toBeNull();
  });
});
