# Sauvegarde de la base (PostgreSQL → Cloudflare R2)

**Terminé et testé en local** : `backend/scripts/backup_db.py`, 5 tests (`backend/tests/test_backup_db.py`), sauvegarde puis restauration réelles de la base de développement (mêmes nombres de lignes).
**Non vérifié** : la construction de l'image `docker/Dockerfile.backup` (Docker absent de la machine de développement) et l'exécution sur Railway.

## Principe
- Une fois par nuit (02:00 UTC), `pg_dump` au format *custom* (compressé), contrôlé par `pg_restore --list`, envoyé sur R2 sous `<préfixe>/backups/db/duomatch-AAAAMMJJ-HHMMSS.dump`, puis taille vérifiée côté R2 (somme SHA-256 en métadonnée).
- **Jamais sur le disque du serveur** : si le stockage objet n'est pas configuré, le script refuse de s'exécuter.
- **Photos des membres** (même exécution, juste après la base) : copie incrémentale, côté serveur, de tous les fichiers du stockage (photos, miniatures) vers `<préfixe>/backups/photos/` du bucket de sauvegarde ; seuls les fichiers nouveaux ou modifiés sont copiés. Une photo supprimée par son membre reste **30 jours** dans la sauvegarde (marque `backups/photos-deleted/AAAAMMJJ/…`), puis est effacée. Un échec de cette copie n'annule pas la sauvegarde de la base : il est enregistré (`last.photos.error`), le script sort en erreur et les administrateurs reçoivent un e-mail.
- **Rotation** : 7 sauvegardes quotidiennes, 4 hebdomadaires (dimanches), 6 mensuelles, et jamais moins de 3. Seuls les fichiers `duomatch-*.dump` de ce dossier sont supprimés.
- Échec = code de sortie non nul : Railway marque l'exécution en échec (activer les notifications d'échec de déploiement dans Railway).
- **Le bucket doit rester privé** : une sauvegarde contient toutes les données personnelles (comptes, messages).
- **Version du client** : la base Railway est en PostgreSQL **18** ; `pg_dump` doit avoir la même version majeure ou plus (l'image installe `postgresql-client-18` depuis le dépôt PGDG). Si la base change de version, changer ce numéro.

## Mise en place sur Railway (une fois)
1. Nouveau service « backup » dans le projet, source : ce dépôt, fichier de configuration `docker/railway.backup.json` (cron `0 2 * * *`, UTC).
2. Variables du service : `DATABASE_URL` = `${{DB.DATABASE_URL}}` et `SETTINGS_ENCRYPTION_KEY` = `${{api.SETTINGS_ENCRYPTION_KEY}}` (références, pas de copie de secret). Ne pas définir `NODE_ENV=production` sur ce service.
3. R2 doit être actif (admin → Stockage). Lancer une exécution manuelle et vérifier : `python -m scripts.backup_db --list`.

## Lister, télécharger, restaurer
```bash
python -m scripts.backup_db --list
python -m scripts.backup_db --download LATEST ./sauvegardes      # ou une clé précise
# Restauration dans une base VIDE (jamais directement sur la production) :
createdb restauration
pg_restore --no-owner --dbname restauration ./sauvegardes/duomatch-AAAAMMJJ-HHMMSS.dump
```
Contrôle : comparer quelques comptes de lignes (`User`, `Message`, `Payment`) avec la production. **Faire un essai de restauration tous les trimestres** : une sauvegarde jamais restaurée n'est pas une garantie.

## Limites connues
- Les **photos** ont une seconde copie dans le bucket de sauvegarde (voir Principe) ; elle n'est faite qu'une fois par nuit : une photo envoyée puis supprimée dans la même journée n'y figure pas. Restaurer une photo : copier `<préfixe>/backups/photos/<clé>` vers `<préfixe>/<clé>` dans le bucket des photos.
- Si le bucket des photos et celui des sauvegardes sont le même, la seconde copie est dans le même bucket : une suppression du bucket emporterait les deux. Garder `S3_BACKUP_BUCKET` distinct (c'est le cas en production : `crushduo-backup`).
- Pas de chiffrement côté client des sauvegardes (R2 chiffre au repos). Les clés R2 donnent accès aux sauvegardes : ne les partager qu'avec les personnes de confiance.
- Pas de sauvegarde en continu : la perte maximale est de 24 h. Pour moins, voir les sauvegardes automatiques de Railway ou la réplication.
