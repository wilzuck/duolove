import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Chaque entrée du menu admin (AdminShell) doit avoir sa description dans le guide (« Le menu en un coup d'œil »), en français et en anglais.
const shell = readFileSync(join(__dirname, '../../components/admin/AdminShell.tsx'), 'utf8');
const keys = [...shell.matchAll(/key: '([a-zA-Z]+)'/g)].map((m) => m[1]).filter((k) => k !== 'guide');

describe('guide de l’administration', () => {
  for (const locale of ['fr', 'en']) {
    it(`décrit chaque entrée du menu (${locale})`, () => {
      const msgs = JSON.parse(readFileSync(join(__dirname, `../../../messages/${locale}.json`), 'utf8'));
      expect(keys.length).toBeGreaterThan(10);
      expect(keys.filter((k) => !msgs.admin.guide.what[k] || !msgs.admin.nav[k])).toEqual([]);
    });
  }
});
