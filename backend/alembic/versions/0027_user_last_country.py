"""Pays de la dernière connexion (code ISO déduit de l'en-tête Cloudflare, jamais l'adresse IP) : sert à signaler un écart avec le pays déclaré.

Revision ID: 0027_user_last_country
Revises: 0026_broadcast
"""
import sqlalchemy as sa
from alembic import op

revision = "0027_user_last_country"
down_revision = "0026_broadcast"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("User", sa.Column("lastCountry", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("User", "lastCountry")
