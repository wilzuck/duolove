import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { persona, signUp } from './helpers';

const axe = (page: import('@playwright/test').Page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();

test.describe('Options de connexion', () => {
  test('« Restez connecté » et lien magique : connexion sans mot de passe, lien à usage unique (accessible)', async ({ page, request }) => {
    const p = persona('Mina', 'Femme', `L-${Math.random().toString(36).slice(2, 6)}`);
    await signUp(page, request, p);
    await page.context().clearCookies();

    await page.goto('/login');
    await expect(page.getByLabel('Restez connecté')).toBeChecked(); // coché par défaut
    expect((await axe(page)).violations.map((v) => `${v.id} ${v.help}`)).toEqual([]);

    await page.getByRole('button', { name: 'Recevoir un lien de connexion par e-mail' }).click();
    await expect(page.getByLabel('Mot de passe')).toHaveCount(0);
    await page.getByLabel('Adresse e-mail').fill(p.email);
    await page.getByRole('button', { name: 'Envoyer le lien' }).click();
    await expect(page.getByText(/un lien de connexion vient d’être envoyé/)).toBeVisible();

    const box = (await (await request.get('http://localhost:4000/api/dev/outbox')).json()) as { to: string; subject: string; text: string }[];
    const mail = [...box].reverse().find((m) => m.to === p.email && m.subject.includes('lien de connexion'));
    expect(mail, 'e-mail du lien magique reçu').toBeTruthy();
    const link = /(http\S*magic-link\?token=\S+)/.exec(mail!.text)![1]!;
    await page.goto(link);
    await expect(page).toHaveURL(/discover|onboarding/);

    await page.context().clearCookies();
    await page.goto(link); // déjà utilisé
    await expect(page.getByText(/invalide, déjà utilisé ou expiré/)).toBeVisible();
    expect((await axe(page)).violations.map((v) => `${v.id} ${v.help}`)).toEqual([]);
  });

  test('sans « Restez connecté », le cookie de session n’a pas de date d’expiration', async ({ page, request }) => {
    const p = persona('Noe', 'Homme', `L-${Math.random().toString(36).slice(2, 6)}`);
    await signUp(page, request, p);
    await page.context().clearCookies();
    await page.goto('/login');
    await page.getByLabel('Restez connecté').uncheck();
    await page.getByLabel('Adresse e-mail').fill(p.email);
    await page.getByLabel('Mot de passe').fill('Duomio-E2E-2026!');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page).toHaveURL(/discover|onboarding/);
    const sid = (await page.context().cookies()).find((c) => c.name === 'duomatch_sid');
    expect(sid?.expires).toBe(-1); // cookie de session
  });
});
