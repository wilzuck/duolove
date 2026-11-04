import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { completeOnboarding, newMember, persona, signUp, uid } from './helpers';

// Phase 2 : brise-glace, réactions, réponses, emoji au curseur, accusés de lecture réservés aux abonnés, contrôle admin.
const DB = 'postgresql://admin@localhost:5432/duomatch_test';
const sql = (q: string) => execFileSync('psql', [DB, '-Atc', q], { encoding: 'utf8' }).trim();
const ORIGIN = { Origin: 'http://localhost:3000' };
const axeOf = async (page: Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map((v) => `${v.id} (${v.nodes.length}) ${v.help}`);

test.describe.serial('Messagerie enrichie', () => {
  const city = `Ville${uid()}`;
  const awa = persona('Awa', 'Femme', city);
  const yao = persona('Yao', 'Homme', city);
  const boss = persona('Admin', 'Homme', `Ville${uid()}`);
  let a: Awaited<ReturnType<typeof newMember>>;
  let y: Awaited<ReturnType<typeof newMember>>;
  let b: Awaited<ReturnType<typeof newMember>>;
  let conv = '';
  const ICE: string[] = [];

  test.beforeAll(async ({ browser }) => { a = await newMember(browser); y = await newMember(browser); b = await newMember(browser); });
  test.afterAll(async () => { sql(`delete from "FeatureFlag"`); sql(`update "IcebreakerTemplate" set active = true where slug not like 'e2e-%'`); await a.ctx.close(); await y.ctx.close(); await b.ctx.close(); });

  test('préparation : deux membres avec des centres d’intérêt communs, match réciproque', async ({ request }) => {
    for (const [m, p] of [[a, awa], [y, yao]] as const) { await signUp(m.page, request, p); await completeOnboarding(m.page, p); }
    const yaoId = ((await (await y.page.request.get('/api/users/me')).json()) as { id: string }).id;
    const awaId = ((await (await a.page.request.get('/api/users/me')).json()) as { id: string }).id;
    await a.page.request.post('/api/swipes', { data: { targetId: yaoId, action: 'LIKE' }, headers: ORIGIN });
    const r = await y.page.request.post('/api/swipes', { data: { targetId: awaId, action: 'LIKE' }, headers: ORIGIN });
    conv = ((await r.json()) as { match: { conversationId: string } }).match.conversationId;
    expect(conv).toBeTruthy();
  });

  test('brise-glace : idées fondées sur l’en commun, rien n’est envoyé, « autres idées »', async () => {
    const { page } = a;
    await page.goto(`/messages/${conv}`);
    await page.getByRole('button', { name: 'Idées pour commencer' }).click();
    const panel = page.getByRole('region', { name: 'Besoin d’une idée pour commencer ?' });
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/Rien n’est envoyé/)).toBeVisible();
    await expect(panel.getByText(/En commun : .*Musique/)).toBeVisible();
    const items = panel.getByRole('listitem');
    await expect(items).toHaveCount(3);
    ICE.push(...(await items.allInnerTexts()));
    expect(await axeOf(page)).toEqual([]);
    await panel.getByRole('button', { name: 'Autres idées' }).click();
    await expect(items).toHaveCount(3);
    const pick = (await items.first().innerText()).trim();
    await items.first().click();
    await expect(page.getByRole('textbox', { name: 'Écrire un message…' })).toHaveValue(pick); // inséré, modifiable
    await expect(page.getByRole('log').getByText(pick)).toHaveCount(0); // pas envoyé
    await page.getByRole('textbox', { name: 'Écrire un message…' }).fill('Salut Yao, quelle belle journée !');
    await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
    await expect(page.getByRole('log').getByText('Salut Yao, quelle belle journée !')).toBeVisible();
  });

  test('emoji inséré à l’endroit du curseur', async () => {
    const { page } = a;
    const box = page.getByRole('textbox', { name: 'Écrire un message…' });
    await box.fill('AB');
    await box.press('Home');
    await box.press('ArrowRight');
    await page.getByRole('button', { name: 'Émojis' }).click();
    await page.getByRole('button', { name: '😀' }).click();
    await expect(box).toHaveValue('A😀B');
    await box.fill('');
  });

  test('réactions : Yao réagit, Awa voit la réaction en direct', async () => {
    const { page } = y;
    await page.goto(`/messages/${conv}`);
    const bubble = page.getByRole('log').getByText('Salut Yao, quelle belle journée !');
    await expect(bubble).toBeVisible();
    await bubble.click();
    await page.getByRole('button', { name: 'Réagir', exact: true }).first().click();
    await page.getByRole('button', { name: 'Réagir avec ❤️' }).click();
    await expect(page.getByRole('button', { name: 'Réaction ❤️ : 1' })).toHaveAttribute('aria-pressed', 'true');
    const seen = a.page.getByRole('button', { name: 'Réaction ❤️ : 1' });
    await expect(seen).toBeVisible();
    await expect(seen).toHaveAttribute('aria-pressed', 'false');
    // Retirer sa réaction en cliquant dessus.
    await page.getByRole('button', { name: 'Réaction ❤️ : 1' }).click();
    await expect(page.getByRole('button', { name: /Réaction ❤️/ })).toHaveCount(0);
  });

  test('réponse à un message précis : citation visible des deux côtés', async () => {
    const { page } = y;
    await page.getByRole('log').getByText('Salut Yao, quelle belle journée !').click();
    await page.getByRole('button', { name: 'Répondre' }).first().click();
    await expect(page.getByText('Réponse à Awa')).toBeVisible();
    await page.getByRole('textbox', { name: 'Écrire un message…' }).fill('Oui, superbe ! Et toi ?');
    await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
    await expect(page.getByText('Réponse à Awa')).toHaveCount(0); // bandeau fermé après l'envoi
    const quote = a.page.getByRole('log').locator('blockquote').filter({ hasText: 'Salut Yao, quelle belle journée !' });
    await expect(quote).toBeVisible();
    await expect(a.page.getByRole('log').getByText('Oui, superbe ! Et toi ?')).toBeVisible();
  });

  test('accusés de lecture : réglage verrouillé en gratuit, libre en Premium ; indicateur de saisie facultatif', async () => {
    const { page } = y;
    await page.goto('/settings?tab=privacy');
    const receipts = page.getByRole('switch', { name: 'Accusés de lecture' });
    await expect(receipts).toBeDisabled();
    await expect(receipts).toBeChecked();
    await expect(page.getByText(/réservée aux abonnés Premium et VIP/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Passer Premium' }).first()).toBeVisible();
    expect(await axeOf(page)).toEqual([]);
    const typing = page.getByRole('switch', { name: 'Indicateur de saisie' });
    await expect(typing).toBeChecked();
    await typing.click();
    await expect(typing).not.toBeChecked();
    await typing.click();
    // Premium : la gestion devient disponible.
    sql(`update "Entitlement" set plan = 'PREMIUM', "validUntil" = now() + interval '30 days' where "userId" = (select id from "User" where email = '${yao.email}')`);
    await page.reload();
    await expect(page.getByRole('switch', { name: 'Accusés de lecture' })).toBeEnabled();
    await page.getByRole('switch', { name: 'Accusés de lecture' }).click();
    await expect(page.getByRole('switch', { name: 'Accusés de lecture' })).not.toBeChecked();
    await page.reload();
    await expect(page.getByRole('switch', { name: 'Accusés de lecture' })).not.toBeChecked();
  });

  test('admin : couper brise-glace et réactions retire les fonctions ; modèle de brise-glace géré', async ({ request }) => {
    const { page } = b;
    await signUp(page, request, boss);
    sql(`update "User" set role='ADMIN' where email='${boss.email}'`);
    await page.goto('/admin/engagement');
    await page.getByRole('tab', { name: 'Brise-glace' }).click();
    const slug = `e2e-${uid()}`;
    await page.getByLabel('Clé technique').fill(slug);
    await page.getByLabel('Type').selectOption('GENERIC');
    await page.getByLabel('Texte (français)', { exact: true }).first().fill('Quelle est ta chanson du moment ?');
    await page.getByLabel('Texte (anglais)', { exact: true }).first().fill('What is your song of the moment?');
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(page.getByText('Question ajoutée.')).toBeVisible();
    await expect(page.getByText(slug)).toBeVisible();
    expect(await axeOf(page)).toEqual([]);
    await page.goto('/admin/flags');
    await page.getByRole('switch', { name: 'Brise-glace' }).click();
    await expect(page.getByText('Enregistré : Brise-glace est coupé.')).toBeVisible();
    await page.getByRole('switch', { name: 'Réactions aux messages' }).click();
    await expect(page.getByText('Enregistré : Réactions aux messages est coupé.')).toBeVisible();
    const { page: ap } = a;
    await ap.goto(`/messages/${conv}`);
    await expect(ap.getByRole('textbox', { name: 'Écrire un message…' })).toBeVisible();
    await expect(ap.getByRole('button', { name: 'Idées pour commencer' })).toHaveCount(0);
    await ap.getByRole('log').getByText('Salut Yao, quelle belle journée !', { exact: true }).first().click();
    await expect(ap.getByRole('button', { name: 'Réagir', exact: true })).toHaveCount(0);
    await expect(ap.getByRole('button', { name: 'Répondre' }).first()).toBeVisible(); // les réponses restent actives
    const refused = await ap.request.get(`/api/conversations/${conv}/icebreakers`);
    expect(refused.status()).toBe(503);
  });
});
