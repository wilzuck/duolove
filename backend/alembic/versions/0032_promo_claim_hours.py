"""Codes promo : `claimHours` (le code ne vaut que N heures après l'inscription du membre).

Revision ID: 0032_promo_claim_hours
Revises: 0031_promo_featured
"""
import sqlalchemy as sa
from alembic import op

revision = "0032_promo_claim_hours"
down_revision = "0031_promo_featured"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("PromoCode", sa.Column("claimHours", sa.Integer()))


def downgrade() -> None:
    op.drop_column("PromoCode", "claimHours")
