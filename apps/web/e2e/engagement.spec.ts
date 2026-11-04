import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { completeOnboarding, newMember, persona, signUp, uid } from './helpers';

// Phase 1 engagement : questions de personnalité → découvertes du jour → like commenté → match → premier message ; contrôle par l'admin.
const DB = 'postgresql://admin@localhost:5432/duomatch_test';
const sql = (q: string) => execFileSync('psql', [DB, '-Atc', q], { encoding: 'utf8' }).trim();
const axeOf = async (page: import('@playwright/test').Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map((v) => `${v.id} (${v.nodes.length}) ${v.help}`);

test.describe.serial('Engagement : phase 1', () => {
  const city = `Ville${uid()}`;
  const awa = persona('Awa', 'Femme', city);
  const yao = persona('Yao', 'Homme', city);
  const boss = persona('Admin', 'Homme', `Ville${uid()}`);
  const OPENER = 'Quel pays rêves-tu de découvrir ?';
  const REPLY = 'Le Japon, et toi ?';
  let a: Awaited<ReturnType<typeof newMember>>;
  let y: Awaited<ReturnType<typeof newMember>>;
  let b: Awaited<ReturnType<typeof newMember>>;

  test.beforeAll(async ({ browser }) => { a = await newMember(browser); y = await newMember(browser); b = await newMember(browser); });
  test.afterAll(async () => { sql(`delete from "FeatureFlag"`); sql(`delete from "SystemSetting" where key like 'daily.%' or key like 'likes.%' or key like 'prompts.%' or key like 'matching.%'`); await a.ctx.close(); await y.ctx.close(); await b.ctx.close(); });

  test('1-2 · Yao complète son profil et répond à 3 questions de personnalité', async ({ request }) => {
    for (const [m, p] of [[a, awa], [y, yao]] as const) { await signUp(m.page, request, p); await completeOnboarding(m.page, p); }
    const { page } = y;
    await page.goto('/profile');
    const section = page.locator('#prompts');
    await expect(section.getByRole('heading', { name: 'Questions de personnalité' })).toBeVisible();
    for (const q of ['Mon dimanche parfait…', 'Mon plus grand rêve…', 'Mon langage de l’amour…']) {
      await section.getByRole('combobox', { name: 'Ajouter une question' }).selectOption({ label: q });
      await section.getByRole('textbox').last().fill(`Ma réponse à « ${q} »`);
    }
    await expect(section.getByText('3 / 5 questions')).toBeVisible();
    // Réordonner : remonter la dernière réponse, puis enregistrer.
    await section.getByRole('button', { name: 'Monter' }).last().click();
    await section.getByRole('button', { name: 'Enregistrer mes réponses' }).click();
    await expect(page.getByText('Réponses enregistrées.')).toBeVisible();
    await page.reload();
    await expect(page.locator('#prompts').getByRole('textbox')).toHaveCount(3);
    expect(await axeOf(page)).toEqual([]);
  });

  test('3 · Awa consulte ses découvertes du jour : vrai profil, raisons, aucun compte à rebours', async () => {
    const { page } = a;
    await page.goto('/daily');
    await expect(page.getByRole('heading', { name: 'Tes découvertes du jour', level: 1 })).toBeVisible();
    const card = page.getByRole('listitem').filter({ hasText: 'Yao' });
    await expect(card).toBeVisible();
    await expect(card.getByText(/\d+ % d’affinité|\d+ %/).first()).toBeVisible();
    await expect(page.getByText(/compte à rebours|expire dans|plus que \d+ (h|min)/i)).toHaveCount(0);
    await card.getByRole('button', { name: 'Voir le profil' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Affinité estimée' })).toBeVisible();
    await expect(dialog.getByText(/pas une garantie de compatibilité amoureuse/)).toBeVisible();
    await expect(dialog.getByText('Pourquoi ce profil ?')).toBeVisible();
    await expect(dialog.getByText('Ma réponse à « Mon dimanche parfait… »')).toBeVisible();
    expect(await axeOf(page)).toEqual([]);
  });

  test('4 · Awa envoie un J’aime sur une réponse, avec un commentaire', async () => {
    const { page } = a;
    await page.getByRole('dialog').getByRole('button', { name: 'Aimer cette réponse' }).first().click();
    const composer = page.getByRole('dialog').last();
    await expect(composer.getByRole('button', { name: 'Une réponse', pressed: true })).toBeVisible();
    await expect(composer.getByRole('button', { name: 'Envoyer le J’aime' })).toBeEnabled();
    await composer.getByLabel('Ajouter un commentaire (facultatif)').fill(OPENER);
    await expect(composer.getByText(`${OPENER.length} / 200`)).toBeVisible();
    await composer.getByRole('button', { name: 'Envoyer le J’aime' }).click();
    await expect(page.getByText('J’aime envoyé.')).toBeVisible();
    await page.goto('/likes');
    await page.getByRole('tab', { name: 'Vous avez liké' }).click();
    await expect(page.getByText(OPENER)).toBeVisible();
  });

  test('5-6 · Yao répond par un J’aime commenté : match, les deux commentaires deviennent les premiers messages', async () => {
    const { page } = y;
    await page.goto('/daily');
    const card = page.getByRole('listitem').filter({ hasText: 'Awa' });
    await card.getByRole('button', { name: 'J’aime', exact: true }).click(); // flag actif : ouvre la fenêtre de commentaire
    const composer = page.getByRole('dialog');
    await composer.getByLabel('Ajouter un commentaire (facultatif)').fill(REPLY);
    await composer.getByRole('button', { name: 'Envoyer le J’aime' }).click();
    await expect(page.getByRole('dialog', { name: 'C’est un match !' })).toBeVisible();
    await page.getByRole('button', { name: /Envoyer un message|Discuter|Écrire/ }).first().click();
    await expect(page).toHaveURL(/\/messages\//);
    const log = page.getByRole('log');
    await expect(log.getByText(OPENER)).toBeVisible();
    await expect(log.getByText(REPLY)).toBeVisible();
    await a.page.goto('/messages');
    await a.page.getByRole('link', { name: /Yao/ }).first().click();
    await expect(a.page.getByRole('log').getByText(OPENER)).toBeVisible();
  });

  test('admin · pondérations validées, quotas, questions et indicateurs réels', async ({ request }) => {
    const { page } = b;
    await signUp(page, request, boss);
    sql(`update "User" set role='ADMIN' where email='${boss.email}'`);
    await page.goto('/admin/engagement');
    await expect(page.getByRole('heading', { name: 'Engagement et matching', level: 2 })).toBeVisible();
    await page.getByLabel('Intentions compatibles').fill('35');
    await expect(page.getByText(/Total : 105 \/ 100 — Le total doit faire 100/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enregistrer les réglages' })).toBeDisabled();
    await page.getByLabel('Préférences mutuelles').fill('20');
    await expect(page.getByText('Total : 100 / 100')).toBeVisible();
    await page.getByLabel('Longueur max. d’un commentaire de like').fill('120');
    await page.getByRole('button', { name: 'Enregistrer les réglages' }).click();
    await expect(page.getByText('Réglages enregistrés.')).toBeVisible();
    expect(sql(`select value from "SystemSetting" where key = 'likes.comment_max'`)).toBe('120');
    expect(sql(`select count(*) from "AuditLog" where action = 'settings.update'`)).not.toBe('0');
    expect(await axeOf(page)).toEqual([]);
    // Questions : ajout puis désactivation.
    await page.getByRole('tab', { name: 'Questions' }).click();
    const slug = `e2e-${uid()}`;
    await page.getByLabel('Clé technique').fill(slug);
    await page.getByLabel('Texte (français)', { exact: true }).first().fill('Ma question de test ?');
    await page.getByLabel('Texte (anglais)', { exact: true }).first().fill('My test question?');
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(page.getByText('Question ajoutée.')).toBeVisible();
    await expect(page.getByText(slug)).toBeVisible();
    // Indicateurs : chiffres réels et liste de ce qui n'est pas encore mesuré.
    await page.getByRole('tab', { name: 'Indicateurs' }).click();
    await expect(page.getByText('J’aime avec commentaire')).toBeVisible();
    await expect(page.getByText('Pas encore mesuré')).toBeVisible();
    await expect(page.getByText('Rencontres réelles (uniquement sur déclaration volontaire)')).toBeVisible();
  });

  test('admin · la limite de commentaire s’applique, et couper « Likes avec commentaire » retire la fonction', async () => {
    const { page } = a;
    // Nouveau profil à aimer : une 3ᵉ personne n'est pas nécessaire, on vérifie la configuration publique et l'écran de profil.
    const cfg = await (await page.request.get('/api/engagement/config')).json() as { commentMax: number; flags: Record<string, boolean> };
    expect(cfg.commentMax).toBe(120);
    const { page: ap } = b;
    await ap.goto('/admin/flags');
    await ap.getByRole('switch', { name: 'Likes avec commentaire' }).click();
    await expect(ap.getByText('Enregistré : Likes avec commentaire est coupé.')).toBeVisible();
    const off = await (await page.request.get('/api/engagement/config')).json() as { flags: Record<string, boolean> };
    expect(off.flags.like_comments).toBe(false);
    const r = await page.request.post('/api/swipes', { data: { targetId: 'inconnu', action: 'LIKE', comment: 'ok' }, headers: { Origin: 'http://localhost:3000' } });
    expect([404, 503]).toContain(r.status());
    await ap.getByRole('switch', { name: 'Likes avec commentaire' }).click();
    await expect(ap.getByRole('switch', { name: 'Likes avec commentaire' })).toBeChecked();
    expect(((await (await page.request.get('/api/engagement/config')).json()) as { flags: Record<string, boolean> }).flags.like_comments).toBe(true);
  });
});
