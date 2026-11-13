"""Guides de découverte : liste des guides déjà vus par le membre (un guide par page, montré une seule fois, quel que soit l'appareil).

Revision ID: 0044_guided_tours
Revises: 0043_system_errors
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0044_guided_tours"
down_revision = "0043_system_errors"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("User", sa.Column("toursSeen", postgresql.ARRAY(sa.Text()), nullable=False, server_default=sa.text("ARRAY[]::text[]")))


def downgrade() -> None:
    op.drop_column("User", "toursSeen")
