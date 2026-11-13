"""Formule Gold : nouvelle valeur du type PlanCode. La ligne de formule et ses prix sont créés au démarrage (plan_config.ensure_defaults), désactivable en administration.

Revision ID: 0041_gold_plan
Revises: 0040_duo_guarantee
"""
from alembic import op

revision = "0041_gold_plan"
down_revision = "0040_duo_guarantee"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE \"PlanCode\" ADD VALUE IF NOT EXISTS 'GOLD'")


def downgrade() -> None:
    pass  # une valeur d'énumération PostgreSQL ne se retire pas ; elle reste inutilisée
