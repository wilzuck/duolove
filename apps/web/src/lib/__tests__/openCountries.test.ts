import { describe, expect, it } from 'vitest';
import { openCountries } from '../openCountries';

describe('pays proposés dans les listes', () => {
  it('seulement les pays ouverts, plus la valeur déjà choisie', () => {
    expect(openCountries(['BJ', 'FR']).map((c) => c.code)).toEqual(['BJ', 'FR']);
    expect(openCountries(['BJ'], ['CM', null, '']).map((c) => c.code)).toEqual(['BJ', 'CM']);
  });
  it('tous les pays tant que la liste ouverte n’est pas chargée', () => {
    expect(openCountries(undefined).length).toBeGreaterThan(10);
  });
});
