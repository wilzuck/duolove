import { expect, test } from '@playwright/test';

test('pages publiques FR/EN, SEO et protection des espaces privés', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Deux cœurs');
  await page.goto('/en');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Two hearts');
  for (const p of ['/how-it-works', '/pricing', '/about', '/blog', '/contact', '/help', '/legal/terms', '/legal/privacy', '/legal/cookies', '/legal/community', '/blog/avoid-romance-scams']) {
    const r = await request.get(p);
    expect(r.status(), p).toBe(200);
  }
  expect((await request.get('/page-inexistante')).status()).toBe(404);
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Disallow: /messages');
  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('/pricing');
  expect(sitemap).not.toContain('/messages');
  // espace membre sans session → redirigé vers la connexion
  await page.goto('/discover');
  await expect(page).toHaveURL(/login/);
});
