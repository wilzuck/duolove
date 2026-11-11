"""Signalement : extrait de conversation joint par la personne qui signale (preuves pour la modération).

Revision ID: 0025_report_evidence
Revises: 0024_profile_life_values
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0025_report_evidence"
down_revision = "0024_profile_life_values"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("Report", sa.Column("conversationId", sa.Text(), nullable=True))
    op.add_column("Report", sa.Column("evidence", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("Report", "evidence")
    op.drop_column("Report", "conversationId")
