import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { persona, signUp, uid } from './helpers';

// Politique de cookies : la page doit rester VRAIE. Les cookies et stockages réellement posés doivent tous être listés ; aucune requête vers un tiers de mesure ou de publicité.
const axeOf = async (page: Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map((v) => `${v.id} (${v.nodes.length}) ${v.help}`);

test('la page liste exactement ce que l’application stocke (cookies, stockage local, tiers)', async ({ page, context, request }) => {
  const hosts = new Set<string>();
  page.on('request', (r) => hosts.add(new URL(r.url()).hostname));
  await page.goto('/legal/cookies');
  const listed = await page.getByRole('table').getByRole('rowheader').allInnerTexts();
  expect(listed.sort()).toEqual(['NEXT_LOCALE', 'duomatch-theme', 'duomatch.enterSends', 'duomatch_sid']);

  // Visiteur : parcours public, changement de thème → seuls NEXT_LOCALE (cookie) et duomatch-theme (stockage local).
  for (const p of ['/', '/pricing', '/login', '/register', '/help', '/blog', '/en']) await page.goto(p);
  await page.getByRole('button', { name: /mode sombre|mode clair|dark mode|light mode/i }).first().click();
  expect((await context.cookies()).map((c) => c.name).sort()).toEqual(['NEXT_LOCALE']);
  expect(await page.evaluate(() => Object.keys(localStorage).sort())).toEqual(['duomatch-theme']);

  // Membre connecté : s'ajoute uniquement le cookie de session, sécurisé et inaccessible aux scripts.
  await signUp(page, request, persona('Cookie', 'Femme', `Ville${uid()}`));
  const cookies = await context.cookies();
  expect(cookies.map((c) => c.name).sort()).toEqual(['NEXT_LOCALE', 'duomatch_sid']);
  const sid = cookies.find((c) => c.name === 'duomatch_sid')!;
  expect(sid.httpOnly).toBe(true);
  expect(sid.sameSite).toBe('Lax');
  expect(await page.evaluate(() => document.cookie)).not.toContain('duomatch_sid'); // invisible pour les scripts
  expect(await page.evaluate(() => Object.keys(localStorage).every((k) => ['duomatch-theme', 'duomatch.enterSends'].includes(k)))).toBe(true);

  // Aucune requête vers un service de mesure d'audience ou de publicité.
  const external = [...hosts].filter((h) => !['localhost', '127.0.0.1'].includes(h));
  expect(external.filter((h) => /google-analytics|googletagmanager|doubleclick|facebook|hotjar|segment|mixpanel|plausible|clarity/i.test(h))).toEqual([]);
});

test('politique de cookies : 9 rubriques lisibles, tableau accessible, FR/EN, mobile, accessible', async ({ page }) => {
  await page.goto('/legal/cookies');
  await expect(page.getByRole('heading', { level: 1, name: 'Politique de cookies' })).toBeVisible();
  await expect(page.getByText(/aucun bandeau de consentement ne s’affiche/)).toBeVisible();
  await expect(page.getByText(/à faire relire et valider par un juriste/)).toBeVisible();
  await expect(page.locator('main').getByRole('heading', { level: 2 })).toHaveCount(11); // 9 rubriques + « À lire aussi » + titre masqué « En un coup d'œil »
  await expect(page.getByRole('table', { name: 'Cookies et stockages utilisés par DuoMatch' })).toBeVisible();
  await expect(page.getByRole('columnheader')).toHaveCount(5);
  await page.getByRole('navigation', { name: 'Sommaire' }).getByRole('link', { name: 'Ce que nous n’utilisons pas' }).click();
  await expect(page).toHaveURL(/#jamais$/);
  expect(await axeOf(page)).toEqual([]);
  await page.goto('/en/legal/cookies');
  await expect(page.getByRole('heading', { level: 1, name: 'Cookie policy' })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  for (const p of ['/legal/cookies', '/en/legal/cookies']) {
    await page.goto(p);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), p).toBeLessThanOrEqual(0);
  }
  expect(await axeOf(page)).toEqual([]);
});
