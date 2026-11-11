import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Connexion et inscription : accueil chaleureux, saisie du mot de passe facilitée, accessibilité, mobile ; quota de découvertes par formule sur la page Tarifs.
const axeOf = async (page: Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map((v) => `${v.id} (${v.nodes.length}) ${v.help}`);

test('connexion : carte centrée sobre, lien « mot de passe oublié » centré, pied de page, accessible', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { level: 1, name: 'Bon retour !' })).toBeVisible();
  await expect(page.getByText('Connectez-vous pour retrouver vos duos.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0); // pas de panneau d'accueil : la page reste sobre
  await expect(page.getByLabel('Mot de passe', { exact: true })).toHaveAttribute('type', 'password');
  await expect(page.getByRole('button', { name: 'Afficher la saisie' })).toHaveCount(0);
  const forgot = await page.getByRole('link', { name: 'Mot de passe oublié ?' }).evaluate((el) => getComputedStyle(el.parentElement!).textAlign);
  expect(forgot).toBe('center');
  await expect(page.getByRole('navigation', { name: 'Liens du site' })).toBeVisible();
  expect(await axeOf(page)).toEqual([]);
  await page.goto('/en/login');
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome back!' })).toBeVisible();
});

test('inscription : sous-titre court, règles du mot de passe en direct, règles de la communauté, accessible', async ({ page }) => {
  await page.goto('/register');
  await expect(page.getByRole('heading', { level: 1, name: 'Créer mon compte' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0); // carte centrée sobre, comme la connexion
  const pw = page.getByLabel('Mot de passe', { exact: true });
  await pw.fill('abc');
  const rules = page.getByRole('list').filter({ hasText: '10 caractères ou plus' });
  await expect(rules.getByText('Une minuscule — validé')).toBeVisible();
  await expect(rules.getByText('Une majuscule — à compléter')).toBeVisible();
  await expect(rules.getByText('10 caractères ou plus — à compléter')).toBeVisible();
  await pw.fill('Abcdefghij1');
  for (const r of ['10 caractères ou plus', 'Une majuscule', 'Une minuscule', 'Un chiffre']) await expect(rules.getByText(`${r} — validé`)).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'respecte toutes les règles' })).toBeAttached();
  const terms = page.getByRole('checkbox');
  await expect(terms).toHaveCount(1); // une seule case : l'acceptation des conditions
  await expect(page.getByRole('link', { name: 'règles de la communauté', exact: true })).toHaveAttribute('href', /legal\/community/);
  await expect(page.getByRole('link', { name: 'conditions d’utilisation', exact: true })).toHaveAttribute('href', /legal\/terms/);
  await expect(page.getByText(/Votre adresse e-mail n’apparaît jamais sur votre profil/)).toBeVisible();
  expect(await axeOf(page)).toEqual([]);
  await page.goto('/en/register');
  await expect(page.getByText('Free, in under two minutes. No credit card.')).toBeVisible();
});

test('mobile : pas de débordement, formulaire complet', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const p of ['/login', '/register', '/en/login', '/en/register']) {
    await page.goto(p);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), p).toBeLessThanOrEqual(0);
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0); // panneau d'accueil réservé aux grands écrans
  }
  await page.goto('/register');
  await expect(page.getByRole('button', { name: 'Créer mon compte' })).toBeVisible();
  expect(await axeOf(page)).toEqual([]);
});

test('page Tarifs : le nombre de découvertes du jour est un avantage de formule', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page.getByText('5 découvertes du jour')).toBeVisible();
  await expect(page.getByText('10 découvertes du jour').first()).toBeVisible();
});

test('inscription : le calendrier de naissance reste toujours dans la fenêtre, même sur un écran bas', async ({ page }) => {
  for (const size of [{ width: 1280, height: 640 }, { width: 375, height: 667 }]) {
    await page.setViewportSize(size);
    await page.goto('/register');
    await page.getByLabel('Mot de passe', { exact: true }).fill('Abcdefghij1'); // la liste des règles allonge le formulaire
    await page.getByRole('button', { name: 'Date de naissance' }).click();
    const box = await page.getByRole('dialog').boundingBox();
    expect(box, `${size.width}x${size.height}`).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);
  }
});
