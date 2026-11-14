import { describe, expect, it } from 'vitest';
import { isInjectedScriptError, isOpaqueScriptError } from '../reportError';

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

describe('erreurs des scripts injectés (navigateur Facebook, extensions)', () => {
  const err = (stack: string) => Object.assign(new Error('x'), { stack });
  it('écarte une trace entièrement dans iabjs:// ou une extension', () => {
    expect(isInjectedScriptError(err('Error: Error invoking postMessage: Java object is gone\n    at sendDataToNative (iabjs://abc:1:11722)\n    at sendBeforeUnloadMessage (iabjs://abc:1:15376)'))).toBe(true);
    expect(isInjectedScriptError(err('TypeError: x\n    at f (chrome-extension://abcdef/content.js:3:9)'))).toBe(true);
  });
  it('garde nos erreurs, même appelées depuis un script injecté', () => {
    expect(isInjectedScriptError(err('TypeError: x\n    at f (https://crushduo.com/_next/static/chunks/a.js:1:2)\n    at g (iabjs://abc:1:3)'))).toBe(false);
    expect(isInjectedScriptError(err('Error: sans emplacement'))).toBe(false);
    expect(isInjectedScriptError('texte')).toBe(false);
  });
});
