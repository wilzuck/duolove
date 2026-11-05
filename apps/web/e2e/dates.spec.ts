import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { completeOnboarding, newMember, persona, signUp, uid, NOTICE_SEEN } from './helpers';

// Phase 3 : mode rendez-vous — proposition, réponse, rappel, partage volontaire (sans compte), report, terminaison, retour, contrôle admin.
const DB = 'postgresql://admin@localhost:5432/duomatch_test';
const sql = (q: string) => execFileSync('psql', [DB, '-Atc', q], { encoding: 'utf8' }).trim();
const ORIGIN = { Origin: 'http://localhost:3000' };
const axeOf = async (page: Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map((v) => `${v.id} (${v.nodes.length}) ${v.help}`);

test.describe.serial('Mode rendez-vous', () => {
  const city = `Ville${uid()}`;
  const awa = persona('Awa', 'Femme', city);
  const yao = persona('Yao', 'Homme', city);
  const boss = persona('Admin', 'Homme', `Ville${uid()}`);
  let a: Awaited<ReturnType<typeof newMember>>;
  let y: Awaited<ReturnType<typeof newMember>>;
  let b: Awaited<ReturnType<typeof newMember>>;
  let conv = '';
  let shareUrl = '';

  const panel = (p: Page) => p.getByRole('dialog', { name: /Rendez-vous avec/ });
  const open = async (p: Page) => { await p.goto(`/messages/${conv}`); await p.getByRole('button', { name: 'Rendez-vous', exact: true }).click(); await expect(panel(p)).toBeVisible(); };

  test.beforeAll(async ({ browser }) => { a = await newMember(browser); y = await newMember(browser); b = await newMember(browser); });
  test.afterAll(async () => { sql(`delete from "FeatureFlag"`); sql(`delete from "SystemSetting" where key like 'dates.%'`); await a.ctx.close(); await y.ctx.close(); await b.ctx.close(); });

  test('préparation : deux membres, match réciproque', async ({ request }) => {
    for (const [m, p] of [[a, awa], [y, yao]] as const) { await signUp(m.page, request, p); await completeOnboarding(m.page, p); }
    const yaoId = ((await (await y.page.request.get('/api/users/me')).json()) as { id: string }).id;
    const awaId = ((await (await a.page.request.get('/api/users/me')).json()) as { id: string }).id;
    await a.page.request.post('/api/swipes', { data: { targetId: yaoId, action: 'LIKE' }, headers: ORIGIN });
    const r = await y.page.request.post('/api/swipes', { data: { targetId: awaId, action: 'LIKE' }, headers: ORIGIN });
    conv = ((await r.json()) as { match: { conversationId: string } }).match.conversationId;
  });

  test('Awa propose un rendez-vous dans un lieu public (conseils de sécurité visibles, accessible)', async () => {
    const { page } = a;
    await open(page);
    const d = panel(page);
    await expect(d.getByRole('heading', { name: 'Pour une rencontre sereine' })).toBeVisible();
    await expect(d.getByText(/Choisissez un lieu public/)).toBeVisible();
    await d.getByRole('button', { name: 'Proposer un rendez-vous' }).click();
    await d.getByLabel('Nom du lieu').fill('Café de la Paix, centre-ville');
    await d.getByLabel('Un mot (facultatif)').fill('Un café en terrasse ?');
    expect(await axeOf(page)).toEqual([]);
    await d.getByRole('button', { name: 'Envoyer la proposition' }).click();
    await expect(page.getByText('Proposition envoyée.')).toBeVisible();
    const card = d.getByRole('listitem').filter({ hasText: 'Café de la Paix' }).first();
    await expect(card.getByText('Proposé', { exact: true })).toBeVisible();
    await expect(card.getByText('En attente de la réponse de Yao.')).toBeVisible();
    await expect(card.getByText('Proposé par vous')).toBeVisible();
  });

  test('un lieu avec un numéro de téléphone est refusé', async () => {
    const { page } = a;
    const d = panel(page);
    await d.getByRole('button', { name: 'Proposer un rendez-vous' }).click();
    await d.getByLabel('Nom du lieu').fill('Chez moi 0612345678');
    await d.getByRole('button', { name: 'Envoyer la proposition' }).click();
    await expect(page.getByText('Indiquez le nom d’un lieu public, sans numéro ni coordonnées.')).toBeVisible();
    await d.getByRole('button', { name: 'Annuler', exact: true }).first().click();
  });

  test('Yao accepte, règle un rappel, puis partage avec un proche (lien lisible sans compte)', async ({ browser }) => {
    const { page } = y;
    await open(page);
    const d = panel(page);
    const card = d.getByRole('listitem').filter({ hasText: 'Café de la Paix' }).first();
    await expect(card.getByText('Proposé par Awa')).toBeVisible();
    await card.getByRole('button', { name: 'Accepter' }).click();
    await expect(card.getByText('Accepté', { exact: true })).toBeVisible();
    await card.getByLabel('Rappel').selectOption('60');
    await expect(page.getByText('Rendez-vous mis à jour.').first()).toBeVisible();
    await card.getByRole('button', { name: 'Partager avec un proche' }).click();
    await expect(card.getByText(/Envoyez-le vous-même à une personne de confiance/)).toBeVisible();
    shareUrl = await card.getByRole('textbox', { name: 'Copier le lien' }).inputValue();
    expect(shareUrl).toMatch(/\/share\/[A-Za-z0-9_-]{20,}$/);
    // La personne de confiance ouvre le lien SANS compte : seules les informations utiles apparaissent.
    const anon = await browser.newContext({ locale: 'fr-FR', storageState: NOTICE_SEEN });
    const ap = await anon.newPage();
    await ap.goto(shareUrl.replace(/^https?:\/\/[^/]+/, 'http://localhost:3000'));
    await expect(ap.getByRole('heading', { name: 'Un rendez-vous partagé avec vous' })).toBeVisible();
    await expect(ap.getByText('Café de la Paix, centre-ville')).toBeVisible();
    await expect(ap.getByText('Awa', { exact: true })).toBeVisible();
    const html = await ap.content();
    expect(html).not.toContain(awa.email);
    expect(html).not.toContain(yao.email);
    await expect(ap.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
    expect(await axeOf(ap)).toEqual([]);
    // Arrêter le partage rend le lien inutilisable immédiatement.
    await card.getByRole('button', { name: 'Arrêter le partage' }).click();
    await expect(card.getByRole('button', { name: 'Arrêter le partage' })).toHaveCount(0);
    await ap.reload();
    await expect(ap.getByRole('heading', { name: 'Ce lien n’est plus valable.' })).toBeVisible();
    await anon.close();
  });

  test('Awa propose un autre horaire : l’ancien est « Reporté », Yao accepte le nouveau', async () => {
    const { page } = a;
    await open(page);
    const d = panel(page);
    const card = d.getByRole('listitem').filter({ hasText: 'Café de la Paix' }).first();
    await card.getByRole('button', { name: 'Proposer un autre horaire' }).click();
    await d.getByLabel('Nom du lieu').fill('Parc de la Marina');
    await d.getByRole('button', { name: 'Envoyer la proposition' }).click();
    await expect(d.getByRole('listitem').filter({ hasText: 'Café de la Paix' }).getByText('Reporté', { exact: true })).toBeVisible();
    const { page: yp } = y;
    await open(yp);
    const nc = panel(yp).getByRole('listitem').filter({ hasText: 'Parc de la Marina' }).first();
    await nc.getByRole('button', { name: 'Accepter' }).click();
    await expect(nc.getByText('Accepté', { exact: true })).toBeVisible();
  });

  test('après le rendez-vous : « Nous nous sommes vus », puis retour facultatif et privé', async () => {
    sql(`update "DateProposal" set "startsAt" = now() - interval '3 hours', "endsAt" = now() - interval '1 hour' where status = 'ACCEPTED' and "conversationId" = '${conv}'`);
    const { page } = a;
    await open(page);
    const d = panel(page);
    const card = d.getByRole('listitem').filter({ hasText: 'Parc de la Marina' }).first();
    await card.getByRole('button', { name: 'Nous nous sommes vus' }).click();
    await expect(card.getByText('Terminé', { exact: true })).toBeVisible();
    await expect(card.getByText('Facultatif et privé : personne ne voit votre réponse.')).toBeVisible();
    await card.getByRole('button', { name: '4 sur 5' }).click();
    await expect(card.getByText('Merci pour votre retour.')).toBeVisible();
    // Le retour d'Awa n'est pas montré à Yao : il peut donner le sien.
    const { page: yp } = y;
    await open(yp);
    const yc = panel(yp).getByRole('listitem').filter({ hasText: 'Parc de la Marina' }).first();
    await expect(yc.getByText('Merci pour votre retour.')).toHaveCount(0);
    await expect(yc.getByRole('button', { name: '4 sur 5' })).toBeVisible();
  });

  test('pied de page : liens utiles sur les pages de connexion et dans l’espace membre', async () => {
    const p = await b.ctx.newPage();
    await p.goto('/login');
    const nav = p.getByRole('navigation', { name: 'Liens du site' });
    await expect(nav.getByRole('link', { name: 'À propos' })).toBeVisible();
    await expect(nav.getByRole('link', { name: /Conditions/ })).toBeVisible();
    await a.page.goto('/likes');
    await expect(a.page.getByRole('navigation', { name: 'Liens du site' }).getByRole('link', { name: 'Blog' })).toBeVisible();
    await p.close();
  });

  test('admin : réglages et indicateurs réels ; couper « Rendez-vous » bloque les nouvelles propositions sans piéger personne', async ({ request }) => {
    const { page } = b;
    await signUp(page, request, boss);
    sql(`update "User" set role='ADMIN' where email='${boss.email}'`);
    await page.goto('/admin/engagement');
    await expect(page.getByLabel('Préavis minimum d’un rendez-vous (heures)')).toHaveValue('2');
    await page.getByLabel('Rendez-vous en cours par conversation').fill('3');
    await page.getByRole('button', { name: 'Enregistrer les réglages' }).click();
    await expect(page.getByText('Réglages enregistrés.')).toBeVisible();
    await page.getByRole('tab', { name: 'Indicateurs' }).click();
    await expect(page.getByText('Rendez-vous proposés')).toBeVisible();
    await expect(page.getByText('Rendez-vous déclarés terminés')).toBeVisible();
    expect(sql(`select count(*) from "DateProposal" where status = 'COMPLETED'`)).not.toBe('0');
    await page.goto('/admin/flags');
    await page.getByRole('switch', { name: 'Rendez-vous', exact: true }).click();
    await expect(page.getByText('Enregistré : Rendez-vous est coupé.')).toBeVisible();
    await a.page.goto(`/messages/${conv}`);
    await expect(a.page.getByRole('textbox', { name: 'Écrire un message…' })).toBeVisible();
    await expect(a.page.getByRole('button', { name: 'Rendez-vous', exact: true })).toHaveCount(0);
    const refused = await a.page.request.post(`/api/conversations/${conv}/dates`, { data: { startsAt: new Date(Date.now() + 86400_000 * 2).toISOString(), endsAt: new Date(Date.now() + 86400_000 * 2 + 7200_000).toISOString(), placeKind: 'CAFE', placeName: 'Café test' }, headers: ORIGIN });
    expect(refused.status()).toBe(503);
  });
});
