import { defineConfig } from 'prisma/config';

// Prisma 7 ne charge plus .env automatiquement : on le lit ici (Node ≥ 22).
try {
  process.loadEnvFile('.env');
} catch {
  // Silence assumé : en CI/prod, DATABASE_URL vient de l'environnement, pas d'un fichier.
}

export default defineConfig({
  schema: '../../prisma/schema.prisma',
  migrations: { path: '../../prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
