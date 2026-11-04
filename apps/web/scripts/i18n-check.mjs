// Vérifie : (1) toute clé utilisée dans le code existe dans fr.json ; (2) fr et en ont exactement les mêmes clés ;
// (3) les familles dynamiques (intérêts, intentions, genres, pays…) sont complètes ; (4) les placeholders ICU concordent.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url))); // exécutable depuis n'importe quel dossier
import { usedKeys } from './i18n-keys.mjs';

const load = (l) => JSON.parse(readFileSync(`messages/${l}.json`, 'utf8'));
const flat = (o, p = '', out = {}) => { for (const [k, v] of Object.entries(o)) { const key = p ? `${p}.${k}` : k; if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, key, out); else out[key] = v; } return out; };
const fr = flat(load('fr'));
const en = flat(load('en'));
let bad = 0;
const fail = (m) => { console.error('✗', m); bad++; };

const { keys } = usedKeys();
for (const [k, file] of keys) if (!(k in fr) && !Object.keys(fr).some((x) => x.startsWith(`${k}.`))) fail(`clé utilisée mais absente de fr.json : ${k}  (${file})`);
for (const k of Object.keys(fr)) if (!(k in en)) fail(`absente de en.json : ${k}`);
for (const k of Object.keys(en)) if (!(k in fr)) fail(`absente de fr.json : ${k}`);
const ph = (s) => (typeof s === 'string' ? [...s.matchAll(/\{(\w+)\s*[,}]/g)].map((m) => m[1]).sort().join(',') : '');
for (const k of Object.keys(fr)) if (k in en && ph(fr[k]) !== ph(en[k])) fail(`placeholders différents : ${k}`);
for (const [k, v] of Object.entries({ ...fr, ...en })) if (typeof v === 'string' && v.trim() === '') fail(`valeur vide : ${k}`);

// Familles dynamiques alignées sur @duomatch/types
const types = readFileSync('../../packages/types/src/index.ts', 'utf8');
const arr = (name) => [...types.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const`))[1].matchAll(/'([A-Za-z_]+)'/g)].map((m) => m[1]);
for (const [name, ns] of [['GENDERS', 'gender'], ['INTENTS', 'intent'], ['INTENTS', 'intentHint'], ['SEEKING', 'seeking'], ['INTEREST_SLUGS', 'interest'], ['REPORT_REASONS', 'report.reasons'], ['PLAN_CODES', 'plans']])
  for (const v of arr(name)) if (!Object.keys(fr).some((k) => k.startsWith(`${ns}.${v}`))) fail(`famille ${ns} : valeur manquante ${v}`);

console.log(bad ? `\n${bad} problème(s) i18n` : `i18n OK — ${Object.keys(fr).length} clés, ${keys.size} utilisées dans le code, fr/en alignés`);
process.exit(bad ? 1 : 0);
