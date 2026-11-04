import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { agentFor, boot, jpeg, login, PASSWORD, seedMember, uid, type App } from './helpers.js';

type Ctx = Awaited<ReturnType<typeof boot>>;
let c: Ctx;
const city = `Ville-${uid()}`;

beforeAll(async () => { c = await boot(); });
afterAll(async () => { await (c.app as App).close(); });

const adult = (email: string, over: Record<string, unknown> = {}) => ({
  displayName: 'Ama', email, password: PASSWORD, birthDate: '1995-05-05', gender: 'WOMAN', country: 'TG', city, acceptTerms: true, ...over,
});

describe('inscription, e-mail et connexion', () => {
  it('refuse un mineur (18 ans minimum)', async () => {
    const y = new Date(); y.setUTCFullYear(y.getUTCFullYear() - 16);
    const r = await request(c.http).post('/api/auth/register').send(adult(`kid-${uid()}@t.io`, { birthDate: y.toISOString().slice(0, 10) }));
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(r.body.error.details)).toContain('underage');
  });

  it('inscrit un adulte, envoie l’e-mail, exige la vérification puis l’accepte', async () => {
    const email = `ama-${uid()}@t.io`;
    const a = agentFor(c.http);
    const reg = await a.post('/api/auth/register').send(adult(email));
    expect(reg.status).toBe(201);
    expect(reg.headers['set-cookie']?.[0]).toMatch(/duomatch_sid=.*HttpOnly/i);

    // Sans e-mail vérifié : pas de découverte
    expect((await a.get('/api/discovery')).body.error.code).toBe('EMAIL_NOT_VERIFIED');

    const mail = [...c.mail.outbox].reverse().find((m) => m.to === email)!;
    const token = /token=([\w-]+)/.exec(mail.text)![1]!;
    expect((await request(c.http).post('/api/auth/verify-email').send({ token: 'faux-token-faux-token' })).status).toBe(400);
    expect((await a.post('/api/auth/verify-email').send({ token })).status).toBe(200);
    expect((await a.post('/api/auth/verify-email').send({ token })).status).toBe(400); // usage unique
    expect((await a.get('/api/users/me')).body.emailVerified).toBe(true);
  });

  it('refuse un doublon d’e-mail et un mot de passe faible', async () => {
    const email = `dup-${uid()}@t.io`;
    await request(c.http).post('/api/auth/register').send(adult(email));
    expect((await request(c.http).post('/api/auth/register').send(adult(email))).status).toBe(409);
    expect((await request(c.http).post('/api/auth/register').send(adult(`w-${uid()}@t.io`, { password: 'faible' }))).status).toBe(400);
  });

  it('verrouille le compte après 5 échecs sans révéler si l’e-mail existe', async () => {
    const email = `lock-${uid()}@t.io`;
    await request(c.http).post('/api/auth/register').send(adult(email));
    const unknown = await request(c.http).post('/api/auth/login').send({ email: `nope-${uid()}@t.io`, password: 'Whatever-123' });
    const wrong = await request(c.http).post('/api/auth/login').send({ email, password: 'Mauvais-Mdp-1' });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe(unknown.body.error.code);
    for (let i = 0; i < 4; i++) await request(c.http).post('/api/auth/login').send({ email, password: 'Mauvais-Mdp-1' });
    const locked = await request(c.http).post('/api/auth/login').send({ email, password: PASSWORD });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('réinitialise le mot de passe et révoque les sessions', async () => {
    const email = `rst-${uid()}@t.io`;
    const a = agentFor(c.http);
    await a.post('/api/auth/register').send(adult(email));
    expect((await request(c.http).post('/api/auth/forgot-password').send({ email: `inconnu-${uid()}@t.io` })).status).toBe(202);
    await request(c.http).post('/api/auth/forgot-password').send({ email });
    const mail = [...c.mail.outbox].reverse().find((m) => m.to === email && m.subject.includes('Réinitialisation'))!;
    const token = /token=([\w-]+)/.exec(mail.text)![1]!;
    const r = await request(c.http).post('/api/auth/reset-password').send({ token, password: 'Nouveau-Mdp-2026' });
    expect(r.status).toBe(200);
    expect((await a.get('/api/users/me')).status).toBe(401); // ancienne session révoquée
    expect((await request(c.http).post('/api/auth/login').send({ email, password: 'Nouveau-Mdp-2026' })).status).toBe(200);
  });

  it('rejette une origine étrangère sur une requête mutante (CSRF)', async () => {
    const r = await request(c.http).post('/api/auth/login').set('Origin', 'https://evil.example').send({ email: 'a@b.co', password: 'x' });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('CSRF_ORIGIN');
  });
});

describe('profil, photos et découverte', () => {
  it('parcours complet : onboarding, photo nettoyée, préférences', async () => {
    const email = `onb-${uid()}@t.io`;
    const a = agentFor(c.http);
    await a.post('/api/auth/register').send(adult(email));
    await c.prisma.user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });

    expect((await a.post('/api/profiles/me/onboarding/complete')).body.error.code).toBe('PHOTO_REQUIRED');
    const upd = await a.patch('/api/profiles/me').send({ bio: 'J’aime la cuisine, les voyages et les longues discussions sincères.', interests: ['cooking', 'travel', 'music'], intent: 'SERIOUS', occupation: 'Ingénieure' });
    expect(upd.status).toBe(200);
    expect(upd.body.interests.sort()).toEqual(['cooking', 'music', 'travel']);

    const bad = await a.post('/api/profiles/me/photos').attach('file', Buffer.from('pas une image'), 'x.jpg');
    expect(bad.status).toBe(400);
    const up = await a.post('/api/profiles/me/photos').attach('file', await jpeg(), 'a.jpg');
    expect(up.status).toBe(201);
    expect(up.body.photos).toHaveLength(1);
    expect(up.body.photos[0].isPrimary).toBe(true);
    const img = await request(c.http).get(new URL(up.body.photos[0].url).pathname);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/webp');
    // la miniature (suffixe _t) est servie aussi ; un chemin hors format est refusé
    expect((await request(c.http).get(new URL(up.body.photos[0].thumbUrl).pathname)).status).toBe(200);
    expect((await request(c.http).get('/api/media/photos/..%2F..%2F.env')).status).toBe(404);
    expect((await request(c.http).get('/api/media/photos/NOT_HEX.webp')).status).toBe(404);

    expect((await a.put('/api/profiles/me/preferences').send({ seeking: 'MEN', ageMin: 25, ageMax: 20 })).status).toBe(400);
    const pref = await a.put('/api/profiles/me/preferences').send({ seeking: 'MEN', ageMin: 20, ageMax: 40, city });
    expect(pref.body.preference.seeking).toBe('MEN');
    // filtres avancés = Premium : refusés côté serveur
    expect((await a.put('/api/profiles/me/preferences').send({ seeking: 'MEN', ageMin: 20, ageMax: 40, verifiedOnly: true })).body.error.code).toBe('PLAN_REQUIRED');

    const done = await a.post('/api/profiles/me/onboarding/complete');
    expect(done.status).toBe(200);
    expect(done.body.onboarded).toBe(true);
    expect(done.body.completenessLevel).not.toBe('INCOMPLETE');
  });

  it('applique préférences mutuelles, blocages, comptes suspendus et mode discret', async () => {
    const c1 = `Disc-${uid()}`;
    const viewer = await seedMember(c.prisma, { gender: 'WOMAN', seeking: 'MEN', city: c1, age: 30 });
    const okMan = await seedMember(c.prisma, { gender: 'MAN', seeking: 'WOMEN', city: c1, name: 'Compatible' });
    const wrongGender = await seedMember(c.prisma, { gender: 'WOMAN', seeking: 'WOMEN', city: c1 });
    const notSeekingHer = await seedMember(c.prisma, { gender: 'MAN', seeking: 'MEN', city: c1 });
    const tooYoungForHim = await seedMember(c.prisma, { gender: 'MAN', seeking: 'WOMEN', city: c1 });
    await c.prisma.preference.update({ where: { userId: tooYoungForHim.id }, data: { ageMin: 40, ageMax: 60 } });
    const blocked = await seedMember(c.prisma, { gender: 'MAN', seeking: 'WOMEN', city: c1 });
    const suspended = await seedMember(c.prisma, { gender: 'MAN', seeking: 'WOMEN', city: c1 });
    await c.prisma.user.update({ where: { id: suspended.id }, data: { status: 'SUSPENDED' } });
    const hidden = await seedMember(c.prisma, { gender: 'MAN', seeking: 'WOMEN', city: c1 });
    await c.prisma.profile.update({ where: { userId: hidden.id }, data: { visibility: 'HIDDEN' } });
    const incognito = await seedMember(c.prisma, { gender: 'MAN', seeking: 'WOMEN', city: c1 });
    await c.prisma.profile.update({ where: { userId: incognito.id }, data: { incognito: true } });

    const a = await login(c.http, viewer.email);
    expect((await a.post(`/api/blocks/${blocked.id}`)).status).toBe(200);
    const feed = await a.get('/api/discovery?limit=30');
    const ids = feed.body.items.map((i: { id: string }) => i.id);
    expect(ids).toContain(okMan.id);
    for (const x of [wrongGender, notSeekingHer, tooYoungForHim, blocked, suspended, hidden, incognito]) expect(ids).not.toContain(x.id);
    expect((await a.get('/api/discovery/count')).body.count).toBe(1);

    const card = feed.body.items.find((i: { id: string }) => i.id === okMan.id);
    expect(card).not.toHaveProperty('approxLat');
    expect(card.compatibility).toBeGreaterThan(0);

    // l'autre sens : un bloqué ne voit plus la bloqueuse
    const b = await login(c.http, blocked.email);
    expect((await b.get('/api/discovery?limit=30')).body.items.map((i: { id: string }) => i.id)).not.toContain(viewer.id);
    expect((await b.get(`/api/profiles/${viewer.id}`)).status).toBe(404);

    // mode discret : visible seulement si la personne discrète m'a likée
    await c.prisma.swipe.create({ data: { giverId: incognito.id, targetId: viewer.id, action: 'LIKE' } });
    expect((await a.get('/api/discovery?limit=30')).body.items.map((i: { id: string }) => i.id)).toContain(incognito.id);
  });
});

