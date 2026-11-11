"""Profil : situation, études, tabac, alcool, religion (facultatifs, masquable pour la religion). Le signe astrologique est calculé, jamais stocké.

Revision ID: 0023_profile_lifestyle
Revises: 0022_plan_calls_off
"""
import sqlalchemy as sa
from alembic import op

revision = "0023_profile_lifestyle"
down_revision = "0022_plan_calls_off"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for col in ("maritalStatus", "education", "smoking", "alcohol", "religion"):
        op.add_column("Profile", sa.Column(col, sa.Text(), nullable=True))
    op.add_column("Profile", sa.Column("showReligion", sa.Boolean(), nullable=False, server_default=sa.text("false")))


def downgrade() -> None:
    for col in ("showReligion", "religion", "alcohol", "smoking", "education", "maritalStatus"):
        op.drop_column("Profile", col)
