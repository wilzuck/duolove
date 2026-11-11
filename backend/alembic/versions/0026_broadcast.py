"""Envois d'e-mails et d'annonces par l'administration : ciblage, canaux (e-mail, application), planification.

Revision ID: 0026_broadcast
Revises: 0025_report_evidence
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0026_broadcast"
down_revision = "0025_report_evidence"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE \"NotificationType\" ADD VALUE IF NOT EXISTS 'ANNOUNCEMENT'")
    op.create_table(
        "Broadcast",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("signature", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("audienceMode", sa.Text(), nullable=False),
        sa.Column("audience", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("channel", sa.Text(), nullable=False, server_default=sa.text("'EMAIL'")),
        sa.Column("kind", sa.Text(), nullable=False, server_default=sa.text("'MARKETING'")),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'SCHEDULED'")),
        sa.Column("scheduledAt", postgresql.TIMESTAMP(precision=3), nullable=False),
        sa.Column("startedAt", postgresql.TIMESTAMP(precision=3)),
        sa.Column("sentAt", postgresql.TIMESTAMP(precision=3)),
        sa.Column("recipients", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("sent", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("failed", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("error", sa.Text()),
        sa.Column("createdById", sa.Text()),
        sa.Column("createdAt", postgresql.TIMESTAMP(precision=3), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("Broadcast_status_scheduledAt_idx", "Broadcast", ["status", "scheduledAt"])
    op.create_index("Broadcast_createdAt_idx", "Broadcast", ["createdAt"])


def downgrade() -> None:
    op.drop_table("Broadcast")  # la valeur ANNOUNCEMENT de l'énumération reste (PostgreSQL ne sait pas retirer une valeur)
