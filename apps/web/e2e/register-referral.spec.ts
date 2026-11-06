import { expect, test } from '@playwright/test';

// Code de parrainage : masqué par défaut, visible avec ?ref= ou après un clic.
test.describe('Inscription : code de parrainage', () => {
  test('masqué par défaut, révélé par le lien', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByLabel('Code de parrainage (facultatif)')).toHaveCount(0);
    await page.getByRole('button', { name: 'J’ai un code de parrainage' }).click();
    await expect(page.getByLabel('Code de parrainage (facultatif)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'J’ai un code de parrainage' })).toHaveCount(0);
  });
  test('visible et pré-rempli avec ?ref= dans l’URL', async ({ page }) => {
    await page.goto('/register?ref=ABCD2345');
    await expect(page.getByLabel('Code de parrainage (facultatif)')).toHaveValue('ABCD2345');
    await expect(page.getByRole('button', { name: 'J’ai un code de parrainage' })).toHaveCount(0);
  });
});
