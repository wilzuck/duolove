// Extrait les clés t('…') statiques du code source (toutes utilisent des chemins complets, sans espace de noms).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url))); // exécutable depuis n'importe quel dossier

export function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|ts)$/.test(f)) out.push(p);
  }
  return out;
}

export function usedKeys(root = 'src') {
  const keys = new Map();
  const re = /\bt(?:\.rich|\.raw|\.has)?\(\s*(['"`])([a-zA-Z0-9_.]+?)\1/g;
  const reDyn = /\bt\(\s*`([a-zA-Z0-9_.]*)\$\{/g;
  const dyn = new Set();
  for (const file of walk(root)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(re)) keys.set(m[2], file);
    for (const m of src.matchAll(reDyn)) dyn.add(m[1]);
    // clés passées dans des tableaux/objets littéraux : 'nav.how', 'footer.product', etc.
    for (const m of src.matchAll(/['"]((?:nav|footer|plans|legal|app|common|auth|home|how|about|faq|help|blog|contact|meta|admin|settings|chat|discover|profile|prefs|photos|onboarding|notifications|likes|report|match|card|errors|checkout|premium|suspended|profileView)\.[a-zA-Z0-9_.]+)['"]/g)) keys.set(m[1], file);
  }
  return { keys, dyn };
}

if (process.argv[1].endsWith('i18n-keys.mjs')) {
  const { keys, dyn } = usedKeys();
  console.log([...keys.keys()].sort().join('\n'));
  console.error('\nPréfixes dynamiques :', [...dyn].sort().join(', '));
}
