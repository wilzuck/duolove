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
