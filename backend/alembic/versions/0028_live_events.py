"""Soirées Match en direct : créneaux annoncés par l'administration, inscriptions et rappels.

Revision ID: 0028_live_events
Revises: 0027_user_last_country
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0028_live_events"
down_revision = "0027_user_last_country"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE \"NotificationType\" ADD VALUE IF NOT EXISTS 'LIVE_EVENT'")
    op.create_table(
        "LiveEvent",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("city", sa.Text()),
        sa.Column("startsAt", postgresql.TIMESTAMP(precision=3), nullable=False),
        sa.Column("endsAt", postgresql.TIMESTAMP(precision=3), nullable=False),
        sa.Column("tzOffset", sa.Integer(), nullable=False, server_default=sa.text("60")),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'ACTIVE'")),
        sa.Column("remindedAt", postgresql.TIMESTAMP(precision=3)),
        sa.Column("startedAt", postgresql.TIMESTAMP(precision=3)),
        sa.Column("createdById", sa.Text()),
        sa.Column("createdAt", postgresql.TIMESTAMP(precision=3), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("LiveEvent_status_startsAt_idx", "LiveEvent", ["status", "startsAt"])
    op.create_table(
        "LiveEventRsvp",
        sa.Column("eventId", sa.Text(), sa.ForeignKey("LiveEvent.id", ondelete="CASCADE", onupdate="CASCADE"), nullable=False),
        sa.Column("userId", sa.Text(), sa.ForeignKey("User.id", ondelete="CASCADE", onupdate="CASCADE"), nullable=False),
        sa.Column("createdAt", postgresql.TIMESTAMP(precision=3), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.PrimaryKeyConstraint("eventId", "userId", name="LiveEventRsvp_pkey"),
    )
    op.create_index("LiveEventRsvp_userId_idx", "LiveEventRsvp", ["userId"])


def downgrade() -> None:
    op.drop_table("LiveEventRsvp")
    op.drop_table("LiveEvent")  # la valeur LIVE_EVENT de l'énumération reste (PostgreSQL ne sait pas retirer une valeur)
