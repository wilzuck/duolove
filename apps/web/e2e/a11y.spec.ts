import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Contrôle automatisé WCAG 2.2 A/AA sur les pages publiques (n'élimine pas le besoin d'un audit manuel).
for (const path of ['/', '/login', '/register', '/pricing', '/help', '/en']) {
  test(`accessibilité ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((v) => `${v.id} (${v.nodes.length}) ${v.help}`)).toEqual([]);
  });
}
