import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Charte de la communauté : fond complet FR/EN, sommaire, accessibilité, mobile.
const axeOf = async (page: import('@playwright/test').Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map((v) => `${v.id} (${v.nodes.length}) ${v.help}`);

test('charte de la communauté (FR) : message bienveillant, 11 rubriques, sommaire, accessible', async ({ page }) => {
  await page.goto('/legal/community');
  await expect(page.getByRole('heading', { level: 1, name: 'Règles de la communauté' })).toBeVisible();
  await expect(page.getByText(/On peut rencontrer l’amour à tout âge/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'L’essentiel en cinq idées' })).toBeVisible();
  for (const h of ['L’amour n’a pas d’âge', 'Respect et bienveillance', 'Pas d’argent, pas d’arnaque', 'Se rencontrer en toute sécurité', 'Votre vie privée vous appartient', 'Signaler et bloquer, simplement', 'Si les règles ne sont pas respectées', 'Prenez soin de vous, à votre rythme']) {
    await expect(page.getByRole('heading', { level: 2, name: h })).toBeVisible();
  }
  await expect(page.locator('main').getByRole('heading', { level: 2 })).toHaveCount(13); // « essentiel » + 11 rubriques + appel final
  // Chaque point d'une liste est introduit par un titre (le sens ne repose pas sur la couleur seule).
  await expect(page.getByText('Ce qui n’a pas sa place').first()).toBeVisible();
  // Le sommaire mène à la bonne rubrique.
  await page.getByRole('navigation', { name: 'Sommaire' }).getByRole('link', { name: 'Signaler et bloquer, simplement' }).click();
  await expect(page).toHaveURL(/#signaler$/);
  await expect(page.locator('#signaler')).toBeInViewport();
  // Promesses vérifiables : pas de numéro de téléphone ni de délai inventé.
  const body = await page.locator('main').innerText();
  expect(body).not.toMatch(/sous \d+ ?(h|heures|jours)/i);
  await expect(page.getByRole('link', { name: 'Conditions d’utilisation' })).toHaveAttribute('href', /legal\/terms/);
  expect(await axeOf(page)).toEqual([]);
});

test('charte de la communauté (EN) et mobile', async ({ page }) => {
  await page.goto('/en/legal/community');
  await expect(page.getByRole('heading', { level: 1, name: 'Community guidelines' })).toBeVisible();
  await expect(page.getByText(/You can find love at any age/)).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Love has no age' })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await page.locator('summary', { hasText: 'Contents' }).click(); // sommaire repliable sur mobile
  await page.getByRole('navigation', { name: 'Contents' }).first().getByRole('link', { name: 'Reporting and blocking, simply' }).click();
  await expect(page.locator('#signaler')).toBeInViewport();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0); // pas de défilement horizontal
  expect(await axeOf(page)).toEqual([]);
});
