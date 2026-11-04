import { describe, expect, it } from 'vitest';
import { intentScore, scoreCandidate, type ScoreSubject } from './scoring.js';
import { completenessLevel, computeCompleteness } from '../profiles/completeness.js';
import { approxDistanceKm } from '../profiles/card.js';
import { allowSend, resetSendLog } from '../chat/chat.service.js';
import { ageFromBirthDate, registerSchema } from '@duomatch/types';

const base: ScoreSubject = { intent: 'SERIOUS', interests: ['music', 'travel', 'cooking'], languages: ['fr'], city: 'Lomé', country: 'TG', lastActiveAt: new Date(), completeness: 80, verified: false, boostedUntil: null };

describe('intentScore', () => {
  it('récompense l’intention identique, puis les intentions proches', () => {
    expect(intentScore('SERIOUS', 'SERIOUS')).toBe(25);
    expect(intentScore('SERIOUS', 'MARRIAGE')).toBe(20);
    expect(intentScore('SERIOUS', 'FRIENDSHIP')).toBe(0);
    expect(intentScore('UNSURE', 'MARRIAGE')).toBe(12);
  });
});

describe('scoreCandidate', () => {
  it('classe un profil proche et compatible avant un profil lointain et peu actif', () => {
    const near = scoreCandidate(base, { ...base, interests: ['music', 'travel'] }, 5);
    const far = scoreCandidate(base, { ...base, interests: [], city: 'Dakar', country: 'SN', languages: ['en'], intent: 'FRIENDSHIP', lastActiveAt: new Date(Date.now() - 60 * 86_400_000), completeness: 20 }, 3000);
    expect(near.compatibility).toBeGreaterThan(far.compatibility);
    expect(near.compatibility).toBeLessThanOrEqual(100);
  });
  it('le boost modifie le rang mais pas la compatibilité affichée', () => {
    const plain = scoreCandidate(base, base, null);
    const boosted = scoreCandidate(base, { ...base, boostedUntil: new Date(Date.now() + 60_000) }, null);
    expect(boosted.compatibility).toBe(plain.compatibility);
    expect(boosted.rank).toBe(plain.rank + 20);
  });
  it('un boost expiré n’a aucun effet', () => {
    const r = scoreCandidate(base, { ...base, boostedUntil: new Date(Date.now() - 1000) }, null);
    expect(r.rank).toBe(r.compatibility);
  });
});

describe('complétude du profil', () => {
  it('monte avec bio, intérêts et photos', () => {
    const empty = computeCompleteness({ bio: '', occupation: null, interestCount: 0, photoCount: 0, intent: 'UNSURE' });
    const full = computeCompleteness({ bio: 'x'.repeat(50), occupation: 'Dev', interestCount: 4, photoCount: 3, intent: 'SERIOUS' });
    expect(empty).toBe(30);
    expect(full).toBe(100);
    expect(completenessLevel(empty)).toBe('INCOMPLETE');
    expect(completenessLevel(70)).toBe('IN_PROGRESS');
    expect(completenessLevel(full)).toBe('COMPLETE');
  });
});

describe('distance approximative', () => {
  it('est arrondie à 5 km et nulle sans coordonnées', () => {
    expect(approxDistanceKm({ approxLat: 6.1, approxLng: 1.2 }, { approxLat: 6.2, approxLng: 1.2 })! % 5).toBe(0);
    expect(approxDistanceKm({ approxLat: null, approxLng: null }, { approxLat: 6.2, approxLng: 1.2 })).toBeNull();
  });
});

describe('anti-spam messagerie', () => {
  it('bloque au-delà de 30 messages par minute', () => {
    resetSendLog();
    const t = Date.now();
    for (let i = 0; i < 30; i++) expect(allowSend('u1', t + i)).toBe(true);
    expect(allowSend('u1', t + 31)).toBe(false);
    expect(allowSend('u1', t + 61_000)).toBe(true);
  });
});

describe('inscription (schéma partagé)', () => {
  const ok = { displayName: 'Ama', email: 'AMA@Test.com', password: 'Abcdefghi1', birthDate: '1995-05-05', gender: 'WOMAN', country: 'TG', city: 'Lomé', acceptTerms: true };
  it('accepte un adulte et normalise l’e-mail', () => {
    const r = registerSchema.safeParse(ok);
    expect(r.success && r.data.email).toBe('ama@test.com');
  });
  it('refuse un mineur, un mot de passe faible et l’absence de CGU', () => {
    const y = new Date(); y.setUTCFullYear(y.getUTCFullYear() - 17);
    expect(registerSchema.safeParse({ ...ok, birthDate: y.toISOString().slice(0, 10) }).success).toBe(false);
    expect(registerSchema.safeParse({ ...ok, password: 'court' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...ok, acceptTerms: false }).success).toBe(false);
  });
  it('calcule l’âge à la date anniversaire', () => {
    expect(ageFromBirthDate(new Date('2000-06-15'), new Date('2026-06-14'))).toBe(25);
    expect(ageFromBirthDate(new Date('2000-06-15'), new Date('2026-06-15'))).toBe(26);
  });
});
