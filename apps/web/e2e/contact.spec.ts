import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newMember, persona, signUp, uid } from './helpers';

// Boîte de contact : un visiteur écrit depuis la page publique, l'administrateur lit, traite puis archive le message.
const DB = 'postgresql://admin@localhost:5432/duomatch_test';
const sql = (q: string) => execFileSync('psql', [DB, '-Atc', q], { encoding: 'utf8' }).trim();

test.describe.serial('Boîte de contact', () => {
  const tag = uid();
  const boss = persona('Admin', 'Homme', `Ville${uid()}`);
  let ctx: Awaited<ReturnType<typeof newMember>>;

  test.beforeAll(async ({ browser }) => { ctx = await newMember(browser); });
  test.afterAll(async () => { await ctx.ctx.close(); });

  test('le formulaire valide les champs puis enregistre le message', async ({ page }) => {
    await page.goto('/contact');
    await page.getByRole('button', { name: 'Envoyer le message' }).click();
    await expect(page.getByText('Indiquez votre nom.')).toBeVisible();
    await expect(page.getByText('Indiquez une adresse e-mail valide.')).toBeVisible();
    await expect(page.getByText('Écrivez au moins 10 caractères.')).toBeVisible();
    await page.getByLabel('Votre nom').fill(`Awa ${tag}`);
    await page.getByLabel('Votre e-mail').fill(`awa-${tag}@example.com`);
    await page.getByLabel('Sujet').selectOption('billing');
    await page.getByLabel('Votre message').fill(`Mon paiement ${tag} n’a pas été pris en compte.`);
    await page.getByRole('button', { name: 'Envoyer le message' }).click();
    await expect(page.getByRole('status')).toContainText('Message envoyé');
    expect(sql(`select count(*) from "ContactMessage" where email='awa-${tag}@example.com' and status='NEW'`)).toBe('1');
  });

  test('page Contact sans violation d’accessibilité', async ({ page }) => {
    await page.goto('/contact');
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });

  test('l’administrateur lit, répond puis archive', async ({ request }) => {
    const { page } = ctx;
    await signUp(page, request, boss);
    sql(`update "User" set role='ADMIN' where email='${boss.email}'`);
    await page.goto('/admin/contact');
    const card = page.getByRole('row').filter({ hasText: `Mon paiement ${tag}` });
    await expect(card).toBeVisible();
    await expect(card).toContainText(`awa-${tag}@example.com`);
    await card.getByRole('button', { name: 'Actions' }).click();
    await page.getByRole('menuitem', { name: 'Marquer comme lu' }).click();
    await expect(card).toBeHidden();
    await page.getByRole('tab', { name: /Lus/ }).click();
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Actions' }).click();
    await page.getByRole('menuitem', { name: 'Répondu' }).click();
    await page.getByRole('tab', { name: /Répondus/ }).click();
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Actions' }).click();
    await page.getByRole('menuitem', { name: 'Archiver' }).click();
    expect(sql(`select status from "ContactMessage" where email='awa-${tag}@example.com'`)).toBe('ARCHIVED');
  });

  test('un membre non administrateur n’accède pas à la boîte', async ({ browser, request }) => {
    const m = await newMember(browser);
    await signUp(m.page, request, persona('Membre', 'Femme', `Ville${uid()}`));
    const r = await m.page.request.get('/api/admin/contact-messages');
    expect(r.status()).toBe(403);
    await m.ctx.close();
  });
});
