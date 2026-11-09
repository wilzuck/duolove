import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { completeOnboarding, newMember, persona, signUp, uid } from './helpers';

// Phase 4 : fidélisation éthique — mode pause, période de repos, messages regroupés, conseils de profil, contrôle admin.
const DB = process.env.E2E_DATABASE_URL ?? 'postgresql://admin@localhost:5432/duomatch_test'; // CI : base de GitHub (utilisateur postgres avec mot de passe)
const sql = (q: string) => execFileSync('psql', [DB, '-Atc', q], { encoding: 'utf8' }).trim();
const ORIGIN = { Origin: 'http://localhost:3000' };
const axeOf = async (page: Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map((v) => `${v.id} (${v.nodes.length}) ${v.help}`);

test.describe.serial('Rythme et bien-être', () => {
  const city = `Ville${uid()}`;
  const awa = persona('Awa', 'Femme', city);
  const yao = persona('Yao', 'Homme', city);
  const boss = persona('Admin', 'Homme', `Ville${uid()}`);
  let a: Awaited<ReturnType<typeof newMember>>;
  let y: Awaited<ReturnType<typeof newMember>>;
  let b: Awaited<ReturnType<typeof newMember>>;
  let yaoId = '';
  let conv = '';
  const feedIds = async (p: Page) => ((await (await p.request.get('/api/discovery?limit=30')).json()) as { items: { id: string }[] }).items.map((i) => i.id);

  test.beforeAll(async ({ browser }) => { a = await newMember(browser); y = await newMember(browser); b = await newMember(browser); });
  test.afterAll(async () => { sql(`delete from "FeatureFlag"`); sql(`delete from "SystemSetting" where key like 'pause.%' or key like 'notifications.%'`); await a.ctx.close(); await y.ctx.close(); await b.ctx.close(); });

  test('préparation : deux membres compatibles', async ({ request }) => {
    for (const [m, p] of [[a, awa], [y, yao]] as const) { await signUp(m.page, request, p); await completeOnboarding(m.page, p); }
    yaoId = ((await (await y.page.request.get('/api/users/me')).json()) as { id: string }).id;
    expect(await feedIds(a.page)).toContain(yaoId);
  });

  test('conseils de profil : concrets, bienveillants, avec un lien vers la rubrique', async () => {
    const { page } = y;
    await page.goto('/profile');
    const card = page.locator('h2', { hasText: 'Pour votre profil' }).locator('xpath=ancestor::*[contains(@class,"rounded")][1]');
    await expect(card).toBeVisible();
    await expect(card.getByText('Rien d’obligatoire.')).toBeVisible();
    await expect(card.getByText(/Ajoutez des photos \(1 sur 3\)/)).toBeVisible();
    await card.getByRole('link', { name: 'Y aller' }).first().click();
    await expect(page).toHaveURL(/#photos$/);
    expect(await axeOf(page)).toEqual([]);
  });

  test('période de repos et rappels : réglables, sécurité toujours envoyée', async () => {
    const { page } = y;
    await page.goto('/settings?tab=notifications');
    await expect(page.getByRole('heading', { name: 'Votre rythme', level: 2 })).toBeVisible();
    await expect(page.getByText(/au plus 5 e-mails par jour/)).toBeVisible();
    await expect(page.getByText(/Les alertes de sécurité et d’abonnement restent toujours envoyées/)).toBeVisible();
    await page.getByLabel('De', { exact: true }).fill('22:00');
    await page.getByLabel('À', { exact: true }).fill('07:30');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Période de repos enregistrée.')).toBeVisible();
    expect(sql(`select "quietStart" || '-' || "quietEnd" from "NotificationPreference" where "userId" = '${yaoId}'`)).toBe('1320-450');
    await page.getByRole('button', { name: 'Désactiver' }).click();
    await expect(page.getByText('Aucune période de repos')).toBeVisible();
    const reminders = page.getByRole('switch', { name: 'Rappels de rendez-vous' });
    await expect(reminders).toBeChecked();
    await reminders.click();
    await expect(reminders).not.toBeChecked();
    await reminders.click();
    expect(await axeOf(page)).toEqual([]);
  });

  test('mode pause : invisible des autres, sans likes, bannière et reprise en un geste', async () => {
    const { page } = y;
    await page.goto('/settings?tab=notifications');
    await page.getByLabel('Durée de la pause').selectOption('7');
    await page.getByRole('button', { name: 'Mettre en pause' }).click();
    await expect(page.getByText('Pause activée. Prenez soin de vous.')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Mode pause actif' })).toBeVisible(); // bannière
    expect(await feedIds(a.page)).not.toContain(yaoId); // invisible des autres
    await page.goto('/discover');
    await expect(page.getByRole('heading', { name: 'Vous êtes en pause' })).toBeVisible();
    const refused = await page.request.post('/api/swipes', { data: { targetId: 'inconnu', action: 'LIKE' }, headers: ORIGIN });
    expect(refused.status()).toBe(409);
    await page.goto('/daily');
    await expect(page.getByRole('heading', { name: 'Vous êtes en pause' })).toBeVisible();
    await page.getByRole('status').filter({ hasText: 'Mode pause actif' }).getByRole('button', { name: 'Reprendre' }).click();
    await expect(page.getByText('Bon retour ! Votre profil est de nouveau visible.')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Mode pause actif' })).toHaveCount(0);
    await expect.poll(async () => feedIds(a.page)).toContain(yaoId);
  });

  test('messages regroupés : trois messages, une seule notification', async () => {
    const awaId = ((await (await a.page.request.get('/api/users/me')).json()) as { id: string }).id;
    await a.page.request.post('/api/swipes', { data: { targetId: yaoId, action: 'LIKE' }, headers: ORIGIN });
    const r = await y.page.request.post('/api/swipes', { data: { targetId: awaId, action: 'LIKE' }, headers: ORIGIN });
    conv = ((await r.json()) as { match: { conversationId: string } }).match.conversationId;
    for (const body of ['Bonjour Yao', 'Comment vas-tu ?', 'Belle journée, non ?']) {
      expect((await a.page.request.post(`/api/conversations/${conv}/messages`, { data: { body }, headers: ORIGIN })).status()).toBe(201);
    }
    await y.page.goto('/notifications');
    await expect(y.page.getByText('3 nouveaux messages.')).toBeVisible();
    await expect(y.page.getByText('Vous avez reçu un nouveau message.')).toHaveCount(0);
  });

  test('admin : durée de pause et plafond d’e-mails réglables ; couper la pause empêche d’en démarrer mais pas de reprendre', async ({ request }) => {
    const { page } = b;
    await signUp(page, request, boss);
    sql(`update "User" set role='ADMIN' where email='${boss.email}'`);
    await page.goto('/admin/engagement');
    await expect(page.getByLabel('Durée maximale d’une pause (jours)')).toHaveValue('90');
    await expect(page.getByLabel('E-mails non essentiels par membre et par jour')).toHaveValue('5');
    await expect(page.getByLabel('Validité du code de confirmation (minutes)')).toHaveValue('15');
    await expect(page.getByLabel('Suppression des comptes non confirmés après (heures)')).toHaveValue('72');
    await page.getByLabel('Durée maximale d’une pause (jours)').fill('14');
    await page.getByRole('button', { name: 'Enregistrer les réglages' }).click();
    await expect(page.getByText('Réglages enregistrés.')).toBeVisible();
    await page.getByRole('tab', { name: 'Indicateurs' }).click();
    await expect(page.getByText('Membres en pause')).toBeVisible();
    await page.goto('/admin/flags');
    await page.getByRole('switch', { name: 'Mode pause' }).click();
    await expect(page.getByText('Enregistré : Mode pause est coupé.')).toBeVisible();
    await a.page.goto('/settings?tab=notifications');
    await expect(a.page.getByText('Le mode pause est momentanément indisponible.')).toBeVisible();
    await expect(a.page.getByRole('button', { name: 'Mettre en pause' })).toHaveCount(0);
    expect((await a.page.request.delete('/api/engagement/me/pause', { headers: ORIGIN })).status()).toBe(200); // reprendre reste toujours possible
  });
});
