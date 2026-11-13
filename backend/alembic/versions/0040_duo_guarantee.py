"""Garantie Duo : historique des jours ajoutés automatiquement (un abonné sans duo après 30 jours alors qu'il a complété son profil et liké).

Revision ID: 0040_duo_guarantee
Revises: 0039_blog_featured
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0040_duo_guarantee"
down_revision = "0039_blog_featured"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE \"NotificationType\" ADD VALUE IF NOT EXISTS 'DUO_GUARANTEE'")
    op.create_table(
        "DuoGuaranteeGrant",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("userId", sa.Text(), sa.ForeignKey("User.id", ondelete="CASCADE", onupdate="CASCADE"), nullable=False),
        sa.Column("subscriptionId", sa.Text(), sa.ForeignKey("Subscription.id", ondelete="CASCADE", onupdate="CASCADE"), nullable=False),
        sa.Column("days", sa.Integer(), nullable=False),
        sa.Column("likesSent", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("createdAt", postgresql.TIMESTAMP(precision=3), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("DuoGuaranteeGrant_userId_createdAt_idx", "DuoGuaranteeGrant", ["userId", "createdAt"])


def downgrade() -> None:
    op.drop_index("DuoGuaranteeGrant_userId_createdAt_idx", table_name="DuoGuaranteeGrant")
    op.drop_table("DuoGuaranteeGrant")
