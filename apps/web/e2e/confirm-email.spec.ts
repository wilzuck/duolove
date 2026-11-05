import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { emailCode, newMember, PASSWORD, persona, uid, NOTICE_SEEN } from './helpers';

// Confirmation de l'e-mail par code : écran obligatoire après l'inscription, garde de toute l'application, essais limités, renvoi, suppression des comptes non confirmés.
const DB = 'postgresql://admin@localhost:5432/duomatch_test';
const sql = (q: string) => execFileSync('psql', [DB, '-Atc', q], { encoding: 'utf8' }).trim();
const axeOf = async (page: Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map((v) => `${v.id} (${v.nodes.length}) ${v.help}`);

async function fillRegister(page: Page, p: ReturnType<typeof persona>) {
  await page.goto('/register');
  await page.getByLabel('Prénom ou pseudonyme').fill(p.name);
  await page.getByLabel('Adresse e-mail').fill(p.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Date de naissance' }).click();
  await page.locator('.rdp-years_dropdown').selectOption('1995');
  await page.locator('.rdp-months_dropdown').selectOption('3');
  await page.getByRole('dialog').getByRole('button', { name: /20 avril 1995/ }).click();
  await page.getByLabel('Genre').selectOption({ label: p.gender });
  await page.getByLabel('Pays').selectOption('TG');
  await page.getByLabel('Ville').fill(p.city);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
}

test.describe.serial('Confirmation de l’e-mail par code', () => {
  const me = persona('Nina', 'Femme', `Ville${uid()}`);
  let m: Awaited<ReturnType<typeof newMember>>;
  test.beforeAll(async ({ browser }) => { m = await newMember(browser); });
  test.afterAll(async () => { sql(`delete from "SystemSetting" where key like 'signup.%'`); await m.ctx.close(); });

  test('après l’inscription : écran de saisie du code, adresse masquée, suppression automatique annoncée, accessible', async () => {
    const { page } = m;
    await fillRegister(page, me);
    await expect(page).toHaveURL(/confirm-email/);
    await expect(page.getByRole('heading', { name: 'Confirmez votre e-mail', level: 1 })).toBeVisible();
    await expect(page.getByText(/code à 6 chiffres à ni•+@e2e\.duomatch/)).toBeVisible(); // adresse partiellement masquée
    await expect(page.getByText(/valable 15 minutes/)).toBeVisible();
    await expect(page.getByText(/un compte non confirmé est supprimé automatiquement après 72 h/)).toBeVisible(); // durée par défaut
    await expect(page.getByRole('button', { name: /Renvoyer le code dans \d+ s/ })).toBeDisabled(); // pas de renvoi immédiat
    await expect(page.getByRole('button', { name: 'Confirmer', exact: true })).toBeDisabled(); // 6 chiffres requis
    expect(await axeOf(page)).toEqual([]);
  });

  test('rien d’autre n’est accessible avant la confirmation (pages et API)', async ({ request }) => {
    const { page } = m;
    for (const p of ['/discover', '/profile', '/messages', '/onboarding', '/settings']) {
      await page.goto(p);
      await expect(page).toHaveURL(/confirm-email/);
    }
    const r = await page.request.get('/api/discovery', { headers: { Origin: 'http://localhost:3000' } });
    expect(r.status()).toBe(403);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(await emailCode(request, me.email)).toMatch(/^\d{6}$/);
  });

  test('mauvais codes : essais comptés, puis nouveau code obligatoire ; le bon code ouvre l’application', async ({ request }) => {
    const { page } = m;
    await page.goto('/confirm-email');
    const good = await emailCode(request, me.email);
    const bad = good === '000000' ? '111111' : '000000';
    await page.getByLabel('Code de confirmation').fill(bad);
    await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
    await expect(page.getByText('Code incorrect. Il vous reste 4 essais.')).toBeVisible();
    for (const left of [3, 2, 1]) {
      await page.getByLabel('Code de confirmation').fill(bad);
      await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
      await expect(page.getByText(left === 1 ? 'Il vous reste 1 essai.' : `Il vous reste ${left} essais.`)).toBeVisible();
    }
    await page.getByLabel('Code de confirmation').fill(bad);
    await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
    await expect(page.getByText(/Plus d’essai : demandez un nouveau code/)).toBeVisible();
    await page.getByLabel('Code de confirmation').fill(good);
    await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
    await expect(page.getByText('Ce code a expiré. Demandez-en un nouveau.')).toBeVisible(); // même le bon code ne passe plus
    // Le délai de renvoi (30 s) est écoulé : on avance l'horloge de la base, puis on demande un nouveau code.
    sql(`update "EmailCode" set "createdAt" = (now() at time zone 'utc') - interval '2 minutes' where "userId" = (select id from "User" where email = '${me.email}')`);
    await page.reload();
    await page.getByRole('button', { name: 'Renvoyer le code', exact: true }).click();
    await expect(page.getByText('Un nouveau code vient d’être envoyé.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Renvoyer le code dans \d+ s/ })).toBeDisabled();
    const fresh = await emailCode(request, me.email);
    await page.getByLabel('Code de confirmation').fill(fresh);
    await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
    await expect(page).toHaveURL(/onboarding/);
    await page.goto('/discover');
    await expect(page).not.toHaveURL(/confirm-email/);
  });

  test('un compte confirmé ne revoit plus l’écran ; un compte jamais confirmé est supprimé après la durée réglée par l’admin', async ({ browser, request }) => {
    const { page } = m;
    await page.goto('/confirm-email');
    await expect(page).not.toHaveURL(/confirm-email/); // déjà confirmé : redirigé vers l'application
    const other = persona('Sam', 'Homme', `Ville${uid()}`);
    const ctx = await browser.newContext({ locale: 'fr-FR', storageState: NOTICE_SEEN });
    const op = await ctx.newPage();
    await fillRegister(op, other);
    await expect(op).toHaveURL(/confirm-email/);
    expect(sql(`select count(*) from "User" where email = '${other.email}'`)).toBe('1');
    sql(`update "User" set "createdAt" = (now() at time zone 'utc') - interval '5 days' where email = '${other.email}'`);
    // Équivalent de la tâche horaire (réglage par défaut 72 h) : exécutée via la base de test par l'API de maintenance.
    const purged = execFileSync('bash', ['-lc', `cd "${process.cwd()}/../../backend" && NODE_ENV=test DATABASE_URL=${DB} .venv/bin/python -c "import asyncio; from app.db.session import session_maker, dispose; from app.core import authsvc\nasync def m():\n    async with session_maker()() as s:\n        print(await authsvc.purge_unverified(s))\n    await dispose()\nasyncio.run(m())"`], { encoding: 'utf8' }).trim().split('\n').pop();
    expect(Number(purged)).toBeGreaterThanOrEqual(1);
    expect(sql(`select count(*) from "User" where email = '${other.email}'`)).toBe('0');
    await ctx.close();
    expect(request).toBeTruthy();
  });
});
