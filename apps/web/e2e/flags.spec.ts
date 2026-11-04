import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newMember, persona, signUp, uid } from './helpers';

// Catalogue des interrupteurs : icône « i » explicative, coupure appliquée par le serveur, rétablissement.
const DB = 'postgresql://admin@localhost:5432/duomatch_test';
const sql = (q: string) => execFileSync('psql', [DB, '-Atc', q], { encoding: 'utf8' }).trim();

test.describe.serial('Fonctionnalités (feature flags)', () => {
  const boss = persona('Admin', 'Homme', `Ville${uid()}`);
  let page: Awaited<ReturnType<typeof newMember>>['page'];
  let close: () => Promise<void>;

  test.beforeAll(async ({ browser }) => { const m = await newMember(browser); page = m.page; close = () => m.ctx.close(); });
  test.afterAll(async () => { sql(`delete from "FeatureFlag"`); await close(); }); // ne laisse aucune fonction coupée

  test('l’administrateur voit les 8 fonctions groupées ; l’icône i explique chacune (accessible)', async ({ request }) => {
    await signUp(page, request, boss);
    sql(`update "User" set role='ADMIN' where email='${boss.email}'`);
    await page.goto('/admin/flags');
    await expect(page.getByRole('heading', { name: 'Fonctionnalités', level: 2 })).toBeVisible();
    for (const cat of ['Accès', 'Argent', 'Rencontres et échanges']) await expect(page.getByRole('heading', { name: cat, level: 3 })).toBeVisible();
    await expect(page.getByRole('switch')).toHaveCount(8);
    const info = page.getByRole('button', { name: 'À quoi sert « Paiements » ?' });
    await expect(info).toHaveAttribute('aria-expanded', 'false');
    await info.click();
    await expect(info).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText('Un paiement déjà lancé peut se terminer')).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations.map((v) => `${v.id} (${v.nodes.length}) ${v.help}`)).toEqual([]);
    await info.click();
    await expect(info).toHaveAttribute('aria-expanded', 'false');
  });

  test('couper « Photos dans les messages » est appliqué par le serveur, puis rétabli', async () => {
    const sw = page.getByRole('switch', { name: 'Photos dans les messages' });
    await expect(sw).toBeChecked();
    await sw.click();
    await expect(page.getByText('Enregistré : Photos dans les messages est coupé.')).toBeVisible();
    await expect(sw).not.toBeChecked();
    expect(((await (await page.request.get('/api/feature-flags')).json()) as Record<string, boolean>).chat_images).toBe(false);
    const refused = await page.request.post('/api/conversations/inconnue/images', { headers: { Origin: 'http://localhost:3000' } });
    expect(refused.status()).toBe(503);
    await sw.click();
    await expect(sw).toBeChecked();
    expect(((await (await page.request.get('/api/feature-flags')).json()) as Record<string, boolean>).chat_images).toBe(true);
  });
});
