import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Contrôle automatisé WCAG 2.2 A/AA sur les pages publiques, en thème clair ET sombre (n'élimine pas le besoin d'un audit manuel).
const PAGES = ['/', '/login', '/register', '/pricing', '/help', '/about', '/how-it-works', '/blog', '/contact', '/legal/terms', '/legal/privacy', '/legal/cookies', '/legal/community', '/en'];
for (const scheme of ['light', 'dark'] as const) {
  for (const path of PAGES) {
    test(`accessibilité ${path} (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.map((v) => `${v.id} (${v.nodes.length}) ${v.help} :: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    });
  }
}
