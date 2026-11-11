import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { completeOnboarding, newMember, persona, signUp, uid } from './helpers';

// Appels audio/vidéo en mode simulé (aucun fournisseur vidéo configuré) : sonnerie, réponse, raccrocher, refus, manqué.
const DB = process.env.E2E_DATABASE_URL ?? 'postgresql://admin@localhost:5432/duomatch_test'; // CI : base de GitHub (utilisateur postgres avec mot de passe)
const sql = (q: string) => execFileSync('psql', [DB, '-Atc', q], { encoding: 'utf8' }).trim();
const premium = (email: string) => sql(`update "Entitlement" set plan = 'PREMIUM', "validUntil" = now() + interval '30 days' where "userId" = (select id from "User" where email = '${email}')`); // idées, rendez-vous et appels : réservés à Premium et VIP
const ORIGIN = { Origin: 'http://localhost:3000' };
const axeOf = async (page: Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map((v) => `${v.id} (${v.nodes.length}) ${v.help}`);

test.describe.serial('Appels audio et vidéo', () => {
  const city = `Ville${uid()}`;
  const awa = persona('Awa', 'Femme', city);
  const yao = persona('Yao', 'Homme', city);
  let a: Awaited<ReturnType<typeof newMember>>;
  let y: Awaited<ReturnType<typeof newMember>>;
  let conv = '';

  test.beforeAll(async ({ browser }) => { a = await newMember(browser); y = await newMember(browser); });
  test.afterAll(async () => { sql(`update "SubscriptionPlan" set features = features || '{"calls_enabled": false}'::jsonb where code = 'PREMIUM'`); await a.ctx.close(); await y.ctx.close(); });

  test('préparation : deux membres, match réciproque, conversation ouverte des deux côtés', async ({ request }) => {
    for (const [m, p] of [[a, awa], [y, yao]] as const) { await signUp(m.page, request, p); await completeOnboarding(m.page, p); }
    premium(awa.email); premium(yao.email);
    // Les appels sont coupés par défaut pour toutes les formules : on les active pour Premium (le cache des formules dure 15 s côté API).
    sql(`update "SubscriptionPlan" set features = features || '{"calls_enabled": true}'::jsonb where code = 'PREMIUM'`);
    await a.page.waitForTimeout(16_000);
    const yaoId = ((await (await y.page.request.get('/api/users/me')).json()) as { id: string }).id;
    const awaId = ((await (await a.page.request.get('/api/users/me')).json()) as { id: string }).id;
    await a.page.request.post('/api/swipes', { data: { targetId: yaoId, action: 'LIKE' }, headers: ORIGIN });
    const r = await y.page.request.post('/api/swipes', { data: { targetId: awaId, action: 'LIKE' }, headers: ORIGIN });
    conv = ((await r.json()) as { match: { conversationId: string } }).match.conversationId;
    await a.page.goto(`/messages/${conv}`);
    await y.page.goto(`/messages/${conv}`);
    await expect(a.page.getByRole('button', { name: 'Appel audio' })).toBeVisible();
    await expect(a.page.getByRole('button', { name: 'Appel vidéo' })).toBeVisible();
  });

  test('appel audio : sonnerie, réponse, appel en cours (mention « simulé », accessible), raccrocher', async () => {
    await a.page.getByRole('button', { name: 'Appel audio' }).click();
    await expect(a.page.getByRole('dialog', { name: /Appel de Yao/ })).toBeVisible();
    const incoming = y.page.getByRole('dialog', { name: /vous appelle/ });
    await expect(incoming).toBeVisible();
    await expect(incoming.getByText('Appel audio entrant')).toBeVisible();
    expect(await axeOf(y.page)).toEqual([]);
    await incoming.getByRole('button', { name: 'Répondre' }).click();
    await expect(y.page.getByRole('dialog', { name: /Appel en cours/ })).toBeVisible();
    await expect(a.page.getByRole('dialog', { name: /Appel en cours/ })).toBeVisible();
    await expect(y.page.getByText(/Appel simulé/)).toBeVisible();
    await expect(y.page.getByText(/jamais enregistré/)).toBeVisible();
    await y.page.getByRole('button', { name: 'Couper le micro' }).click();
    await expect(y.page.getByRole('button', { name: 'Réactiver le micro' })).toHaveAttribute('aria-pressed', 'true');
    expect(await axeOf(a.page)).toEqual([]);
    await a.page.getByRole('button', { name: 'Raccrocher' }).last().click();
    await expect(a.page.getByRole('dialog', { name: /Appel en cours/ })).toHaveCount(0);
    await expect(y.page.getByRole('dialog', { name: /Appel en cours/ })).toHaveCount(0);
    await expect(y.page.getByText('Appel terminé.')).toBeVisible();
  });

  test('appel vidéo refusé : l’appelant est prévenu avec douceur ; on peut rappeler', async () => {
    await a.page.getByRole('button', { name: 'Appel vidéo' }).click();
    const incoming = y.page.getByRole('dialog', { name: /vous appelle/ });
    await expect(incoming.getByText('Appel vidéo entrant')).toBeVisible();
    await incoming.getByRole('button', { name: 'Refuser', exact: true }).last().click();
    await expect(a.page.getByText(/Yao n’est pas disponible pour le moment/)).toBeVisible();
    await expect(a.page.getByRole('dialog', { name: /Appel de Yao/ })).toHaveCount(0);
  });

  test('appel annulé par l’appelant, puis appel manqué (sonnerie expirée) avec notification', async () => {
    await a.page.getByRole('button', { name: 'Appel audio' }).click();
    await expect(y.page.getByRole('dialog', { name: /vous appelle/ })).toBeVisible();
    await a.page.getByRole('button', { name: 'Annuler' }).last().click();
    await expect(y.page.getByRole('dialog', { name: /vous appelle/ })).toHaveCount(0);
    await a.page.getByRole('button', { name: 'Appel audio' }).click();
    await expect(y.page.getByRole('dialog', { name: /vous appelle/ })).toBeVisible();
    sql(`update "CallSession" set "ringExpiresAt" = (now() at time zone 'utc') - interval '1 second' where status = 'RINGING'`);
    await expect(y.page.getByRole('dialog', { name: /vous appelle/ })).toHaveCount(0, { timeout: 15_000 });
    await expect(a.page.getByText(/Yao n’a pas répondu/)).toBeVisible({ timeout: 15_000 });
    await y.page.goto('/notifications');
    await expect(y.page.getByText('Appel manqué.')).toBeVisible();
  });

  test('après un blocage, plus d’appel possible', async () => {
    await y.page.goto(`/messages/${conv}`);
    const awaId = ((await (await a.page.request.get('/api/users/me')).json()) as { id: string }).id;
    await y.page.request.post(`/api/blocks/${awaId}`, { data: {}, headers: ORIGIN });
    const r = await a.page.request.post(`/api/conversations/${conv}/calls`, { data: { kind: 'AUDIO' }, headers: ORIGIN });
    expect(r.status()).toBe(403);
  });
});
