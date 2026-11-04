# Raccourcis de développement de l'API DuoMatch (FastAPI). Tout passe par le virtualenv local `.venv`.
VENV    := .venv
PY      := $(VENV)/bin/python
PIP     := $(VENV)/bin/pip
UVICORN := $(VENV)/bin/uvicorn
ALEMBIC := $(VENV)/bin/alembic
PORT    ?= 4000

.DEFAULT_GOAL := help
.PHONY: help venv install dev start migrate revision check test seed

help: ## Affiche cette aide
	@grep -E '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | awk -F':.*?## ' '{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

$(UVICORN):
	@test -d $(VENV) || python3 -m venv $(VENV)
	@$(PIP) install -q -r requirements.txt

venv: $(UVICORN) ## Crée le virtualenv s'il n'existe pas

install: venv ## Installe / met à jour les dépendances
	@$(PIP) install -q -r requirements.txt

dev: venv ## Lance l'API avec rechargement à chaud (port 4000)
	$(UVICORN) app.main:app --reload --port $(PORT)

start: venv ## Lance l'API sans rechargement (utilisé par les E2E)
	$(UVICORN) app.main:app --port $(PORT)

migrate: venv ## Applique les migrations Alembic
	$(ALEMBIC) upgrade head

revision: venv ## Crée une migration depuis les modèles : make revision m="message"
	$(ALEMBIC) revision --autogenerate -m "$(m)"

check: venv ## Vérifie qu'aucune migration n'est en attente (une seule tête)
	$(ALEMBIC) check

test: venv ## pytest sur la base de test dédiée (duomatch_test)
	$(PY) -m pytest

seed: venv ## Données de démonstration (SEED_PASSWORD pour fixer le mot de passe)
	$(PY) -m scripts.seed
