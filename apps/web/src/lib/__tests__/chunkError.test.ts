import { afterEach, describe, expect, it, vi } from 'vitest';
import { isChunkError, reloadOnceForChunkError } from '../chunkError';

describe('erreurs de chargement après un déploiement', () => {
  it('reconnaît les erreurs de chunk des navigateurs, pas les autres', () => {
    expect(isChunkError(Object.assign(new Error('Loading chunk 123 failed.'), { name: 'ChunkLoadError' }))).toBe(true);
    expect(isChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/_next/a.js'))).toBe(true);
    expect(isChunkError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkError(null)).toBe(false);
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it('ne recharge qu’une fois par minute', () => {
    const store = new Map<string, string>();
    const reload = vi.fn();
    vi.stubGlobal('window', { location: { reload } });
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    const err = Object.assign(new Error('Loading chunk 9 failed'), { name: 'ChunkLoadError' });
    expect(reloadOnceForChunkError(err)).toBe(true);
    expect(reloadOnceForChunkError(err)).toBe(false);  // boucle évitée
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reloadOnceForChunkError(new Error('autre'))).toBe(false);
  });
});
