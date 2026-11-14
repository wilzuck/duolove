import { describe, expect, it } from 'vitest';
import { addCity, MAX_CITIES } from '../cities';

describe('liste de villes des critères', () => {
  it('ajoute une ville nettoyée, sans doublon (accents, casse, tirets)', () => {
    expect(addCity([], '  Porto   Novo ')).toEqual(['Porto Novo']);
    expect(addCity(['Lomé'], 'LOME')).toEqual(['Lomé']);
    expect(addCity(['Porto-Novo'], 'porto novo')).toEqual(['Porto-Novo']);
    expect(addCity(['Lomé'], 'Kara')).toEqual(['Lomé', 'Kara']);
  });
  it('ignore une saisie trop courte et respecte le maximum', () => {
    expect(addCity([], 'X')).toEqual([]);
    const full = Array.from({ length: MAX_CITIES }, (_, i) => `Ville ${i}`);
    expect(addCity(full, 'Autre')).toBe(full);
  });
});
