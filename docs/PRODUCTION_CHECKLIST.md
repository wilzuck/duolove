# Checklist de mise en production

Cocher chaque ligne **avec une preuve** (capture, sortie de commande, lien). Les cases non cochées bloquent le lancement.

## Bloquants
- [ ] KKiaPay validé en bac à sable (voir DEPLOYMENT.md), webhook configuré, paiement réel de petit montant, `KKIAPAY_SANDBOX=false` ; remboursements : procédure manuelle définie (non automatisés)
- [ ] `SMTP_URL` réel ; SPF/DKIM/DMARC valides ; e-mails de confirmation et de réinitialisation reçus en boîte principale
- [ ] Secrets de production générés (`PAYMENT_WEBHOOK_SECRET`, `IP_HASH_SALT`), stockés dans le gestionnaire de secrets ; `NODE_ENV=production`
- [ ] HTTPS partout, web et API même origine (ou `COOKIE_DOMAIN`), WebSocket fonctionnel derrière le proxy
- [ ] Sauvegardes PostgreSQL + uploads automatiques **et restauration testée**
- [ ] Textes légaux (CGU, confidentialité, cookies, règles) validés par un juriste ; mentions légales de l'éditeur ajoutées ; adresse de contact/DPO réelle (`NEXT_PUBLIC_SUPPORT_EMAIL`)
- [ ] AIPD / registre des traitements ; politique de rétention appliquée (job de purge)
- [ ] Premier SUPER_ADMIN créé par promotion SQL ; comptes de démonstration **absents** de la base
- [ ] CSP web définie ; en-têtes vérifiés (securityheaders.com)
- [ ] Test d'intrusion / revue de sécurité externe, findings critiques corrigés

## Importants
- [ ] Stockage objet S3/R2 + CDN (ou volume persistant sauvegardé)
- [ ] Redis + limiteur partagé + adaptateur Socket.IO si > 1 instance API
- [ ] Modération automatique des images (NSFW/mineurs) ou capacité humaine dimensionnée
- [ ] Monitoring/alertes (disponibilité, erreurs, webhooks, disque) ; logs JSON
- [ ] Lighthouse mobile ≥ 90 sur accueil, login, découverte ; Core Web Vitals mesurés
- [ ] Audit d'accessibilité manuel (clavier, lecteur d'écran) des parcours authentifiés
- [ ] `pnpm audit --prod` propre le jour du lancement ; CI verte sur `main`
- [ ] Procédure d'astreinte et de réponse à incident ; formation de l'équipe de modération

## Vérifications finales
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e` verts sur l'environnement de pré-production
- [ ] Parcours complet réel : inscription → e-mail → profil → match → message → paiement réel → facture → annulation → suppression
- [ ] Documentation à jour (README, STATUS, DEPLOYMENT)

## Confirmation de l'e-mail (obligatoire avant tout usage)
- [ ] **SMTP réel configuré** : sans lui, aucun nouveau membre ne reçoit son code et ne peut entrer dans l'application.
- [ ] **Plusieurs processus ou instances = Redis obligatoire** : limiteur de débit (`app/core/ratelimit.py`), présence et diffusion Socket.IO (`python-socketio` avec gestionnaire Redis), boucles de fond (expiration, rappels, appels, speed dating) sur une seule instance ou sous verrou. Non implémenté ni testé (aucun Redis sur la machine de développement). Mesure de référence dans `docs/STATUS.md` (≈ 40 requêtes/s par processus, limité par le processeur) ; refaire `backend/scripts/loadtest.py` sur l'environnement cible avant l'ouverture.
- [ ] Appels : `CALL_PROVIDER=livekit` avec `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (sinon les appels sont **indisponibles** en production) ; compte LiveKit **sans enregistrement ni egress** ; test réel à deux appareils (audio puis vidéo, réseaux mobiles) avant d'ouvrir la fonction ; quota/coût fournisseur surveillé (plafonds `calls.*` dans l'admin, drapeau d'urgence `calls`).
- [ ] `DEV_EMAIL_CODE` **absent** de l'environnement de production (le serveur refuse de démarrer sinon) ; `NODE_ENV=production`.
- [ ] `REQUIRE_EMAIL_VERIFICATION=true` (la garde serveur en dépend).
- [ ] Durées vérifiées dans Admin › Engagement : validité du code (15 min) et suppression des comptes non confirmés (72 h).
- [ ] La tâche horaire de purge tourne sur **une seule instance** (sinon cron avec verrou) ; idem pour les rappels de rendez-vous.
