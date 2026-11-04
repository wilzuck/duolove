import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../api';
import { errorMessage } from '../errors';

afterEach(() => vi.restoreAllMocks());

describe('client API', () => {
  it('transforme une erreur serveur en ApiError avec code stable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'DAILY_LIMIT', message: 'x' } }), { status: 403 })));
    await expect(api('/swipes')).rejects.toMatchObject({ status: 403, code: 'DAILY_LIMIT' });
  });
  it('envoie le cookie de session (même origine) et du JSON', async () => {
    const f = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', f);
    await api('/auth/login', { method: 'POST', body: { a: 1 } });
    expect(f).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ credentials: 'same-origin', method: 'POST', body: '{"a":1}' }));
  });
  it('traduit les codes connus et retombe sur un message générique', () => {
    const t = (k: string) => k;
    const has = (k: string) => k === 'errors.DAILY_LIMIT';
    expect(errorMessage(new ApiError(403, 'DAILY_LIMIT', ''), t, has)).toBe('errors.DAILY_LIMIT');
    expect(errorMessage(new ApiError(500, 'WHATEVER', ''), t, has)).toBe('errors.INTERNAL_ERROR');
    expect(errorMessage(new Error('boom'), t, has)).toBe('errors.GENERIC');
  });
});
