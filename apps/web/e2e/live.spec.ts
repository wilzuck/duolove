import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { completeOnboarding, newMember, persona, signUp, uid } from './helpers';

// Menu « Match » : critères → invitation → acceptation en direct → conversation payée en jeton.
const ORIGIN = { Origin: 'http://localhost:3000' }; // contrôle CSRF par l'en-tête Origin (comme un vrai navigateur)

/** Taille tirée au hasard : isole les deux membres de ce test des autres comptes en ligne (critère « Taille » du formulaire). */
const randomHeight = () => 150 + Math.floor(Math.random() * 80);

/** Règle un curseur natif comme le ferait un utilisateur : valeur + événement `input` (compatible React). */
async function setRange(page: Page, label: string, value: number) {
  await page.getByLabel(label, { exact: true }).evaluate((el, v) => {
    const input = el as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(v));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

async function api(page: Page, method: 'post' | 'patch', url: string, data: unknown) {
  const r = await page.request[method](url, { data, headers: ORIGIN });
  expect(r.ok(), `${method} ${url} → ${r.status()}`).toBeTruthy();
  return r.json() as Promise<Record<string, unknown>>;
}

test.describe.serial('Match en direct', () => {
  const city = `Ville${uid()}`;
  const awa = persona('Awa', 'Femme', city);
  const yao = persona('Yao', 'Homme', city);
  const height = randomHeight();
  let awaPage: Awaited<ReturnType<typeof newMember>>;
  let yaoPage: Awaited<ReturnType<typeof newMember>>;

  test.beforeAll(async ({ browser }) => { awaPage = await newMember(browser); yaoPage = await newMember(browser); });
  test.afterAll(async () => { await awaPage.ctx.close(); await yaoPage.ctx.close(); });

  test('préparation : deux membres, jetons achetés, taille renseignée', async ({ request }) => {
    for (const [m, p] of [[awaPage, awa], [yaoPage, yao]] as const) {
      await signUp(m.page, request, p);
      await completeOnboarding(m.page, p);
    }
    await api(yaoPage.page, 'patch', '/api/profiles/me', { heightCm: height });
    // Achat de 5 jetons (paiement simulé de développement, montant calculé par le serveur : 1000 FCFA).
    const co = (await api(awaPage.page, 'post', '/api/checkout', { type: 'product', code: 'TOKENS_5' })) as { providerRef: string; amountXof: number };
    expect(co.amountXof).toBe(1000);
    await api(awaPage.page, 'post', `/api/payments/mock/${co.providerRef}/complete`, { outcome: 'success' });
  });

  test('Awa valide ses critères et lance la recherche (accessible)', async () => {
    const { page } = awaPage;
    await page.goto('/match');
    await expect(page.getByRole('heading', { name: 'Match en direct' })).toBeVisible();
    await expect(page.getByRole('link', { name: /5 jetons Match/ })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Des hommes' })).toBeChecked();  // formulaire simplifié : pastilles radio et curseurs
    await setRange(page, 'Taille min. (cm)', height);
    await setRange(page, 'Taille max. (cm)', height);
    await expect(page.getByText(`${height} à ${height} cm`)).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations.map((v) => `${v.id} (${v.nodes.length}) ${v.help}`)).toEqual([]);
    await page.getByRole('button', { name: 'Lancer la recherche' }).click();
    await expect(page.getByText(/1 personne\(s\) en ligne invitée\(s\)/)).toBeVisible();
    await expect(page.getByText('Recherche en cours')).toBeVisible();
    // Le délai de 15 min empêche de relancer tout de suite.
    await page.getByRole('button', { name: 'Modifier les critères' }).click();
    await expect(page.getByRole('button', { name: 'Relancer avec ces critères' })).toBeDisabled();
    await page.getByRole('button', { name: 'Annuler' }).click();
  });

  test('Yao reçoit l’invitation et accepte', async () => {
    const { page } = yaoPage;
    await page.goto('/match');
    await expect(page.getByRole('heading', { name: 'Invitations Match (1)' })).toBeVisible();
    await expect(page.getByText(/Awa, \d+/)).toBeVisible();
    await page.getByRole('button', { name: 'Accepter' }).click();
    await expect(page.getByText(/Invitation acceptée/)).toBeVisible();
  });

  test('Awa voit Yao apparaître et ouvre la conversation avec 1 jeton', async () => {
    const { page } = awaPage;
    await page.goto('/match');
    await expect(page.getByRole('heading', { name: 'Ils ont accepté' })).toBeVisible();
    await expect(page.getByText(/Yao, \d+/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Aimer Yao/ })).toBeVisible(); // J'aime et Passer, sans jeton
    await expect(page.getByRole('button', { name: /Passer Yao/ })).toBeVisible();
    await page.getByRole('button', { name: /Aimer Yao/ }).click();
    await expect(page.getByText(/Like envoyé/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Aimer Yao/ })).toBeDisabled(); // déjà aimé
    await page.getByRole('button', { name: /Discuter \(1 jeton\)/ }).click();
    await expect(page).toHaveURL(/\/messages\/.+/);
    await page.goto('/match');
    await expect(page.getByRole('link', { name: /4 jetons Match/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ouvrir la conversation' })).toBeVisible();
  });
});

// Un membre sans jeton dont la recherche reçoit une acceptation : le guide explique quoi faire.
test.describe.serial('Match en direct : guide sans jeton', () => {
  const city = `Ville${uid()}`;
  const bea = persona('Bea', 'Femme', city);
  const zed = persona('Zed', 'Homme', city);
  const height = randomHeight();
  let beaPage: Awaited<ReturnType<typeof newMember>>;
  let zedPage: Awaited<ReturnType<typeof newMember>>;

  test.beforeAll(async ({ browser }) => { beaPage = await newMember(browser); zedPage = await newMember(browser); });
  test.afterAll(async () => { await beaPage.ctx.close(); await zedPage.ctx.close(); });

  test('Zed accepte la recherche de Bea, qui n’a aucun jeton', async ({ request }) => {
    for (const [m, p] of [[beaPage, bea], [zedPage, zed]] as const) {
      await signUp(m.page, request, p);
      await completeOnboarding(m.page, p);
    }
    await api(zedPage.page, 'patch', '/api/profiles/me', { heightCm: height });
    await api(beaPage.page, 'post', '/api/live/searches', { seeking: 'MEN', ageMin: 18, ageMax: 60, heightMin: height, heightMax: height });
    const inv = (await (await zedPage.page.request.get('/api/live/invites')).json()) as { items: { inviteId: string }[] };
    await api(zedPage.page, 'post', `/api/live/invites/${inv.items[0]!.inviteId}/accept`, {});
  });

  test('Bea voit un guide clair : obtenir un jeton, ou aimer gratuitement (accessible)', async () => {
    const { page } = beaPage;
    await page.goto('/match');
    await expect(page.getByText(/Zed, \d+/)).toBeVisible();
    const guide = page.getByRole('region', { name: /Il vous faut 1 jeton pour lui parler/ });
    await expect(guide).toBeVisible();
    await expect(guide.getByRole('link', { name: 'Acheter des jetons' })).toHaveAttribute('href', '/shop');
    await expect(guide.getByRole('link', { name: /Compléter mon profil \(3 jetons offerts\)/ })).toHaveAttribute('href', '/profile');
    await expect(guide.getByRole('link', { name: 'J’ai un code promo' })).toBeVisible();
    await expect(guide.getByText(/« J’aime »/)).toBeVisible();
    await expect(page.getByText(/Disponible jusqu’à \d{2}:\d{2}/)).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations.map((v) => `${v.id} (${v.nodes.length}) ${v.help}`)).toEqual([]);
  });

  test('Une fois un jeton obtenu, le guide disparaît et « Discuter » apparaît', async () => {
    const { page } = beaPage;
    const co = (await api(page, 'post', '/api/checkout', { type: 'product', code: 'TOKENS_5' })) as { providerRef: string };
    await api(page, 'post', `/api/payments/mock/${co.providerRef}/complete`, { outcome: 'success' });
    await page.goto('/match');
    await expect(page.getByRole('button', { name: /Discuter \(1 jeton\)/ })).toBeVisible();
    await expect(page.getByRole('region', { name: /Il vous faut 1 jeton/ })).toHaveCount(0);
  });
});
