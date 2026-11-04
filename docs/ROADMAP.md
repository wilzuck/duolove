# Roadmap et avancement

Légende : ✅ terminé et vérifié · 🟡 partiel / simulé · ⛔ non implémenté. Détail par fonctionnalité : [STATUS.md](STATUS.md).

| Phase | Contenu | État |
|---|---|---|
| **0 — Conception** | PRD, architecture, modèle de données, sécurité, backlog | ✅ (ces documents) |
| **1 — Fondations** | monorepo, Next, Nest, PostgreSQL, design system, landing, navigation responsive | ✅ (Redis ⛔) |
| **2 — Comptes** | inscription, connexion, e-mail, onboarding, profils, photos, préférences | ✅ (Apple ⛔, Google 🟡 non testé sans client ID) |
| **3 — Rencontres** | découverte, filtres, likes, Super Likes, algorithme, matchs | ✅ |
| **4 — Communication** | messagerie temps réel, notifications, blocage, signalement | ✅ (push PWA ⛔) |
| **5 — Monétisation** | offres, abonnements, webhooks, factures | 🟡 KKiaPay implémenté, testé sur API simulée, **à valider en bac à sable avec vos clés** ; Stripe ⛔ |
| **6 — Administration** | dashboard, modération, stats, utilisateurs, paiements, flags, audit | ✅ |
| **7 — Production** | tests, audit dépendances, CI/CD, Docker, docs | 🟡 CI écrite et Docker écrit **non exécutés** ici ; monitoring ⛔ |

## Prochaines étapes recommandées (ordre)

1. **Valider KKiaPay en bac à sable** avec vos clés (checklist dans DEPLOYMENT.md), puis un paiement réel de petit montant.
2. **E-mail transactionnel** : définir `SMTP_URL` (Resend, Brevo, SES…) et valider SPF/DKIM/DMARC.
3. **Stockage S3/R2 + CDN**, puis Redis (limiteur, files, Socket.IO adapter).
4. **Détection automatique de contenu** (NSFW / mineurs) à l'upload, en complément de la file humaine.
5. **Audit sécurité externe**, revue juridique (CGU, confidentialité, cookies), politique de rétention + job de purge.
6. **Observabilité** : logs JSON, Sentry, métriques, alertes (voir DEPLOYMENT.md).
7. **Push PWA** (VAPID + consentement), service worker hors-ligne.
8. Mesure **Lighthouse / Core Web Vitals** sur un environnement déployé.
