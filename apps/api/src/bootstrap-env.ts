// Doit être importé en tout premier : charge .env avant que les autres modules lisent l'environnement.
try {
  process.loadEnvFile('.env');
} catch {
  // Silence assumé : en production les variables viennent de l'environnement, pas d'un fichier.
}
