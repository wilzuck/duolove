import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { completeOnboarding, newMember, persona, signUp, uid } from './helpers';

// Parrainage + codes promo : lien d'invitation → récompense, création d'un code par un admin, remise dans Charme+, jetons offerts.
const DB = 'postgresql://admin@localhost:5432/duomatch_test';
const sql = (q: string) => execFileSync('psql', [DB, '-Atc', q], { encoding: 'utf8' }).trim();
const axeOf = async (page: import('@playwright/test').Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map((v) => `${v.id} (${v.nodes.length}) ${v.help} :: ${v.nodes.slice(0, 4).map((n) => `${n.target.join(' ')} ${(n.any[0]?.data as { fgColor?: string; bgColor?: string; contrastRatio?: number } | undefined)?.contrastRatio} ${(n.any[0]?.data as { fgColor?: string } | undefined)?.fgColor}`).join(' | ')}`);

test.describe.serial('Parrainage et codes promo', () => {
  const city = `Ville${uid()}`;
  const awa = persona('Awa', 'Femme', city);
  const yao = persona('Yao', 'Homme', city);
  const boss = persona('Admin', 'Homme', city);
  const PCT = `E2E${uid().toUpperCase()}`;
  const TOK = `TOK${uid().toUpperCase()}`;
  let awaPage: Awaited<ReturnType<typeof newMember>>;
  let yaoPage: Awaited<ReturnType<typeof newMember>>;
  let bossPage: Awaited<ReturnType<typeof newMember>>;
  let code = '';

  test.beforeAll(async ({ browser }) => { awaPage = await newMember(browser); yaoPage = await newMember(browser); bossPage = await newMember(browser); });
  test.afterAll(async () => { await awaPage.ctx.close(); await yaoPage.ctx.close(); await bossPage.ctx.close(); });

  test('Awa obtient son code de parrainage (page accessible)', async ({ request }) => {
    const { page } = awaPage;
    await signUp(page, request, awa);
    await completeOnboarding(page, awa);
    await page.goto('/referral');
    await expect(page.getByRole('heading', { name: 'Parrainage' })).toBeVisible();
    code = (await page.getByTestId('referral-code').innerText()).trim();
    expect(code).toMatch(/^[A-Z2-9]{8}$/);
    await expect(page.getByText(/Vous recevez 5 jetons et lui 2 jetons/)).toBeVisible();
    expect(await axeOf(page)).toEqual([]);
  });

  test('Yao s’inscrit avec le lien d’invitation : code pré-rempli, puis récompense à 100 %', async ({ request }) => {
    const { page } = yaoPage;
    await signUp(page, request, yao, code);
    await completeOnboarding(page, yao);
    // Qualification : profil à 100 % + e-mail vérifié → Match lit l'état et verse la récompense (idempotent).
    const pct = sql(`select p.completeness from "Profile" p join "User" u on u.id=p."userId" where u.email='${yao.email}'`);
    if (Number(pct) < 100) sql(`update "Profile" set completeness=100 from "User" u where u.id="Profile"."userId" and u.email='${yao.email}'`);
    await page.goto('/match');
    await expect(page.getByRole('heading', { name: 'Match en direct' })).toBeVisible();
    const r = await page.request.get('/api/credits');
    expect(((await r.json()) as { balances: { MATCH_TOKEN: number } }).balances.MATCH_TOKEN).toBe(2 + 3); // parrainage + cadeau de profil
  });

  test('Awa voit sa récompense', async () => {
    const { page } = awaPage;
    await page.goto('/referral');
    const card = (label: string) => page.locator('section[aria-label="Parrainage"] > div', { hasText: label });
    await expect(card('Récompensés')).toContainText('1');
    await expect(card('Jetons gagnés')).toContainText('5');
    await page.goto('/notifications');
    await expect(page.getByText(/Un ami parrainé a complété son profil/)).toBeVisible();
  });

  test('un administrateur crée un code de remise et un code de jetons (accessible)', async ({ request }) => {
    const { page } = bossPage;
    await signUp(page, request, boss);
    sql(`update "User" set role='ADMIN' where email='${boss.email}'`);
    await page.goto('/admin/promos');
    await expect(page.getByRole('heading', { name: 'Codes promo', level: 2 })).toBeVisible();
    await page.getByRole('button', { name: 'Nouveau code' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nouveau code' });
    await dialog.getByLabel('Code', { exact: true }).fill(PCT);
    await dialog.getByLabel('Remise (1 à 90 %)').fill('20');
    await dialog.getByRole('button', { name: 'Créer le code' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('cell', { name: PCT })).toBeVisible();
    await page.getByRole('button', { name: 'Nouveau code' }).click();
    await dialog.getByLabel('Code', { exact: true }).fill(TOK);
    await dialog.getByLabel('Type').selectOption('TOKENS');
    await dialog.getByLabel('Jetons offerts', { exact: true }).fill('4');
    await dialog.getByRole('button', { name: 'Créer le code' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('cell', { name: TOK })).toBeVisible();
    expect(await axeOf(page)).toEqual([]);
  });

  test('Awa applique la remise dans Charme+, puis récupère les jetons offerts', async () => {
    const { page } = awaPage;
    await page.goto('/shop');
    // Trois familles d'achat séparées : jetons Match, boosts, Super Likes.
    const tokens = page.getByRole('region', { name: 'Jetons Match' });
    const boosts = page.getByRole('region', { name: 'Boosts de visibilité' });
    await expect(tokens.getByText('Pack 5 tokens Match')).toBeVisible();
    await expect(tokens.getByText('Boost 30 minutes')).toHaveCount(0);
    await expect(boosts.getByText('Boost 30 minutes')).toBeVisible();
    await expect(boosts.getByText(/Pack \d+ tokens Match/)).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Super Likes' }).getByText('Pack 5 Super Likes')).toBeVisible();
    await page.getByLabel('Votre code').fill(PCT);
    await page.getByRole('button', { name: 'Appliquer' }).click();
    await expect(page.getByText(`${PCT} : −20 % sur votre prochain paiement.`)).toBeVisible();
    await expect(page.getByRole('button', { name: /800/ }).first()).toBeVisible(); // 1 000 FCFA − 20 %
    expect(await axeOf(page)).toEqual([]);
    // Code « jetons » : récupération unique.
    await page.getByLabel('Votre code').fill(TOK);
    await page.getByRole('button', { name: 'Appliquer' }).click();
    await expect(page.getByText(`${TOK} : 4 jetons Match offerts.`)).toBeVisible();
    const before = ((await (await page.request.get('/api/credits')).json()) as { balances: { MATCH_TOKEN: number } }).balances.MATCH_TOKEN;
    await page.getByRole('button', { name: 'Récupérer mes jetons' }).click();
    await expect(page.getByText('4 jetons ajoutés à votre solde.')).toBeVisible();
    const after = ((await (await page.request.get('/api/credits')).json()) as { balances: { MATCH_TOKEN: number } }).balances.MATCH_TOKEN;
    expect(after).toBe(before + 4);
    // Deuxième utilisation : refusée avec un message clair.
    await page.getByLabel('Votre code').fill(TOK);
    await page.getByRole('button', { name: 'Appliquer' }).click();
    await expect(page.getByText('Vous avez déjà utilisé ce code.')).toBeVisible();
  });
});
