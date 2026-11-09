import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { completeOnboarding, newMember, persona, signUp, uid } from './helpers';

// Balayage d'accessibilité (WCAG 2.1 AA) de toutes les pages connectées : espace membre et console d'administration.
const DB = process.env.E2E_DATABASE_URL ?? 'postgresql://admin@localhost:5432/duomatch_test'; // CI : base de GitHub (utilisateur postgres avec mot de passe)
const sql = (q: string) => execFileSync('psql', [DB, '-Atc', q], { encoding: 'utf8' }).trim();
const violations = async (page: Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map((v) => `${v.id} (${v.nodes.length}) ${v.help} :: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);

const MEMBER = ['/discover', '/daily', '/likes', '/match', '/messages', '/profile', '/shop', '/premium', '/notifications', '/referral',
  '/settings?tab=account', '/settings?tab=notifications', '/settings?tab=privacy', '/settings?tab=security', '/settings?tab=blocked', '/settings?tab=subscription', '/settings?tab=payments'];
const ADMIN = ['/admin', '/admin/users', '/admin/reports', '/admin/moderation', '/admin/audit-log', '/admin/subscriptions', '/admin/payments', '/admin/refunds', '/admin/plans', '/admin/promos', '/admin/flags', '/admin/blog', '/admin/blog/new', '/admin/engagement'];

test.describe.serial('Accessibilité des pages connectées', () => {
  const city = `Ville${uid()}`;
  const member = persona('Lea', 'Femme', city);
  const boss = persona('Admin', 'Homme', `Ville${uid()}`);
  let m: Awaited<ReturnType<typeof newMember>>;
  let b: Awaited<ReturnType<typeof newMember>>;
  test.beforeAll(async ({ browser }) => { m = await newMember(browser); b = await newMember(browser); });
  test.afterAll(async () => { await m.ctx.close(); await b.ctx.close(); });

  test('espace membre : aucune violation sur les 17 pages (clair et sombre)', async ({ request }) => {
    test.setTimeout(600_000); // 17 pages × 2 thèmes balayées une à une : la durée dépend de la charge de la machine
    await signUp(m.page, request, member);
    await completeOnboarding(m.page, member);
    const found: string[] = [];
    for (const scheme of ['light', 'dark'] as const) {
      await m.page.emulateMedia({ colorScheme: scheme });
      for (const p of MEMBER) {
        await m.page.goto(p);
        await m.page.waitForLoadState('networkidle');
        for (const v of await violations(m.page)) found.push(`${scheme} ${p} → ${v}`);
      }
    }
    expect(found).toEqual([]);
  });

  test('console d’administration : aucune violation sur les 14 pages (clair et sombre)', async ({ request }) => {
    await signUp(b.page, request, boss);
    sql(`update "User" set role='ADMIN' where email='${boss.email}'`);
    test.setTimeout(300_000);
    const found: string[] = [];
    for (const scheme of ['light', 'dark'] as const) {
      await b.page.emulateMedia({ colorScheme: scheme });
      for (const p of ADMIN) {
        await b.page.goto(p);
        await b.page.waitForLoadState('networkidle');
        for (const v of await violations(b.page)) found.push(`${scheme} ${p} → ${v}`);
      }
    }
    expect(found).toEqual([]);
  });
});