describe('likes, matchs et messagerie', () => {
  it('crée exactement un match, de façon idempotente, même avec deux likes simultanés', async () => {
    const c2 = `Match-${uid()}`;
    const w = await seedMember(c.prisma, { gender: 'WOMAN', seeking: 'MEN', city: c2 });
    const m = await seedMember(c.prisma, { gender: 'MAN', seeking: 'WOMEN', city: c2 });
    const aw = await login(c.http, w.email);
    const am = await login(c.http, m.email);

    const [r1, r2] = await Promise.all([
      aw.post('/api/swipes').send({ targetId: m.id, action: 'LIKE' }),
      am.post('/api/swipes').send({ targetId: w.id, action: 'LIKE' }),
    ]);
    expect([r1.status, r2.status]).toEqual([200, 200]);
    expect([r1.body.matched, r2.body.matched].some(Boolean)).toBe(true);
    const [a, b] = w.id < m.id ? [w.id, m.id] : [m.id, w.id];
    expect(await c.prisma.match.count({ where: { userAId: a, userBId: b } })).toBe(1);

    // rejouer : pas de doublon, pas d'erreur
    const again = await aw.post('/api/swipes').send({ targetId: m.id, action: 'LIKE' });
    expect(again.status).toBe(200);
    expect(await c.prisma.match.count({ where: { userAId: a, userBId: b } })).toBe(1);
    expect(await c.prisma.swipe.count({ where: { giverId: w.id, targetId: m.id } })).toBe(1);
    // une seule notification de match par personne
    expect(await c.prisma.notification.count({ where: { userId: w.id, type: 'MATCH' } })).toBe(1);

    // ne se re-propose plus
    expect((await aw.get('/api/discovery?limit=30')).body.items.map((i: { id: string }) => i.id)).not.toContain(m.id);
  });

  it('messagerie : membres seulement, historique paginé, lecture, suppression, fermeture au blocage', async () => {
    const c3 = `Chat-${uid()}`;
    const w = await seedMember(c.prisma, { gender: 'WOMAN', seeking: 'MEN', city: c3 });
    const m = await seedMember(c.prisma, { gender: 'MAN', seeking: 'WOMEN', city: c3 });
    const stranger = await seedMember(c.prisma, { gender: 'MAN', seeking: 'WOMEN', city: c3 });
    const aw = await login(c.http, w.email);
    const am = await login(c.http, m.email);
    const as = await login(c.http, stranger.email);
    await aw.post('/api/swipes').send({ targetId: m.id, action: 'LIKE' });
    const matched = await am.post('/api/swipes').send({ targetId: w.id, action: 'LIKE' });
    expect(matched.body.matched).toBe(true);
    const conv = matched.body.match.conversationId as string;

    // deux utilisateurs non matchés ne peuvent pas échanger ; un tiers ne voit rien
    expect((await as.post(`/api/conversations/${conv}/messages`).send({ body: 'intrus' })).status).toBe(404);
    expect((await as.get(`/api/conversations/${conv}/messages`)).status).toBe(404);

    expect((await aw.post(`/api/conversations/${conv}/messages`).send({ body: '   ' })).status).toBe(400);
    for (let i = 1; i <= 5; i++) expect((await aw.post(`/api/conversations/${conv}/messages`).send({ body: `Salut ${i}` })).status).toBe(201);

    const list = await am.get('/api/conversations');
    expect(list.body[0].unread).toBe(5);
    expect(list.body[0].lastMessage.body).toBe('Salut 5');
    expect((await am.get('/api/conversations?q=salut 3')).body).toHaveLength(1);
    expect((await am.get('/api/conversations?q=introuvable')).body).toHaveLength(0);

    const p1 = await am.get(`/api/conversations/${conv}/messages?limit=3`);
    expect(p1.body.items.map((x: { body: string }) => x.body)).toEqual(['Salut 3', 'Salut 4', 'Salut 5']);
    const p2 = await am.get(`/api/conversations/${conv}/messages?limit=3&cursor=${p1.body.nextCursor}`);
    expect(p2.body.items.map((x: { body: string }) => x.body)).toEqual(['Salut 1', 'Salut 2']);
    expect(p2.body.nextCursor).toBeNull();

    expect((await am.post(`/api/conversations/${conv}/read`)).body.read).toBe(5);
    const afterRead = await aw.get(`/api/conversations/${conv}/messages`);
    expect(afterRead.body.items[0].readAt).not.toBeNull();
    // lecture désactivée : l'expéditeur ne voit plus l'accusé
    await c.prisma.profile.update({ where: { userId: m.id }, data: { readReceipts: false } });
    expect((await aw.get(`/api/conversations/${conv}/messages`)).body.items[0].readAt).toBeNull();

    const first = p2.body.items[0];
    expect((await am.delete(`/api/messages/${first.id}`)).status).toBe(404); // pas l'auteur
    expect((await aw.delete(`/api/messages/${first.id}`)).status).toBe(200);
    expect((await am.get(`/api/conversations/${conv}/messages?limit=10`)).body.items[0].body).toBeNull();

    // image : validée et réencodée côté serveur
    const img = await aw.post(`/api/conversations/${conv}/images`).attach('file', await jpeg(), 'p.jpg');
    expect(img.status).toBe(201);
    expect((await am.get(new URL(img.body.attachments[0].url).pathname)).status).toBe(200);
    expect((await as.get(new URL(img.body.attachments[0].url).pathname)).status).toBe(404);

    // blocage : la conversation est fermée dans les deux sens
    expect((await am.post(`/api/blocks/${w.id}`)).status).toBe(200);
    const closed = await aw.post(`/api/conversations/${conv}/messages`).send({ body: 'encore' });
    expect(closed.status).toBe(403);
    expect(closed.body.error.code).toBe('CONVERSATION_CLOSED');
    expect((await am.get('/api/conversations')).body).toHaveLength(0);
  });

  it('applique les limites de la formule gratuite côté serveur (likes et Super Like)', async () => {
    const c4 = `Quota-${uid()}`;
    const me = await seedMember(c.prisma, { gender: 'WOMAN', seeking: 'MEN', city: c4 });
    const a = await login(c.http, me.email);
    const targets = await Promise.all(Array.from({ length: 21 }, () => seedMember(c.prisma, { gender: 'MAN', seeking: 'WOMEN', city: c4 })));
    for (let i = 0; i < 20; i++) expect((await a.post('/api/swipes').send({ targetId: targets[i]!.id, action: 'LIKE' })).status).toBe(200);
    const over = await a.post('/api/swipes').send({ targetId: targets[20]!.id, action: 'LIKE' });
    expect(over.status).toBe(403);
    expect(over.body.error.code).toBe('DAILY_LIMIT');
    expect((await a.post('/api/swipes').send({ targetId: targets[20]!.id, action: 'PASS' })).status).toBe(200); // passer reste gratuit
    expect((await a.post('/api/swipes').send({ targetId: targets[20]!.id, action: 'SUPER_LIKE' })).status).toBe(200); // déjà décidé : idempotent
    const fresh = await seedMember(c.prisma, { gender: 'MAN', seeking: 'WOMEN', city: c4 });
    expect((await a.post('/api/swipes').send({ targetId: fresh.id, action: 'SUPER_LIKE' })).body.error.code).toBe('NO_SUPER_LIKES');
    expect((await a.post('/api/swipes/rewind')).body.error.code).toBe('PLAN_REQUIRED');
    expect((await a.post('/api/swipes').send({ targetId: me.id, action: 'LIKE' })).status).toBe(400);
  });

  it('masque l’identité des likes aux comptes gratuits', async () => {
    const c5 = `Likers-${uid()}`;
    const me = await seedMember(c.prisma, { gender: 'WOMAN', seeking: 'MEN', city: c5 });
    const fan = await seedMember(c.prisma, { gender: 'MAN', seeking: 'WOMEN', city: c5 });
    const af = await login(c.http, fan.email);
    const a = await login(c.http, me.email);
    await af.post('/api/swipes').send({ targetId: me.id, action: 'LIKE' });
    const r = await a.get('/api/swipes/received');
    expect(r.body.locked).toBe(true);
    expect(r.body.count).toBe(1);
    expect(r.body.items).toHaveLength(0);
    const notif = await a.get('/api/notifications');
    expect(notif.body.items[0].type).toBe('LIKE');
    expect(notif.body.items[0].data).toEqual({});
  });
});

