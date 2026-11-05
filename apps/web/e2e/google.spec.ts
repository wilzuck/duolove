import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Connexion Google, côté navigateur uniquement : le script de Google est remplacé par un faux et l'appel serveur est intercepté (aucun contact avec Google).
// Le bouton n'existe que si le site a été construit avec NEXT_PUBLIC_GOOGLE_CLIENT_ID ; sinon ce test est ignoré (le bouton reste masqué, par conception).
//   NEXT_PUBLIC_GOOGLE_CLIENT_ID=test.apps.googleusercontent.com pnpm --filter @duomatch/web build && pnpm --filter @duomatch/web exec playwright test e2e/google.spec.ts
test.skip(!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID, 'site construit sans identifiant client Google');
test.use({ storageState: { cookies: [], origins: [{ origin: 'http://localhost:3000', localStorage: [{ name: 'duomatch.cookiesNotice', value: '1' }] }] } });

const fakeGoogle = () => {
  let cb: (r: { credential: string }) => void = () => {};
  (window as unknown as { google: unknown }).google = {
    accounts: { id: {
      initialize: (c: { callback: typeof cb }) => { cb = c.callback; },
      renderButton: (el: HTMLElement) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Continuer avec Google (simulé)'; b.onclick = () => cb({ credential: 'fake-google-credential-0123456789' }); el.appendChild(b); },
    } },
  };
};
const axeOf = async (page: Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map((v) => `${v.id} (${v.nodes.length}) ${v.help}`);

test('nouveau visiteur : Google reconnu sur la connexion, inscription complétée (âge, genre, pays, ville, conditions) sans ressaisir e-mail ni mot de passe', async ({ page }) => {
  await page.addInitScript(fakeGoogle);
  const calls: Record<string, unknown>[] = [];
  await page.route('**/api/auth/google', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    calls.push(body);
    if (!body.birthDate) return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { code: 'PROFILE_DETAILS_REQUIRED', message: 'x' } }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'u1', email: 'a@b.c', role: 'USER', emailVerified: true }) });
  });
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Continuer avec Google (simulé)' })).toBeVisible();
  expect(await axeOf(page)).toEqual([]);
  await page.getByRole('button', { name: 'Continuer avec Google (simulé)' }).click();
  await expect(page).toHaveURL(/register/);
  await expect(page.getByText(/Compte Google reconnu/)).toBeVisible();
  await expect(page.getByLabel('Mot de passe')).toHaveCount(0);  // aucun mot de passe : Google a déjà confirmé l'adresse
  await page.getByRole('button', { name: 'Date de naissance' }).click();
  await page.locator('.rdp-years_dropdown').selectOption('1995');
  await page.locator('.rdp-months_dropdown').selectOption('3');
  await page.getByRole('dialog').getByRole('button', { name: /20 avril 1995/ }).click();
  await page.getByLabel('Genre').selectOption({ label: 'Femme' });
  await page.getByLabel('Pays').selectOption('CI');
  await page.getByLabel('Ville').fill('Abidjan');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect.poll(() => calls.length).toBe(2);
  expect(calls[1]).toMatchObject({ idToken: 'fake-google-credential-0123456789', gender: 'WOMAN', country: 'CI', city: 'Abidjan', acceptTerms: true });
  expect(String(calls[1]!.birthDate)).toContain('1995-04-20');
  // Rien n'est resté sur l'appareil : le jeton a transité en mémoire seulement.
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('fake-google-credential');
});

test('compte existant : la connexion Google ouvre la session directement', async ({ page }) => {
  await page.addInitScript(fakeGoogle);
  await page.route('**/api/auth/google', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'u1', email: 'a@b.c', role: 'USER', emailVerified: true }) }));
  await page.route('**/api/users/me', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'x' } }) }));
  await page.goto('/login');
  const [req] = await Promise.all([page.waitForRequest('**/api/auth/google'), page.getByRole('button', { name: 'Continuer avec Google (simulé)' }).click()]);
  expect(req.postDataJSON()).toEqual({ idToken: 'fake-google-credential-0123456789' });
});
