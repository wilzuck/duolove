import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newMember, persona, PHOTO, signUp, uid } from './helpers';

// Blog éditable depuis l'admin : brouillon invisible, image obligatoire pour publier, article visible avec son image, dépublication.
const DB = 'postgresql://admin@localhost:5432/duomatch_test';
const sql = (q: string) => execFileSync('psql', [DB, '-Atc', q], { encoding: 'utf8' }).trim();

test.describe.serial('Blog administrable', () => {
  const boss = persona('Admin', 'Homme', `Ville${uid()}`);
  const title = `Article E2E ${uid()}`;
  let ctx: Awaited<ReturnType<typeof newMember>>;
  let slug = '';

  test.beforeAll(async ({ browser }) => { ctx = await newMember(browser); });
  test.afterAll(async () => { await ctx.ctx.close(); });

  test('création d’un brouillon, publication refusée sans image', async ({ request }) => {
    const { page } = ctx;
    await signUp(page, request, boss);
    sql(`update "User" set role='ADMIN' where email='${boss.email}'`);
    await page.goto('/admin/blog/new');
    await page.getByLabel('Titre', { exact: true }).fill(title);
    slug = await page.getByLabel('Lien de l’article (slug)').inputValue();
    expect(slug).toMatch(/^article-e2e-[a-z0-9]+$/); // slug dérivé du titre
    await page.getByLabel('Résumé (affiché dans la liste)').fill('Un résumé de test suffisamment long.');
    await page.getByRole('textbox', { name: 'Contenu' }).fill('## Un intertitre\n\nUn paragraphe avec du **gras** et une liste :\n\n- premier point\n- second point');
    await page.getByRole('tab', { name: 'Aperçu' }).click();
    await expect(page.getByRole('heading', { name: 'Un intertitre' })).toBeVisible();
    await expect(page.locator('strong', { hasText: 'gras' })).toBeVisible();
    await page.getByRole('tab', { name: 'Rédiger' }).click();
    await page.getByRole('button', { name: 'Publier' }).click();
    await expect(page.getByText('Un article publié doit avoir une image de couverture.').first()).toBeVisible();
    await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
    await expect(page).toHaveURL(/\/admin\/blog\/[a-z0-9]+$/);
    // Un brouillon n'est pas public.
    expect((await request.get(`/blog/${slug}`)).status()).toBe(404);
  });

  test('image de couverture + texte alternatif, puis publication', async ({ request }) => {
    const { page } = ctx;
    await page.getByLabel('Choisir une image').setInputFiles(PHOTO);
    await expect(page.getByText('Image téléversée.')).toBeVisible();
    await page.getByRole('button', { name: 'Publier' }).click();
    await expect(page.getByText('Décrivez l’image de couverture (texte alternatif) pour publier.').first()).toBeVisible();
    await page.getByLabel('Description de l’image (accessibilité)').fill('Un visage souriant');
    await page.getByRole('button', { name: 'Publier' }).click();
    await expect(page.getByText('Article publié.')).toBeVisible();
    expect((await request.get(`/blog/${slug}`)).status()).toBe(200);
  });

  test('l’article apparaît sur le blog avec son image, lisible et accessible', async () => {
    const { page } = ctx;
    await page.goto('/blog');
    const img = page.getByRole('img', { name: 'Un visage souriant' }).first();
    await expect(img).toBeVisible();
    expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    await page.getByRole('link', { name: new RegExp(title) }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Un intertitre' })).toBeVisible();
    await expect(page.getByText('premier point')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Blog' }).first()).toHaveAttribute('aria-current', 'page'); // page active dans la navbar
    const violations = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map((v) => v.id);
    expect(violations).toEqual([]);
  });

  test('dépublication puis suppression', async () => {
    const { page } = ctx;
    await page.goto('/admin/blog');
    await page.getByRole('link', { name: title }).click();
    await page.getByRole('button', { name: 'Dépublier' }).click();
    await expect(page.getByText('Article dépublié.')).toBeVisible();
    expect((await page.request.get(`/blog/${slug}`)).status()).toBe(404);
    await page.getByRole('button', { name: 'Supprimer' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
    await expect(page).toHaveURL(/\/admin\/blog$/);
    await expect(page.getByRole('link', { name: title })).toHaveCount(0);
  });
});

test('page Tarifs : boosts, Super Likes et jetons séparés, avec heures et quantités en évidence', async ({ page }) => {
  await page.goto('/pricing');
  for (const g of ['Boosts de visibilité', 'Super Likes', 'Jetons Match']) await expect(page.getByRole('group', { name: g })).toBeVisible();
  const boosts = page.getByRole('group', { name: 'Boosts de visibilité' });
  for (const d of ['30 min', '2 h', '24 h']) await expect(boosts.getByText(d, { exact: true })).toBeVisible();
  const likes = page.getByRole('group', { name: 'Super Likes' });
  for (const n of ['5', '15', '30']) await expect(likes.getByText(n, { exact: true }).first()).toBeVisible();
});
