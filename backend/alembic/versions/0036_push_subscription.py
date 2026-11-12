"""Notifications push : table `PushSubscription` (un appareil = une ligne).

Revision ID: 0036_push_subscription
Revises: 0035_two_factor
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0036_push_subscription"
down_revision = "0035_two_factor"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "PushSubscription",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("userId", sa.Text(), sa.ForeignKey("User.id", ondelete="CASCADE", onupdate="CASCADE"), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh", sa.Text(), nullable=False),
        sa.Column("auth", sa.Text(), nullable=False),
        sa.Column("userAgent", sa.Text()),
        sa.Column("lang", sa.Text(), nullable=False, server_default=sa.text("'fr'")),
        sa.Column("createdAt", postgresql.TIMESTAMP(precision=3), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("lastSentAt", postgresql.TIMESTAMP(precision=3)),
    )
    op.create_index("PushSubscription_endpoint_key", "PushSubscription", ["endpoint"], unique=True)
    op.create_index("PushSubscription_userId_idx", "PushSubscription", ["userId"])


def downgrade() -> None:
    op.drop_table("PushSubscription")
