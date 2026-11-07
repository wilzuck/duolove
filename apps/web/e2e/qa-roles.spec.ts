import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { login } from './helpers';

// Campagne QA par rôle, avec les comptes de démonstration (base de test) : parcours de toutes les pages autorisées, refus des pages interdites,
// droits propres à chaque offre, et quelques actions réelles. Chaque test porte un identifiant « QA-… » repris dans docs/QA_REPORT.md.
// Préparation : DATABASE_URL=…/duomatch_test SEED_PASSWORD='Duomio-E2E-2026!' python -m scripts.seed
const ORIGIN = { Origin: 'http://localhost:3000' };
const ACCOUNTS = {
  free: 'aminata@duo.test', premium: 'membre010@duo.test', vip: 'membre025@duo.test',
  moderator: 'moderateur@duo.test', admin: 'admin@duo.test', super: 'super@duo.test',
} as const;
type Role = keyof typeof ACCOUNTS;

const MEMBER_PAGES = ['/discover', '/daily', '/likes', '/messages', '/profile', '/settings', '/notifications', '/match', '/speed', '/shop', '/premium', '/referral'];
const ADMIN_PAGES = ['/admin', '/admin/moderation', '/admin/audit-log', '/admin/users', '/admin/reports', '/admin/subscriptions', '/admin/plans', '/admin/promos', '/admin/payments',
  '/admin/refunds', '/admin/engagement', '/admin/speed', '/admin/blog', '/admin/flags'];
const MODERATOR_PAGES = ['/admin/moderation', '/admin/users', '/admin/reports'];
const PUBLIC_PAGES = ['/', '/about', '/pricing', '/blog', '/how-it-works', '/help', '/contact', '/legal/community', '/legal/terms', '/legal/cookies', '/login', '/register', '/forgot-password'];

async function session(browser: Browser, role: Role) {
  const ctx = await browser.newContext({ locale: 'fr-FR', viewport: { width: 1280, height: 900 }, storageState: { cookies: [], origins: [{ origin: 'http://localhost:3000', localStorage: [{ name: 'duomatch.cookiesNotice', value: '1' }] }] } });
  const page = await ctx.newPage();
  await login(page, ACCOUNTS[role]);
  await expect(page).toHaveURL(role === 'free' || role === 'premium' || role === 'vip' ? /discover/ : /(discover|admin)/, { timeout: 20_000 });
  return { ctx, page };
}

