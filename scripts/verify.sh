#!/usr/bin/env bash
# Contrôles locaux avant d'envoyer du code (appelé par .githooks/pre-push).
# Rapide par défaut (~1-2 min). VERIFY_FULL=1 ajoute le build du site et les tests de l'API (comme la CI).
# Un échec ici évite un déploiement cassé : corrigez, ou contournez en connaissance de cause avec `git push --no-verify`.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
PY=backend/.venv/bin/python
step() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }

step "Fichiers de workflow GitHub (une erreur de syntaxe désactive TOUTE la CI sans bruit)"
if [ -x backend/.venv/bin/actionlint ]; then backend/.venv/bin/actionlint
elif command -v actionlint >/dev/null 2>&1; then actionlint
else "$PY" -c "import glob,yaml;[yaml.safe_load(open(f)) for f in glob.glob('.github/workflows/*.yml')];print('syntaxe YAML valide (actionlint absent)')"; fi

step "Migrations : une seule tête Alembic (deux têtes = l'API ne démarre plus)"
heads=$(cd backend && .venv/bin/alembic heads 2>/dev/null | grep -c '(head)' || true)
[ "$heads" = "1" ] || { echo "❌ $heads têtes Alembic (attendu : 1)"; exit 1; }
echo "1 tête"

step "Lint et types"
pnpm lint
pnpm typecheck

if [ "${VERIFY_FULL:-0}" = "1" ]; then
  step "Build du site (identique à celui de Railway)"
  pnpm build
  step "Tests de l'API"
  (cd backend && .venv/bin/python -m pytest -q -p no:warnings)
fi
printf '\n\033[32m✔ Tout est bon, envoi autorisé.\033[0m\n'
