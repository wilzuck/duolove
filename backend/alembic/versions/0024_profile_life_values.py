"""Profil : « Ce qui compte le plus pour moi » (3 valeurs au plus, catalogue ou texte libre).

Revision ID: 0024_profile_life_values
Revises: 0023_profile_lifestyle
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0024_profile_life_values"
down_revision = "0023_profile_lifestyle"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("Profile", sa.Column("lifeValues", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")))


def downgrade() -> None:
    op.drop_column("Profile", "lifeValues")
