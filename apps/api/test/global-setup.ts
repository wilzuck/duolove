import { execSync } from 'node:child_process';

/** Applique les migrations sur la base de test dédiée (jamais sur la base de développement). */
export default function setup() {
  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://admin@localhost:5432/duomatch_test?schema=public' },
  });
}