describe('abonnements et paiements', () => {
  it('n’active jamais Premium sans webhook signé, puis applique les droits, la facture et l’annulation', async () => {
    const c6 = `Pay-${uid()}`;
    const me = await seedMember(c.prisma, { gender: 'WOMAN', seeking: 'MEN', city: c6 });
    const a = await login(c.http, me.email);

    const co = await a.post('/api/subscriptions/checkout').send({ plan: 'PREMIUM' });
    expect(co.status).toBe(201);
    expect(co.body.checkoutUrl).toContain('/checkout/mock');
    expect((await a.get('/api/subscriptions/me')).body.plan).toBe('FREE'); // checkout ≠ paiement

    const payload = JSON.stringify({ id: `evt_${uid()}`, type: 'payment.succeeded', providerRef: co.body.providerRef });
    expect((await request(c.http).post('/api/payments/webhook/mock').set('content-type', 'application/json').send(payload)).status).toBe(401);
    expect((await request(c.http).post('/api/payments/webhook/mock').set('content-type', 'application/json').set('x-duomatch-signature', 'ab'.repeat(32)).send(payload)).status).toBe(401);
    expect((await a.get('/api/subscriptions/me')).body.plan).toBe('FREE');

    const sig = createHmac('sha256', 'dev-only-webhook-secret-change-me').update(payload).digest('hex');
    const ok = await request(c.http).post('/api/payments/webhook/mock').set('content-type', 'application/json').set('x-duomatch-signature', sig).send(payload);
    expect(ok.status).toBe(200);
    const replay = await request(c.http).post('/api/payments/webhook/mock').set('content-type', 'application/json').set('x-duomatch-signature', sig).send(payload);
    expect(replay.body.duplicate).toBe(true);

    const sub = await a.get('/api/subscriptions/me');
    expect(sub.body.plan).toBe('PREMIUM');
    expect(sub.body.limits.unlimitedLikes).toBe(true);
    expect(sub.body.limits.dailyLikes).toBe(1000); // plafond anti-abus de la formule « illimitée »
    expect(await c.prisma.payment.count({ where: { userId: me.id, status: 'SUCCEEDED' } })).toBe(1);
    expect(await c.prisma.invoice.count({ where: { payment: { userId: me.id } } })).toBe(1);

    const history = await a.get('/api/payments');
    expect(history.body[0].invoiceNumber).toMatch(/^DM-\d{8}-/);
    expect((await a.get(`/api/payments/${history.body[0].id}/invoice`)).body.amountXof).toBe(2500);

    // droits Premium appliqués : Super Like et filtres avancés
    const target = await seedMember(c.prisma, { gender: 'MAN', seeking: 'WOMEN', city: c6 });
    expect((await a.post('/api/swipes').send({ targetId: target.id, action: 'SUPER_LIKE' })).status).toBe(200);
    expect((await a.put('/api/profiles/me/preferences').send({ seeking: 'MEN', ageMin: 20, ageMax: 40, verifiedOnly: true })).status).toBe(200);

    expect((await a.post('/api/subscriptions/cancel')).body.subscription.cancelAtPeriodEnd).toBe(true);
    expect((await a.post('/api/subscriptions/resume')).body.subscription.cancelAtPeriodEnd).toBe(false);
    await a.post('/api/subscriptions/cancel');

    // expiration : retour au plan gratuit
    const { PaymentsService } = await import('../src/subscriptions/payments.service.js');
    const res = await c.app.get(PaymentsService).runExpiryJob(new Date(Date.now() + 40 * 86_400_000));
    expect(res.expired).toBeGreaterThanOrEqual(1);
    expect((await a.get('/api/subscriptions/me')).body.plan).toBe('FREE');
  });

  it('échec de paiement : aucun droit accordé, paiement marqué échoué', async () => {
    const me = await seedMember(c.prisma, { gender: 'WOMAN', seeking: 'MEN', city: `F-${uid()}` });
    const a = await login(c.http, me.email);
    const co = await a.post('/api/subscriptions/checkout').send({ plan: 'VIP' });
    expect((await a.post(`/api/payments/mock/${co.body.providerRef}/complete`).send({ outcome: 'fail' })).status).toBe(200);
    expect((await a.get('/api/subscriptions/me')).body.plan).toBe('FREE');
    expect((await a.get('/api/payments')).body[0].status).toBe('FAILED');
    // un autre utilisateur ne peut pas piloter ce paiement
    const other = await seedMember(c.prisma, { gender: 'MAN', seeking: 'WOMEN', city: `F-${uid()}` });
    const ao = await login(c.http, other.email);
    expect((await ao.post(`/api/payments/mock/${co.body.providerRef}/complete`).send({ outcome: 'success' })).status).toBe(404);
  });
});

