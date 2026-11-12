"""Résumé hebdomadaire par e-mail : préférence `emailWeekly` et date du dernier envoi.

Revision ID: 0037_weekly_digest
Revises: 0036_push_subscription
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0037_weekly_digest"
down_revision = "0036_push_subscription"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("NotificationPreference", sa.Column("emailWeekly", sa.Boolean(), nullable=False, server_default=sa.text("true")))
    op.add_column("NotificationPreference", sa.Column("lastDigestAt", postgresql.TIMESTAMP(precision=3)))


def downgrade() -> None:
    op.drop_column("NotificationPreference", "lastDigestAt")
    op.drop_column("NotificationPreference", "emailWeekly")
