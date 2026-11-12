/** Écran « Choisis ton offre » après le profil : montré une seule fois par appareil (mémorisé localement ; rien de sensible). */
const KEY = 'crushduo.planChoiceSeen';
export const planChoiceSeen = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
export const markPlanChoiceSeen = () => { try { localStorage.setItem(KEY, '1'); } catch { /* stockage indisponible : l'écran pourra se réafficher, sans conséquence */ } };
