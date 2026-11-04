import { defineConfig, devices } from '@playwright/test';

// Les tests E2E parlent à une API réelle + PostgreSQL : chaque scénario crée ses propres comptes (e-mails uniques).
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:3000', locale: 'fr-FR', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } }],
  webServer: [
    // L'API des E2E utilise une base dédiée (duomatch_test) : jamais la base de développement.
    { command: 'make -C ../../backend start', url: 'http://localhost:4000/api/health', reuseExistingServer: true, timeout: 90_000,
      env: { NODE_ENV: 'test', DATABASE_URL: process.env.E2E_DATABASE_URL ?? 'postgresql://admin@localhost:5432/duomatch_test', UPLOAD_DIR: './uploads-test' } },
    { command: 'pnpm --filter @duomatch/web start', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 90_000 },
  ],
});
