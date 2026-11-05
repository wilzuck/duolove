import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { completeOnboarding, newMember, persona, signUp, uid } from './helpers';

// Question du jour : planifiée par l'admin, réponse volontaire, réponses des autres visibles seulement après avoir répondu.
const DB = 'postgresql://admin@localhost:5432/duomatch_test';
const sql = (q: string) => execFileSync('psql', [DB, '-Atc', q], { encoding: 'utf8' }).trim();
const ORIGIN = { Origin: 'http://localhost:3000' };
const axeOf = async (page: Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map((v) => `${v.id} (${v.nodes.length}) ${v.help}`);

test.describe.serial('Question du jour', () => {
  const city = `Ville${uid()}`;
  const awa = persona('Awa', 'Femme', city);
  const yao = persona('Yao', 'Homme', city);
  const boss = persona('Admin', 'Homme', `Ville${uid()}`);
  let a: Awaited<ReturnType<typeof newMember>>;
  let y: Awaited<ReturnType<typeof newMember>>;
  let b: Awaited<ReturnType<typeof newMember>>;
  const textFr = `TEST Votre soirée idéale ${uid()} ?`;

  test.beforeAll(async ({ browser }) => { a = await newMember(browser); y = await newMember(browser); b = await newMember(browser); });
  test.afterAll(async () => { sql(`delete from "DailyQuestion" where "textFr" like 'TEST %'`); sql(`delete from "FeatureFlag"`); await a.ctx.close(); await y.ctx.close(); await b.ctx.close(); });

  test('préparation : deux membres, un administrateur', async ({ request }) => {
    for (const [m, p] of [[a, awa], [y, yao]] as const) { await signUp(m.page, request, p); await completeOnboarding(m.page, p); }
    await signUp(b.page, request, boss);
    sql(`update "User" set role='ADMIN' where email='${boss.email}'`);
  });

  test('l’administrateur planifie la question d’aujourd’hui (accessible) ; elle apparaît dans la liste', async () => {
    sql(`delete from "DailyQuestion" where day = (now() at time zone 'utc')::date`);
    await b.page.goto('/admin/engagement');
    await b.page.getByRole('tab', { name: 'Question du jour' }).click();
    await b.page.getByLabel('Question (français)').fill(textFr);
    await b.page.getByLabel('Question (anglais)').fill(`TEST Your ideal evening ${uid()}?`);
    await b.page.getByLabel('Choix 1 (français)').fill('Un film à la maison');
    await b.page.getByLabel('Choix 1 (anglais)').fill('A movie at home');
    await b.page.getByLabel('Choix 2 (français)').fill('Une sortie entre amis');
    await b.page.getByLabel('Choix 2 (anglais)').fill('A night out with friends');
    await b.page.getByLabel('Date prévue (facultative)').fill(new Date().toISOString().slice(0, 10));
    expect(await axeOf(b.page)).toEqual([]);
    await b.page.getByRole('button', { name: 'Ajouter la question' }).click();
    await expect(b.page.getByText('Question ajoutée.')).toBeVisible();
    await expect(b.page.getByText(textFr)).toBeVisible();
    await expect(b.page.getByText('Aujourd’hui', { exact: true })).toBeVisible();
  });

  test('Yao répond ; Awa ne voit rien tant qu’elle n’a pas répondu, puis voit la même réponse', async () => {
    await y.page.goto('/daily');
    const yq = y.page.getByTestId('daily-question');
    await expect(yq.getByRole('heading', { name: textFr })).toBeVisible();
    await yq.getByRole('radio', { name: 'Un film à la maison' }).check({ force: true });
    await yq.getByRole('button', { name: 'Répondre' }).click();
    await expect(y.page.getByText('Réponse enregistrée.')).toBeVisible();

    await a.page.goto('/daily');
    const aq = a.page.getByTestId('daily-question');
    await expect(aq.getByText(/Répondez pour voir les réponses/)).toBeVisible();
    await expect(a.page.getByTestId('daily-answer')).toHaveCount(0);  // réciprocité : rien n'est révélé avant d'avoir répondu
    expect(await axeOf(a.page)).toEqual([]);
    await aq.getByRole('radio', { name: 'Un film à la maison' }).check({ force: true });
    await aq.getByRole('button', { name: 'Répondre' }).click();
    const card = a.page.getByRole('article').filter({ hasText: 'Yao' });
    await expect(card.getByTestId('daily-answer')).toContainText('Un film à la maison');
    await expect(card.getByText(/Vous avez choisi la même réponse que Yao/)).toBeVisible();
  });

  test('couper la fonction retire la carte ; les statistiques comptent les réponses', async () => {
    await b.page.goto('/admin/engagement');
    await b.page.getByRole('tab', { name: 'Indicateurs' }).click();
    await expect(b.page.getByText('Réponses à la question du jour (aujourd’hui)')).toBeVisible();
    await b.page.request.put('/api/admin/feature-flags/daily_question', { data: { enabled: false }, headers: ORIGIN });
    await a.page.goto('/daily');
    await expect(a.page.getByTestId('daily-question')).toHaveCount(0);
    await b.page.request.put('/api/admin/feature-flags/daily_question', { data: { enabled: true }, headers: ORIGIN });
  });
});