describe('modération et administration (RBAC)', () => {
  it('sépare utilisateur, modérateur et administrateur ; journalise ; suspend et permet la contestation', async () => {
    const c7 = `Adm-${uid()}`;
    const user = await seedMember(c.prisma, { gender: 'MAN', seeking: 'WOMEN', city: c7 });
    const reporter = await seedMember(c.prisma, { gender: 'WOMAN', seeking: 'MEN', city: c7 });
    const mod = await seedMember(c.prisma, { gender: 'MAN', seeking: 'WOMEN', city: c7 });
    const adm = await seedMember(c.prisma, { gender: 'MAN', seeking: 'WOMEN', city: c7 });
    await c.prisma.user.update({ where: { id: mod.id }, data: { role: 'MODERATOR' } });
    await c.prisma.user.update({ where: { id: adm.id }, data: { role: 'ADMIN' } });
    const au = await login(c.http, user.email);
    const ar = await login(c.http, reporter.email);
    const am = await login(c.http, mod.email);
    const aa = await login(c.http, adm.email);

    expect((await au.get('/api/admin/reports')).status).toBe(403);
    expect((await request(c.http).get('/api/admin/reports')).status).toBe(401);
    expect((await am.get('/api/admin/overview')).status).toBe(403);
    expect((await aa.get('/api/admin/overview')).status).toBe(200);

    expect((await ar.post('/api/reports').send({ targetId: user.id, reason: 'SCAM', details: 'Demande de l’argent' })).status).toBe(201);
    const reports = await am.get('/api/admin/reports');
    const rep = reports.body.items.find((r: { target: { id: string } }) => r.target.id === user.id);
    expect(rep).toBeTruthy();

    // le modérateur ne voit pas l'e-mail, l'admin si
    expect((await am.get(`/api/admin/users/${user.id}`)).body.email).toBeNull();
    expect((await aa.get(`/api/admin/users/${user.id}`)).body.email).toBe(user.email);
    // pas de sanction contre le personnel
    expect((await am.post(`/api/admin/users/${adm.id}/suspend`).send({ reason: 'test' })).status).toBe(403);

    expect((await am.post(`/api/admin/users/${user.id}/suspend`).send({ reason: 'Arnaque confirmée', days: 7, reportId: rep.id })).status).toBe(200);
    expect((await am.post(`/api/admin/reports/${rep.id}/resolve`).send({ status: 'RESOLVED' })).status).toBe(200);
    expect((await au.get('/api/discovery')).body.error.code).toBe('ACCOUNT_SUSPENDED');
    const me = await au.get('/api/users/me');
    expect(me.body.status).toBe('SUSPENDED');
    expect(me.body.moderation.reason).toBe('Arnaque confirmée');

    expect((await au.post('/api/users/me/appeal').send({ text: 'Je conteste, il s’agit d’une erreur.' })).status).toBe(200);
    const appeals = await am.get('/api/admin/appeals');
    const ap = appeals.body.find((x: { userId: string }) => x.userId === user.id);
    expect(ap.appealText).toContain('conteste');
    expect((await am.post(`/api/admin/appeals/${ap.id}/decide`).send({ approve: true, note: 'Révision OK' })).status).toBe(200);
    expect((await au.get('/api/discovery')).status).toBe(200);

    const logs = await aa.get('/api/admin/audit-logs?action=user.suspend');
    expect(logs.body.items.some((l: { targetId: string }) => l.targetId === user.id)).toBe(true);
    expect((await am.get('/api/admin/audit-logs')).status).toBe(403);

    // drapeaux de fonctionnalité
    expect((await aa.put('/api/admin/feature-flags/new_ui').send({ enabled: true })).status).toBe(404); // catalogue fermé
    expect((await aa.put('/api/admin/feature-flags/chat_images').send({ enabled: false })).status).toBe(200);
    expect((await request(c.http).get('/api/feature-flags')).body.chat_images).toBe(false);
    expect((await aa.put('/api/admin/feature-flags/chat_images').send({ enabled: true })).status).toBe(200);
    expect((await am.put('/api/admin/feature-flags/chat_images').send({ enabled: false })).status).toBe(403);
  });
});

describe('vie privée : export et suppression du compte', () => {
  it('exporte les données puis anonymise et déconnecte à la suppression', async () => {
    const me = await seedMember(c.prisma, { gender: 'WOMAN', seeking: 'MEN', city: `Del-${uid()}`, name: 'Zoé Secrète' });
    const a = await login(c.http, me.email);
    const exp = await a.get('/api/users/me/export');
    expect(exp.status).toBe(200);
    expect(exp.body.account.email).toBe(me.email);
    expect(exp.body.account).not.toHaveProperty('passwordHash');

    expect((await a.delete('/api/users/me').send({ confirm: 'DELETE', password: 'mauvais' })).status).toBe(401);
    expect((await a.delete('/api/users/me').send({ confirm: 'DELETE', password: PASSWORD })).status).toBe(200);
    expect((await a.get('/api/users/me')).status).toBe(401);
    const row = await c.prisma.user.findUniqueOrThrow({ where: { id: me.id }, include: { profile: true } });
    expect(row.status).toBe('DELETED');
    expect(row.email).not.toBe(me.email);
    expect(row.profile?.displayName).toBe('Compte supprimé');
    expect((await request(c.http).post('/api/auth/login').send({ email: me.email, password: PASSWORD })).status).toBe(401);
  });
});
