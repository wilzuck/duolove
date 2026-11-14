import { describe, expect, it } from 'vitest';
import { isOpaqueScriptError } from '../reportError';

describe('erreurs de scripts tiers', () => {
  it('écarte « Script error. » sans détail (script d’un autre domaine)', () => {
    expect(isOpaqueScriptError({ message: 'Script error.', error: null })).toBe(true);
    expect(isOpaqueScriptError({ message: 'Script error', error: undefined })).toBe(true);
  });
  it('garde nos vraies erreurs', () => {
    expect(isOpaqueScriptError({ message: 'Script error.', error: new Error('x') })).toBe(false);
    expect(isOpaqueScriptError({ message: "Cannot read properties of undefined (reading 'id')", error: null })).toBe(false);
  });
});
