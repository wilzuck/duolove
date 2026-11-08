import { expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import path from 'node:path';

export const PASSWORD = 'Duomio-E2E-2026!';
export const PHOTO = path.join(__dirname, 'fixtures', 'photo.jpg');
export const uid = () => Math.random().toString(36).slice(2, 8);

export interface Persona { name: string; email: string; gender: 'Homme' | 'Femme'; seeks: 'Des hommes' | 'Des femmes'; city: string }
export const persona = (name: string, gender: Persona['gender'], city: string): Persona => ({
  name, email: `${name.toLowerCase()}-${uid()}@e2e.duomatch`, gender, seeks: gender === 'Femme' ? 'Des hommes' : 'Des femmes', city,
});

/** Le message d'information sur les cookies est déjà lu : il ne masque pas les boutons du bas de page (il est testé à part dans cookies.spec). */
export const NOTICE_SEEN = { cookies: [], origins: [{ origin: 'http://localhost:3000', localStorage: [{ name: 'duomatch.cookiesNotice', value: '1' }] }] };

export async function newMember(browser: Browser) {
  const ctx = await browser.newContext({ locale: 'fr-FR', viewport: { width: 1280, height: 900 }, storageState: NOTICE_SEEN });
  return { ctx, page: await ctx.newPage() };
}

/** Scénarios 1-2 : inscription d'un adulte puis confirmation de l'e-mail via la boîte d'envoi de développement. */
export async function signUp(page: Page, request: APIRequestContext, p: Persona, ref?: string) {
  await page.goto(ref ? `/register?ref=${ref}` : '/register');
  if (ref) await expect(page.getByLabel('Code de parrainage (facultatif)')).toHaveValue(ref); // lien d'invitation : code pré-rempli
  await page.getByLabel('Prénom ou pseudonyme').fill(p.name);
  await page.getByLabel('Adresse e-mail').fill(p.email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  // Calendrier (DatePicker) : menus année/mois puis clic sur le jour
  await page.getByRole('button', { name: 'Date de naissance' }).click();
  await page.locator('.rdp-years_dropdown').selectOption('1995');
  await page.locator('.rdp-months_dropdown').selectOption('3'); // avril
  await page.getByRole('dialog').getByRole('button', { name: /20 avril 1995/ }).click();
  await expect(page.getByText('20 avril 1995')).toBeVisible();
  await page.getByLabel('Genre').selectOption({ label: p.gender });
  await page.getByLabel('Pays').selectOption('TG');
  await page.getByLabel('Ville').fill(p.city);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  // Étape obligatoire : saisir le code à 6 chiffres reçu par e-mail (rien d'autre n'est accessible avant).
  await expect(page).toHaveURL(/confirm-email/);
  await expect(page.getByRole('heading', { name: 'Confirmez votre e-mail' })).toBeVisible();
  const code = await emailCode(request, p.email);
  await page.getByLabel('Code de confirmation').fill(code);
  await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(page).toHaveURL(/onboarding/);
}

/** Lit dans la boîte d'envoi de développement le dernier code de confirmation envoyé à `email`. */
export async function emailCode(request: APIRequestContext, email: string): Promise<string> {
  const box = (await (await request.get('http://localhost:4000/api/dev/outbox')).json()) as { to: string; text: string }[];
  const mail = [...box].reverse().find((m) => m.to === email);
  expect(mail, 'e-mail de confirmation reçu').toBeTruthy();
  return /code de confirmation : (\d{6})/.exec(mail!.text)![1]!;
}

/** Scénario 3-4 : complétion du profil et ajout d'une photo recadrée. */
export async function completeOnboarding(page: Page, p: Persona) {
  await page.goto('/onboarding');
  await page.getByLabel('Biographie').fill('Passionné(e) de cuisine, de voyages et de belles discussions. Je cherche une relation sincère.');
  await page.getByRole('radio', { name: /Relation sérieuse/ }).check({ force: true });
  await page.getByRole('button', { name: 'Continuer' }).click();
  for (const i of ['Musique', 'Cuisine', 'Voyages']) await page.getByRole('button', { name: i, exact: true }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.locator('input[type=file]').setInputFiles(PHOTO);
  await page.getByRole('button', { name: 'Utiliser cette photo' }).click();
  await expect(page.getByText('Principale')).toBeVisible();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByText(p.seeks, { exact: true }).click();
  await page.getByLabel('Ville').fill(p.city); // isole le scénario des autres membres de la base
  await page.getByRole('button', { name: 'Découvrir des profils' }).click();
  await expect(page).toHaveURL(/discover/);
}

export async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}
