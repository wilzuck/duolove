import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'next-env.d.ts', 'node_modules/**', 'playwright-report/**', 'test-results/**']),
  // Les photos viennent de l'API (URL absolues) : <img> volontaire, pas next/image.
  { rules: { '@next/next/no-img-element': 'off', 'import/no-anonymous-default-export': 'off' } },
]);
