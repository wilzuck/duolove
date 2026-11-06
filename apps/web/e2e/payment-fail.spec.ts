import { expect, test } from '@playwright/test';
import { completeOnboarding, newMember, persona, signUp, uid } from './helpers';

// Paiement simulé refusé : retour visible, aucun avantage activé.
test('Un paiement refusé affiche un message clair et laisse le compte en gratuit', async ({ browser, request }) => {
  const { ctx, page } = await newMember(browser);
  const p = persona('Fail', 'Femme', `Ville${uid()}`);
  await signUp(page, request, p);
  await completeOnboarding(page, p);
  await page.goto('/premium');
  await page.getByRole('button', { name: 'Choisir Premium' }).click();
  await expect(page).toHaveURL(/checkout\/mock/);
  await page.getByRole('button', { name: 'Simuler un échec' }).click();
  await expect(page).toHaveURL(/settings\?tab=payments&status=fail/);
  await expect(page.getByText('Le paiement a échoué')).toBeVisible();
  expect((await (await page.request.get('/api/subscriptions/me')).json()).plan).toBe('FREE');
  await ctx.close();
});

// Recadrage : un fichier qui n'est pas une image lisible donne un message, pas un échec silencieux.
test('Un fichier illisible dans le recadrage affiche une erreur et bloque la validation', async ({ browser, request }) => {
  const { ctx, page } = await newMember(browser);
  const p = persona('Crop', 'Homme', `Ville${uid()}`);
  await signUp(page, request, p);
  await completeOnboarding(page, p);
  await page.goto('/profile');
  await page.locator('input[type=file]').first().setInputFiles({ name: 'faux.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('ceci n’est pas une image') });
  await expect(page.getByText('Ce fichier n’est pas une image lisible')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Utiliser cette photo' })).toBeDisabled();
  await ctx.close();
});
