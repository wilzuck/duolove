import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://admin@localhost:5432/duomatch_test?schema=public';

// SWC émet les métadonnées de décorateurs (injection de dépendances Nest).
export default defineConfig({
  test: {
    globals: true, environment: 'node', include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    testTimeout: 30000, hookTimeout: 60000, fileParallelism: false,
    globalSetup: ['./test/global-setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DB,
      UPLOAD_DIR: './uploads-test',
      APP_URL: 'http://localhost:3000',
      API_URL: 'http://localhost:4000',
    },
  },
  plugins: [swc.vite({ module: { type: 'es6' }, jsc: { target: 'es2022', parser: { syntax: 'typescript', decorators: true }, transform: { legacyDecorator: true, decoratorMetadata: true } } })],
});
