import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Pages d'information : Comment ça marche, Centre d'aide (recherche), Contact, Conditions d'utilisation.
const axeOf = async (page: Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map((v) => `${v.id} (${v.nodes.length}) ${v.help}`);
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('Comment ça marche : huit étapes, ce qui change, tous âges, tarifs, accessible', async ({ page }) => {
  await page.goto('/how-it-works');
  await expect(page.getByRole('heading', { level: 1, name: 'Comment fonctionne DuoMatch' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Votre parcours en huit étapes' }).getByRole('listitem')).toHaveCount(8);
  await expect(page.getByRole('heading', { level: 3, name: 'Passez à la rencontre, en sécurité' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ce qui change ici' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'L’amour n’a pas d’âge' })).toBeVisible();
  await expect(page.getByText(/Le blocage, le signalement et la sécurité restent gratuits/)).toBeVisible();
  await page.getByRole('link', { name: 'Les règles de la communauté' }).click();
  await expect(page).toHaveURL(/legal\/community/);
  await page.goto('/how-it-works');
  expect(await axeOf(page)).toEqual([]);
  await page.goto('/en/how-it-works');
  await expect(page.getByRole('heading', { level: 1, name: 'How DuoMatch works' })).toBeVisible();
});

test('Centre d’aide : recherche instantanée, thèmes, aucun résultat, accessible', async ({ page }) => {
  await page.goto('/help');
  await expect(page.getByRole('heading', { level: 1, name: 'Comment pouvons-nous vous aider ?' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Parcourir par thème' }).getByRole('link')).toHaveCount(6);
  expect(await axeOf(page)).toEqual([]);
  const search = page.getByRole('searchbox', { name: 'Rechercher dans l’aide' });
  await search.fill('REMBOURSE'); // insensible à la casse
  await expect(page.getByRole('status')).toHaveText(/1 résultat/);
  await expect(page.getByText('Puis-je être remboursé(e) ?')).toBeVisible();
  await expect(page.getByText('Qui peut s’inscrire ?')).toHaveCount(0);
  await search.fill('rendez vous'); // espaces ≠ tiret : repli propre
  await search.fill('verifie'); // insensible aux accents (« vérifié »)
  await expect(page.getByText('Comment obtenir le badge vérifié ?')).toBeVisible();
  await search.fill('zzzzqq');
  await expect(page.getByText(/Aucune réponse ne correspond à « zzzzqq »/)).toBeVisible();
  await page.getByRole('link', { name: 'Nous contacter' }).first().click();
  await expect(page).toHaveURL(/contact/);
  await page.goto('/help');
  await page.getByRole('button', { name: 'Effacer la recherche' }).count();
  await page.getByRole('navigation', { name: 'Parcourir par thème' }).getByRole('link', { name: 'Sécurité' }).click();
  await expect(page).toHaveURL(/#h-safety$/);
  await page.goto('/en/help');
  await expect(page.getByRole('heading', { level: 1, name: 'How can we help you?' })).toBeVisible();
});

test('Contact : sujets pré-remplis, conseils, urgence sécurité, accessible', async ({ page }) => {
  await page.goto('/contact');
  await expect(page.getByRole('heading', { level: 1, name: 'Nous contacter' })).toBeVisible();
  const topics = page.getByRole('region', { name: 'De quoi s’agit-il ?' }).getByRole('link');
  await expect(topics).toHaveCount(6);
  await expect(topics.nth(1)).toHaveAttribute('href', /^mailto:.+\?subject=DuoMatch%20%E2%80%94%20Paiement%20ou%20remboursement$/);
  await expect(page.getByText('Ne nous envoyez jamais votre mot de passe')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Un comportement dangereux ou une arnaque ?' })).toBeVisible();
  await expect(page.getByText(/En danger immédiat, contactez d’abord les secours/)).toBeVisible();
  expect(await axeOf(page)).toEqual([]);
});

test('Conditions d’utilisation : 15 rubriques, offres conformes au produit, bandeau juridique, accessible', async ({ page }) => {
  await page.goto('/legal/terms');
  await expect(page.getByRole('heading', { level: 1, name: 'Conditions générales d’utilisation' })).toBeVisible();
  await expect(page.getByText(/à faire relire et valider par un juriste/)).toBeVisible();
  await expect(page.locator('main').getByRole('heading', { level: 2 })).toHaveCount(16); // 15 rubriques + « À lire aussi »
  await expect(page.getByText(/Les formules existent pour 1, 3, 6 ou 12 mois/)).toBeVisible();
  await expect(page.getByText(/ne se renouvelle pas automatiquement/).first()).toBeVisible();
  expect(await page.locator('main').innerText()).not.toMatch(/mensuelles?, sans engagement/);
  await page.getByRole('navigation', { name: 'Sommaire' }).getByRole('link', { name: 'Modération et sanctions' }).click();
  await expect(page).toHaveURL(/#moderation$/);
  await expect(page.getByRole('navigation', { name: 'À lire aussi' }).getByRole('link', { name: 'Règles de la communauté' })).toHaveAttribute('href', /legal\/community/);
  expect(await axeOf(page)).toEqual([]);
  await page.goto('/en/legal/terms');
  await expect(page.getByRole('heading', { level: 1, name: 'Terms of use' })).toBeVisible();
});

test('mobile : aucune de ces pages ne déborde horizontalement', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const p of ['/how-it-works', '/help', '/contact', '/legal/terms', '/legal/community', '/en/how-it-works', '/en/help', '/en/contact', '/en/legal/terms']) {
    await page.goto(p);
    expect(await overflow(page), p).toBeLessThanOrEqual(0);
  }
});
