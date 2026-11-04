import { describe, expect, it } from 'vitest';
import { formatXof, timeAgo } from '../format';

describe('format', () => {
  it('formate les montants en FCFA selon la langue', () => {
    expect(formatXof(2500, 'en').replace(/\s/g, ' ')).toBe('2,500 FCFA');
    expect(formatXof(2500, 'fr').replace(/[\s  ]/g, ' ')).toBe('2 500 FCFA');
  });
  it('exprime le temps relatif dans la langue demandée', () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    expect(timeAgo(tenMinAgo, 'fr')).toMatch(/10 minutes/);
    expect(timeAgo(tenMinAgo, 'en')).toMatch(/10 minutes ago/);
  });
});
