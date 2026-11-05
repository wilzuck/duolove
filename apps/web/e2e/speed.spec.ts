import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { completeOnboarding, newMember, persona, signUp, uid } from './helpers';

// Speed dating en texte : publication par l'admin, inscription, salle chronométrée, message, choix privés, match réciproque.
const DB = 'postgresql://admin@localhost:5432/duomatch_test';
const sql = (q: string) => execFileSync('psql', [DB, '-Atc', q], { encoding: 'utf8' }).trim();
const axeOf = async (page: Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map((v) => `${v.id} (${v.nodes.length}) ${v.help}`);

test.describe.serial('Speed dating', () => {
  const city = `Ville${uid()}`;
  const people = [persona('Awa', 'Femme', city), persona('Yao', 'Homme', city), persona('Mia', 'Femme', city), persona('Kofi', 'Homme', city)];
  const boss = persona('Admin', 'Homme', `Ville${uid()}`);
  let m: Awaited<ReturnType<typeof newMember>>[] = [];
  let b: Awaited<ReturnType<typeof newMember>>;
  const title = `Soirée ${uid()}`;
  let eventId = '';

  test.beforeAll(async ({ browser }) => { m = [await newMember(browser), await newMember(browser), await newMember(browser), await newMember(browser)]; b = await newMember(browser); });
  test.afterAll(async () => { sql(`delete from "SpeedEvent"`); for (const x of [...m, b]) await x.ctx.close(); });

  test('préparation : quatre membres et un administrateur', async ({ request }) => {
    for (let i = 0; i < 4; i++) { await signUp(m[i]!.page, request, people[i]!); await completeOnboarding(m[i]!.page, people[i]!); }
    await signUp(b.page, request, boss);
    sql(`update "User" set role='ADMIN' where email='${boss.email}'`);
  });

  test('l’administrateur publie une session (accessible) ; elle apparaît dans la liste', async () => {
    await b.page.goto('/admin/speed');
    await b.page.getByLabel('Titre').fill(title);
    await b.page.getByLabel('Ville (facultative)').fill(city);
    await b.page.getByLabel('Nombre d’échanges').fill('3');
    expect(await axeOf(b.page)).toEqual([]);
    await b.page.getByRole('button', { name: 'Publier la session' }).click();
    await expect(b.page.getByText('Session publiée.')).toBeVisible();
    await expect(b.page.getByRole('cell', { name: title })).toBeVisible();
    eventId = sql(`select id from "SpeedEvent" where title='${title}'`);
  });

  test('les membres s’inscrivent (la page explique le déroulé et la sécurité)', async () => {
    const p = m[0]!.page;
    await p.goto('/speed');
    await expect(p.getByRole('heading', { name: 'Speed dating', level: 1 })).toBeVisible();
    await expect(p.getByText(/gardez vos coordonnées pour après le match/)).toBeVisible();
    expect(await axeOf(p)).toEqual([]);
    await p.getByRole('listitem').filter({ hasText: title }).getByRole('button', { name: 'Je m’inscris' }).click();
    await expect(p.getByText('Inscription enregistrée')).toBeVisible();
    for (let i = 1; i < 4; i++) {
      await m[i]!.page.goto('/speed');
      await m[i]!.page.getByRole('listitem').filter({ hasText: title }).getByRole('button', { name: 'Je m’inscris' }).click();
      await expect(m[i]!.page.getByText('Inscription enregistrée')).toBeVisible();
    }
  });

  test('à l’heure dite : salle, binôme, messages filtrés, choix privé', async () => {
    sql(`update "SpeedEvent" set "startsAt" = (now() at time zone 'utc') - interval '10 seconds' where id='${eventId}'`);
    for (const x of m) await x.page.goto(`/speed/${eventId}`);
    const a = m[0]!.page;
    await expect(a.getByText('Échange 1 sur 3')).toBeVisible();
    await expect(a.getByText('Yao, ').or(a.getByText('Kofi, ')).first()).toBeVisible();
    const box = a.getByLabel('Écrivez un message…');
    await box.fill('écris-moi à moi@x.com');
    await a.getByRole('button', { name: 'Envoyer' }).click();
    await expect(a.getByText(/gardez vos coordonnées pour après le match/).last()).toBeVisible();
    await box.fill('Quel est ton plat préféré ?');
    await a.getByRole('button', { name: 'Envoyer' }).click();
    await expect(a.getByRole('log').getByText('Quel est ton plat préféré ?')).toBeVisible();
    const partner = (await a.getByText(/^(Yao|Kofi), \d+/).first().innerText()).startsWith('Yao') ? m[1]! : m[3]!;
    await expect(partner.page.getByRole('log').getByText('Quel est ton plat préféré ?')).toBeVisible({ timeout: 10_000 });
    expect(await axeOf(a)).toEqual([]);
    await a.getByRole('button', { name: 'Je veux le/la revoir' }).click();
    await expect(a.getByRole('button', { name: 'Je veux le/la revoir' })).toHaveAttribute('aria-pressed', 'true');
    await partner.page.getByRole('button', { name: 'Je veux le/la revoir' }).click();
    await expect(partner.page.getByRole('button', { name: 'Je veux le/la revoir' })).toHaveAttribute('aria-pressed', 'true');
    await expect(partner.page.getByText(/Votre choix reste privé/)).toBeVisible();
  });

  test('fin de session : intérêt réciproque = match avec conversation ouverte ; les autres ne voient aucun rejet', async () => {
    sql(`update "SpeedEvent" set "startsAt" = (now() at time zone 'utc') - interval '3 hours' where id='${eventId}'`);
    const a = m[0]!.page;
    await a.goto(`/speed/${eventId}`);
    await expect(a.getByText('Vous avez un match !')).toBeVisible();
    await expect(a.getByRole('link', { name: 'Ouvrir la conversation' })).toBeVisible();
    expect(await axeOf(a)).toEqual([]);
    const none = m[2]!.page;
    await none.goto(`/speed/${eventId}`);
    await expect(none.getByText(/Pas de match cette fois/)).toBeVisible();
    expect(sql(`select count(*) from "Match"`)).not.toBe('0');
  });
});
