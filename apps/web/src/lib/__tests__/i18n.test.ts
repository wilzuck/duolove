import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('catalogue de traductions', () => {
  it('FR et EN sont alignés et chaque clé utilisée dans le code existe', () => {
    const out = execFileSync('node', ['scripts/i18n-check.mjs'], { encoding: 'utf8' });
    expect(out).toContain('i18n OK');
  });
});
