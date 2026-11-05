"""Appels audio/vidéo : sessions d'appel (jamais enregistrées) et notification d'appel manqué."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0010_calls"
down_revision = "0009_email_code"
branch_labels = None
depends_on = None

TS = postgresql.TIMESTAMP(precision=3)


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE \"NotificationType\" ADD VALUE IF NOT EXISTS 'CALL_MISSED'")
    op.create_table(
        "CallSession",
        sa.Column("id", sa.Text(), nullable=False), sa.Column("conversationId", sa.Text(), nullable=False), sa.Column("callerId", sa.Text(), nullable=False),
        sa.Column("calleeId", sa.Text(), nullable=False), sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), server_default=sa.text("'RINGING'::text"), nullable=False), sa.Column("ringExpiresAt", TS, nullable=False),
        sa.Column("answeredAt", TS, nullable=True), sa.Column("endedAt", TS, nullable=True), sa.Column("endedById", sa.Text(), nullable=True),
        sa.Column("createdAt", TS, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["conversationId"], ["Conversation.id"], name="CallSession_conversationId_fkey", onupdate="CASCADE", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["callerId"], ["User.id"], name="CallSession_callerId_fkey", onupdate="CASCADE", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["calleeId"], ["User.id"], name="CallSession_calleeId_fkey", onupdate="CASCADE", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="CallSession_pkey"),
    )
    op.create_index("CallSession_conversationId_createdAt_idx", "CallSession", ["conversationId", "createdAt"])
    op.create_index("CallSession_calleeId_status_idx", "CallSession", ["calleeId", "status"])
    op.create_index("CallSession_callerId_createdAt_idx", "CallSession", ["callerId", "createdAt"])


def downgrade() -> None:
    op.drop_table("CallSession")
    raise NotImplementedError("La valeur d'enum CALL_MISSED ne se retire pas.")
