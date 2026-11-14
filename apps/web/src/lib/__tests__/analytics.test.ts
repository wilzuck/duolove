import { afterEach, describe, expect, it, vi } from 'vitest';
import { trackSignUp } from '../analytics';

const withConsent = (value: string | null, dataLayer?: unknown[]) => {
  vi.stubGlobal('localStorage', { getItem: () => value, setItem: () => undefined });
  vi.stubGlobal('window', dataLayer ? { dataLayer } : {});
};

describe('mesure des inscriptions (sign_up)', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("n'envoie rien sans l'accord du visiteur", async () => {
    const dl: unknown[] = [];
    withConsent('denied', dl);
    await trackSignUp('email');
    withConsent(null, dl);
    await trackSignUp('email');
    expect(dl).toHaveLength(0);
  });

  it("n'envoie rien si GTM n'est pas chargé", async () => {
    withConsent('granted');
    await expect(trackSignUp('google')).resolves.toBeUndefined();
  });

  it("pousse l'événement sans donnée personnelle et attend la fin des balises", async () => {
    const dl: Record<string, unknown>[] = [];
    withConsent('granted', dl);
    const done = trackSignUp('email');
    expect(dl).toHaveLength(1);
    const { eventCallback, eventTimeout, ...payload } = dl[0]!;
    expect(payload).toEqual({ event: 'sign_up', method: 'email' });
    expect(eventTimeout).toBe(1500);
    (eventCallback as () => void)();
    await expect(done).resolves.toBeUndefined();
  });

  it("n'attend jamais plus que le délai si GTM ne répond pas (bloqueur)", async () => {
    vi.useFakeTimers();
    const dl: unknown[] = [];
    withConsent('granted', dl);
    let resolved = false;
    void trackSignUp('google', 1000).then(() => { resolved = true; });
    await vi.advanceTimersByTimeAsync(999);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);
  });
});
