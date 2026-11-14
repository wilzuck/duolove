import { describe, expect, it } from 'vitest';
import { convertXof, currencyLabel, currencyOptions, formatMoney, pickCurrency } from '../currency';

const rates = { XOF: 1, XAF: 1, EUR: 1 / 655.957, USD: 0.001683, NGN: 2.25, ZZZ: 0 };
const nb = (s: string) => s.replace(/[  ]/g, ' ');

describe('prix dans la devise du visiteur', () => {
  it('choix enregistré, sinon pays, sinon FCFA', () => {
    expect(pickCurrency({ rates, detected: 'NGN' }, 'EUR')).toBe('EUR');
    expect(pickCurrency({ rates, detected: 'NGN' }, null)).toBe('NGN');
    expect(pickCurrency({ rates, detected: 'NGN' }, 'GBP')).toBe('NGN'); // pas de taux pour le choix enregistré
    expect(pickCurrency({ rates, detected: null }, 'n\'importe quoi')).toBe('XOF');
    expect(pickCurrency(undefined, 'EUR')).toBe('XOF');
  });

  it('convertit, sauf FCFA, taux absent ou nul', () => {
    expect(convertXof(2500, 'EUR', rates)).toBeCloseTo(3.81, 2);
    expect(convertXof(2500, 'XAF', rates)).toBe(2500);
    expect(convertXof(2500, 'XOF', rates)).toBeNull();
    expect(convertXof(2500, 'ZZZ', rates)).toBeNull();
    expect(convertXof(2500, 'GBP', rates)).toBeNull();
    expect(convertXof(Number.NaN, 'EUR', rates)).toBeNull();
  });

  it('arrondit selon le montant et la langue', () => {
    expect(nb(formatMoney(3.811, 'EUR', 'fr'))).toBe('3,81 €');
    expect(formatMoney(4.2075, 'USD', 'en')).toBe('$4.21');
    expect(nb(formatMoney(5625.7, 'NGN', 'fr'))).toBe('5 626 ₦');
    expect(nb(formatMoney(2500, 'XAF', 'fr'))).toMatch(/^2 500 /);
  });

  it('liste : devises courantes en tête, puis les autres', () => {
    const o = currencyOptions({ ...rates, JPY: 0.26, AED: 0.006 }, 'fr').map((x) => x.code);
    expect(o.slice(0, 5)).toEqual(['XOF', 'XAF', 'EUR', 'USD', 'NGN']);
    expect(o).toContain('JPY');
    expect(currencyLabel('EUR', 'fr')).toBe('Euro (EUR)');
  });
});
