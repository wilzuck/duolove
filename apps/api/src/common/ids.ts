import { randomBytes } from 'node:crypto';

/** Identifiant opaque non devinable pour les clés de fichiers (≥ 120 bits d'aléa). */
export const cuid = () => randomBytes(15).toString('hex');