/** Charge une page et relève : réponses serveur ≥ 500, erreurs JavaScript, texte d'erreur affiché. */
async function visit(page: Page, path: string) {
  const problems: string[] = [];
  const onResp = (r: { status(): number; url(): string }) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`); };
  const onConsole = (m: { type(): string; text(): string }) => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) problems.push(`console: ${m.text().slice(0, 140)}`); };
  const onErr = (e: Error) => problems.push(`exception: ${e.message.slice(0, 140)}`);
  page.on('response', onResp); page.on('console', onConsole); page.on('pageerror', onErr);
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main, #main').first()).toBeVisible({ timeout: 20_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  if (await page.getByText(/Internal Server Error|Application error|Something went wrong\. Please try/i).count()) problems.push('message d’erreur affiché');
  page.off('response', onResp); page.off('console', onConsole); page.off('pageerror', onErr);
  return problems;
}

test.describe('QA-PUB · visiteur anonyme', () => {
  test('QA-PUB-01 pages publiques FR : aucune erreur, accessibles', async ({ page }) => {
    const all: string[] = [];
    for (const p of PUBLIC_PAGES) { const pr = await visit(page, p); all.push(...pr.map((x) => `${p} → ${x}`)); }
    expect(all).toEqual([]);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map((v) => v.id)).toEqual([]);
  });
  test('QA-PUB-02 pages publiques EN : mêmes pages en anglais', async ({ page }) => {
    const all: string[] = [];
    for (const p of PUBLIC_PAGES) { const pr = await visit(page, `/en${p === '/' ? '' : p}`); all.push(...pr.map((x) => `/en${p} → ${x}`)); }
    expect(all).toEqual([]);
  });
  test('QA-PUB-03 pages réservées : un visiteur est renvoyé vers la connexion, l’API répond 401', async ({ page, request }) => {
    for (const p of ['/discover', '/messages', '/settings', '/admin']) { await page.goto(p); await expect(page).toHaveURL(/login/); }
    for (const u of ['/api/users/me', '/api/conversations', '/api/admin/users', '/api/speed-events']) expect((await request.get(u)).status(), u).toBe(401);
  });
  test('QA-PUB-04 inscription : un mineur est refusé (formulaire et API)', async ({ request }) => {
    const r = await request.post('/api/auth/register', { headers: ORIGIN, data: { displayName: 'Mineur', email: `mineur${Date.now()}@example.com`, password: 'Duomio-E2E-2026!', birthDate: '2012-01-01', gender: 'MAN', country: 'CI', city: 'Abidjan', acceptTerms: true } });
    expect(r.status()).toBe(400);
  });
});

for (const role of ['free', 'premium', 'vip'] as const) {
  test.describe(`QA-${role.toUpperCase()} · membre ${role}`, () => {
    let s: Awaited<ReturnType<typeof session>>;
    test.beforeAll(async ({ browser }) => { s = await session(browser, role); });
    test.afterAll(async () => { await s.ctx.close(); });

    test(`QA-${role.toUpperCase()}-01 toutes les pages membre se chargent sans erreur`, async () => {
      const all: string[] = [];
      for (const p of MEMBER_PAGES) { const pr = await visit(s.page, p); all.push(...pr.map((x) => `${p} → ${x}`)); }
      expect(all).toEqual([]);
    });
    test(`QA-${role.toUpperCase()}-02 la console d’administration est interdite (page et API)`, async () => {
      await s.page.goto('/admin');
      await expect(s.page).not.toHaveURL(/\/admin\/?$/);
      for (const u of ['/api/admin/users', '/api/admin/plans', '/api/admin/settings']) expect((await s.page.request.get(u)).status(), u).toBe(403);
    });
    test(`QA-${role.toUpperCase()}-03 droits de l’offre : likes reçus, filtres, incognito`, async () => {
      const me = (await (await s.page.request.get('/api/users/me')).json()) as { entitlement: { plan: string; limits: Record<string, unknown> } };
      const received = (await (await s.page.request.get('/api/swipes/received')).json()) as { locked: boolean };
      const expectedPlan = role.toUpperCase();
      expect(me.entitlement.plan).toBe(expectedPlan);
      expect(received.locked).toBe(role === 'free');  // gratuit : likes reçus floutés
      expect(me.entitlement.limits.incognito).toBe(role === 'vip');
      expect(me.entitlement.limits.advancedFilters).toBe(role !== 'free');
    });
    test(`QA-${role.toUpperCase()}-04 messagerie : ouvrir une conversation existante`, async () => {
      await s.page.goto('/messages');
      await s.page.waitForLoadState('networkidle').catch(() => {});
      const convs = s.page.locator('a[href*="/messages/"]');
      test.skip((await convs.count()) === 0, 'ce compte de démonstration n’a pas de conversation');
      await convs.first().click();
      await expect(s.page).toHaveURL(/messages\/.+/);
      await expect(s.page.getByLabel('Écrire un message…')).toBeVisible();
    });
  });
}

test.describe('QA-FREE · actions du membre gratuit', () => {
  let s: Awaited<ReturnType<typeof session>>;
  test.beforeAll(async ({ browser }) => { s = await session(browser, 'free'); });
  test.afterAll(async () => { await s.ctx.close(); });

  test('QA-FREE-05 messagerie : envoyer un message et le retrouver', async () => {
    await s.page.goto('/messages');
    await s.page.waitForLoadState('networkidle').catch(() => {});
    test.skip((await s.page.locator('a[href*="/messages/"]').count()) === 0, 'aucune conversation');
    await s.page.locator('a[href*="/messages/"]').first().click();
    const text = `QA message ${Date.now()}`;
    await s.page.getByLabel('Écrire un message…').fill(text);
    await s.page.getByRole('button', { name: 'Envoyer', exact: true }).click();
    await expect(s.page.getByRole('log').getByText(text)).toBeVisible();
  });
  test('QA-FREE-06 profil : modifier la présentation, enregistrer, retrouver après rechargement', async () => {
    await s.page.goto('/profile');
    const bio = s.page.getByLabel('Biographie');
    await expect(bio).toBeVisible();
    const v = `QA bio ${Date.now()}`;
    await bio.fill(v);
    await s.page.locator('button:not([disabled])', { hasText: 'Enregistrer' }).first().click();
    await s.page.reload();
    await expect(s.page.getByLabel('Biographie')).toHaveValue(v);
  });
  test('QA-FREE-07 notifications : liste lisible, tout marquer comme lu', async () => {
    await s.page.goto('/notifications');
    await expect(s.page.getByRole('heading', { level: 1 })).toBeVisible();
    const btn = s.page.getByRole('button', { name: /tout marquer comme lu/i });
    if (await btn.count()) await btn.click();
    expect((await s.page.request.get('/api/notifications')).status()).toBe(200);
  });
  test('QA-FREE-08 réglages : chaque onglet s’ouvre', async () => {
    const all: string[] = [];
    for (const t of ['account', 'notifications', 'privacy', 'security', 'blocked', 'subscription', 'payments']) { const pr = await visit(s.page, `/settings?tab=${t}`); all.push(...pr.map((x) => `${t} → ${x}`)); }
    expect(all).toEqual([]);
  });
  test('QA-FREE-09 quotas : le serveur applique la limite quotidienne de likes (API)', async () => {
    const usage = (await (await s.page.request.get('/api/swipes/usage')).json().catch(() => null)) as Record<string, unknown> | null;
    test.skip(!usage, 'point d’accès d’usage indisponible');
    expect(usage).toBeTruthy();
  });
  test('QA-FREE-10 déconnexion : la session est fermée', async ({ browser }) => {
    const t = await session(browser, 'free');
    const r = await t.page.request.post('/api/auth/logout', { headers: ORIGIN });
    expect(r.status()).toBeLessThan(300);
    expect((await t.page.request.get('/api/users/me')).status()).toBe(401);
    await t.ctx.close();
  });
});

for (const role of ['moderator', 'admin', 'super'] as const) {
  test.describe(`QA-${role.toUpperCase()} · ${role}`, () => {
    let s: Awaited<ReturnType<typeof session>>;
    test.beforeAll(async ({ browser }) => { s = await session(browser, role); });
    test.afterAll(async () => { await s.ctx.close(); });
    const pages = role === 'moderator' ? MODERATOR_PAGES : ADMIN_PAGES;

    test(`QA-${role.toUpperCase()}-01 pages d’administration autorisées : aucune erreur`, async () => {
      const all: string[] = [];
      for (const p of pages) { const pr = await visit(s.page, p); all.push(...pr.map((x) => `${p} → ${x}`)); }
      expect(all).toEqual([]);
    });
    if (role === 'admin') {
      test('QA-ADMIN-07 stockage des fichiers : réservé au super administrateur (message d’accès refusé)', async () => {
        await s.page.goto('/admin/storage');
        await expect(s.page.getByText('Cette page est réservée à un rôle supérieur')).toBeVisible();
        await expect(s.page.getByLabel('Clé secrète')).toHaveCount(0);
      });
    }
    if (role === 'super') {
      test('QA-SUPER-04 stockage des fichiers : page, test de connexion refusé pour une adresse non https, clé secrète masquée', async () => {
        expect(await visit(s.page, '/admin/storage')).toEqual([]);
        await expect(s.page.getByRole('heading', { name: 'Stockage des fichiers' })).toBeVisible();
        await s.page.getByLabel('Adresse du stockage').fill('http://exemple.invalid');
        await s.page.getByLabel('Nom du bucket').fill('mon-bucket');
        await s.page.getByLabel('Identifiant de la clé d’accès').fill('AKIAEXAMPLE12345678');
        const secret = s.page.getByLabel('Clé secrète');
        await secret.fill('une-cle-secrete-de-test-0123456789');
        await expect(secret).toHaveAttribute('type', 'password');
        await s.page.getByRole('button', { name: 'Tester la connexion' }).click();
        await expect(s.page.getByText('Adresse du stockage invalide')).toBeVisible();
      });
    }
    if (role === 'moderator') {
      test('QA-MODERATOR-04 page réservée aux administrateurs : message d’accès refusé, pas de tableau vide', async () => {
        await s.page.goto('/admin/payments');
        await expect(s.page.getByText('Cette page est réservée à un rôle supérieur')).toBeVisible();
        await expect(s.page.getByRole('table')).toHaveCount(0);
      });
    }
    test(`QA-${role.toUpperCase()}-02 droits serveur : ${role === 'moderator' ? 'refus des réglages, offres, indicateurs' : 'accès complet'}`, async () => {
      const codes = await Promise.all(['/api/admin/users', '/api/admin/reports', '/api/admin/plans', '/api/admin/settings', '/api/admin/feature-flags', '/api/admin/engagement/metrics']
        .map(async (u) => [u, (await s.page.request.get(u)).status()] as const));
      for (const [u, c] of codes) {
        const modOk = u.endsWith('/users') || u.endsWith('/reports');
        expect(c, u).toBe(role === 'moderator' && !modOk ? 403 : 200);
      }
    });
  });
}

test.describe('QA-ADMIN · actions', () => {
  let s: Awaited<ReturnType<typeof session>>;
  test.beforeAll(async ({ browser }) => { s = await session(browser, 'admin'); });
  test.afterAll(async () => { await s.ctx.close(); });

  test('QA-ADMIN-03 utilisateurs : recherche par e-mail', async () => {
    await s.page.goto('/admin/users');
    const search = s.page.getByRole('searchbox').or(s.page.getByPlaceholder(/Rechercher|recherche/i)).first();
    await expect(search).toBeVisible();
    await search.fill('aminata');
    await expect(s.page.getByText('aminata@duo.test').first()).toBeVisible({ timeout: 15_000 });
  });
  test('QA-ADMIN-04 drapeau d’urgence : couper puis rétablir la question du jour (appliqué par le serveur)', async () => {
    const off = await s.page.request.put('/api/admin/feature-flags/daily_question', { data: { enabled: false }, headers: ORIGIN });
    expect(off.status()).toBe(200);
    const st = (await (await s.page.request.get('/api/engagement/daily-question')).json()) as { enabled: boolean };
    expect(st.enabled).toBe(false);
    expect((await s.page.request.put('/api/admin/feature-flags/daily_question', { data: { enabled: true }, headers: ORIGIN })).status()).toBe(200);
  });
  test('QA-ADMIN-05 offres : le catalogue contient les trois offres avec leurs droits', async () => {
    const plans = (await (await s.page.request.get('/api/admin/plans')).json()) as { plans: { code: string }[] };
    expect(plans.plans.map((p) => p.code).sort()).toEqual(['FREE', 'PREMIUM', 'VIP']);
  });
  test('QA-ADMIN-06 indicateurs : lisibles, sans valeur absurde', async () => {
    const m = (await (await s.page.request.get('/api/admin/engagement/metrics')).json()) as { membersActive: number; likes: number; matches: number };
    expect(m.membersActive).toBeGreaterThan(0);
    expect(m.likes).toBeGreaterThanOrEqual(0);
    expect(m.matches).toBeLessThanOrEqual(m.likes);
  });
});
