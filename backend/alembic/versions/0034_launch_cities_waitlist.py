"""Ouverture par ville : liste d'attente (`WaitlistEntry`). Le réglage des villes ouvertes est une ligne `launch.cities` de SystemSetting (aucune migration).

Revision ID: 0034_launch_cities_waitlist
Revises: 0033_promo_reminder
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0034_launch_cities_waitlist"
down_revision = "0033_promo_reminder"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "WaitlistEntry",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("country", sa.Text(), nullable=False),
        sa.Column("city", sa.Text(), nullable=False),
        sa.Column("createdAt", postgresql.TIMESTAMP(precision=3), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("WaitlistEntry_email_key", "WaitlistEntry", ["email"], unique=True)
    op.create_index("WaitlistEntry_city_idx", "WaitlistEntry", ["country", "city"])


def downgrade() -> None:
    op.drop_table("WaitlistEntry")
