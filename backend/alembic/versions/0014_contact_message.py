"""Boîte de contact : messages envoyés depuis la page publique Contact."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0014_contact_message"
down_revision = "0013_daily_question"
branch_labels = None
depends_on = None

TS = postgresql.TIMESTAMP(precision=3)


def upgrade() -> None:
    op.create_table(
        "ContactMessage",
        sa.Column("id", sa.Text(), nullable=False), sa.Column("name", sa.Text(), nullable=False), sa.Column("email", sa.Text(), nullable=False),
        sa.Column("topic", sa.Text(), nullable=False), sa.Column("message", sa.Text(), nullable=False),
        sa.Column("locale", sa.Text(), server_default=sa.text("'fr'"), nullable=False), sa.Column("status", sa.Text(), server_default=sa.text("'NEW'"), nullable=False),
        sa.Column("createdAt", TS, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("handledById", sa.Text(), nullable=True), sa.Column("handledAt", TS, nullable=True),
        sa.PrimaryKeyConstraint("id", name="ContactMessage_pkey"),
    )
    op.create_index("ContactMessage_status_createdAt_idx", "ContactMessage", ["status", "createdAt"])


def downgrade() -> None:
    op.drop_table("ContactMessage")
