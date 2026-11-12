"""Rappel de fin d'offre : table `PromoReminder` (un rappel par membre et par code promo).

Revision ID: 0033_promo_reminder
Revises: 0032_promo_claim_hours
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0033_promo_reminder"
down_revision = "0032_promo_claim_hours"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "PromoReminder",
        sa.Column("promoId", sa.Text(), sa.ForeignKey("PromoCode.id", ondelete="CASCADE", onupdate="CASCADE"), nullable=False),
        sa.Column("userId", sa.Text(), sa.ForeignKey("User.id", ondelete="CASCADE", onupdate="CASCADE"), nullable=False),
        sa.Column("createdAt", postgresql.TIMESTAMP(precision=3), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.PrimaryKeyConstraint("promoId", "userId", name="PromoReminder_pkey"),
    )


def downgrade() -> None:
    op.drop_table("PromoReminder")
