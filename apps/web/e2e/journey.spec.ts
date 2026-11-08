import { expect, test } from '@playwright/test';
import { completeOnboarding, login, newMember, PASSWORD, persona, signUp, uid } from './helpers';

// Parcours complet à deux membres : couvre les 12 scénarios de la spécification (voir docs/TESTING.md).
test.describe.serial('parcours CrushDuo', () => {
  const city = `Ville${uid()}`;
  const aya = persona('Aya', 'Femme', city);
  const koffi = persona('Koffi', 'Homme', city);
  let ayaPage: Awaited<ReturnType<typeof newMember>>;
  let koffiPage: Awaited<ReturnType<typeof newMember>>;

  test.beforeAll(async ({ browser }) => { ayaPage = await newMember(browser); koffiPage = await newMember(browser); });
  test.afterAll(async () => { await ayaPage.ctx.close(); await koffiPage.ctx.close(); });

  test('1-4 · inscription adulte, e-mail confirmé, profil et photo (deux membres)', async ({ request }) => {
    for (const [m, p] of [[ayaPage, aya], [koffiPage, koffi]] as const) {
      await signUp(m.page, request, p);
      await completeOnboarding(m.page, p);
    }
  });

  test('5-6 · Aya découvre Koffi et le like (pas encore de match)', async () => {
    const { page } = ayaPage;
    await page.goto('/discover');
    await expect(page.getByRole('article', { name: /Koffi, \d+/ })).toBeVisible();
    await page.getByRole('button', { name: 'Liker', exact: true }).click();
    await expect(page.getByRole('dialog', { name: /match/i })).toHaveCount(0);
    await expect(page.getByText('Plus de profils pour le moment')).toBeVisible();
  });

  test('7-8 · like réciproque → match, puis échange de messages en temps réel', async () => {
    const k = koffiPage.page;
    await k.goto('/discover');
    await expect(k.getByRole('article', { name: /Aya, \d+/ })).toBeVisible();
    await k.getByRole('button', { name: 'Liker', exact: true }).click();
    const overlay = k.getByRole('dialog', { name: /C’est un match/ });
    await expect(overlay).toBeVisible();
    await overlay.getByRole('button', { name: 'Discuter maintenant' }).click();
    await expect(k).toHaveURL(/messages\/.+/);

    // Aya ouvre la conversation avant l'envoi : le message doit arriver sans rechargement (WebSocket)
    const a = ayaPage.page;
    await a.goto('/messages');
    await a.getByRole('link', { name: /Koffi/ }).first().click();
    await expect(a).toHaveURL(/messages\/.+/);

    await k.getByLabel('Écrire un message…').fill('Bonjour Aya, ravi de ce match !');
    await k.getByRole('button', { name: 'Envoyer', exact: true }).click();
    await expect(k.getByRole('log').getByText('Bonjour Aya, ravi de ce match !')).toBeVisible();
    await expect(a.getByRole('log').getByText('Bonjour Aya, ravi de ce match !')).toBeVisible();

    await a.getByLabel('Écrire un message…').fill('Bonjour Koffi ! Enchantée.');
    await a.getByRole('button', { name: 'Envoyer', exact: true }).click();
    await expect(k.getByRole('log').getByText('Bonjour Koffi ! Enchantée.')).toBeVisible();

    // Mise en garde anti-escroquerie visible sous le champ de saisie.
    await expect(k.getByText(/Ne versez jamais d’argent/)).toBeVisible();
    // « Envoyer avec Entrée » : coché par défaut ; décoché, Entrée ajoute une ligne au lieu d'envoyer.
    const compose = k.getByLabel('Écrire un message…');
    const enter = k.getByLabel('Envoyer avec la touche Entrée');
    await expect(enter).toBeChecked();
    await enter.uncheck();
    await compose.fill('Deux lignes');
    await compose.press('Enter');
    await expect(k.getByRole('log').getByText('Deux lignes')).toHaveCount(0);
    await compose.press('Control+Enter'); // Ctrl/⌘+Entrée envoie toujours
    await expect(k.getByRole('log').getByText(/Deux lignes/)).toBeVisible();
    await enter.check();
    // Sans abonnement : pas d'envoi de photo, l'invitation à s'abonner s'affiche (et le texte reste gratuit).
    await k.getByRole('button', { name: 'Envoyer une photo (réservé aux abonnés)' }).click();
    const dlg = k.getByRole('dialog', { name: 'Photos réservées aux abonnés' });
    await expect(dlg).toBeVisible();
    await expect(dlg.getByRole('link', { name: 'Voir les formules' })).toBeVisible();
    await dlg.getByRole('button', { name: 'Fermer' }).first().click();
  });

  test('9 · Aya bloque Koffi : la conversation disparaît des deux côtés', async () => {
    const a = ayaPage.page;
    await a.getByRole('button', { name: 'Options de la conversation' }).click();
    await a.getByRole('menuitem', { name: 'Bloquer' }).click();
    await expect(a).toHaveURL(/\/messages$/);
    await expect(a.getByText('Aucune conversation')).toBeVisible();
    const k = koffiPage.page;
    await k.goto('/messages');
    await expect(k.getByText('Aucune conversation')).toBeVisible();
  });

  test('10-11 · Koffi souscrit Premium (paiement simulé via webhook signé) puis annule', async () => {
    const k = koffiPage.page;
    await k.goto('/premium');
    await k.getByRole('button', { name: 'Choisir Premium' }).click();
    await expect(k).toHaveURL(/checkout\/mock/);
    // Avant paiement : toujours gratuit (aucune activation sur simple retour frontend)
    const before = await k.request.get('/api/subscriptions/me');
    expect((await before.json()).plan).toBe('FREE');
    await k.getByRole('button', { name: 'Simuler un paiement réussi' }).click();
    await expect(k).toHaveURL(/settings\?tab=payments&status=success/);
    await expect(k.getByText('Paiement confirmé')).toBeVisible();
    await expect(k.getByRole('button', { name: 'Facture' })).toBeVisible();

    await k.goto('/settings?tab=subscription');
    await expect(k.getByRole('heading', { name: 'Premium' })).toBeVisible();
    await k.getByRole('button', { name: 'Annuler l’abonnement' }).click();
    await expect(k.getByText(/Se termine le/)).toBeVisible();
  });

  test('12 · Koffi supprime son compte', async ({ browser }) => {
    const k = koffiPage.page;
    await k.goto('/settings?tab=privacy');
    await k.getByRole('button', { name: 'Supprimer mon compte' }).click();
    await k.getByRole('dialog').getByLabel('Mot de passe').fill(PASSWORD);
    await k.getByRole('button', { name: 'Supprimer définitivement' }).click();
    await expect(k).toHaveURL(/localhost:3000\/?$/);

    const fresh = await newMember(browser);
    await login(fresh.page, koffi.email);
    await expect(fresh.page.getByText('E-mail ou mot de passe incorrect.')).toBeVisible();
    await fresh.ctx.close();
  });
});
