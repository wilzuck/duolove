"""Speed dating en texte : sessions, inscriptions, binômes par tour et messages."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0011_speed_dating"
down_revision = "0010_calls"
branch_labels = None
depends_on = None

TS = postgresql.TIMESTAMP(precision=3)
NOW = sa.text("CURRENT_TIMESTAMP")


def upgrade() -> None:
    op.create_table(
        "SpeedEvent",
        sa.Column("id", sa.Text(), nullable=False), sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), server_default=sa.text("''::text"), nullable=False), sa.Column("city", sa.Text(), nullable=True),
        sa.Column("ageMin", sa.Integer(), server_default=sa.text("18"), nullable=False), sa.Column("ageMax", sa.Integer(), server_default=sa.text("99"), nullable=False),
        sa.Column("intent", sa.Text(), nullable=True), sa.Column("capacity", sa.Integer(), server_default=sa.text("20"), nullable=False),
        sa.Column("roundSeconds", sa.Integer(), server_default=sa.text("180"), nullable=False), sa.Column("rounds", sa.Integer(), server_default=sa.text("4"), nullable=False),
        sa.Column("startsAt", TS, nullable=False), sa.Column("status", sa.Text(), server_default=sa.text("'SCHEDULED'::text"), nullable=False),
        sa.Column("cancelReason", sa.Text(), nullable=True), sa.Column("createdById", sa.Text(), nullable=True),
        sa.Column("createdAt", TS, server_default=NOW, nullable=False),
        sa.PrimaryKeyConstraint("id", name="SpeedEvent_pkey"),
    )
    op.create_index("SpeedEvent_status_startsAt_idx", "SpeedEvent", ["status", "startsAt"])
    op.create_table(
        "SpeedRegistration",
        sa.Column("id", sa.Text(), nullable=False), sa.Column("eventId", sa.Text(), nullable=False), sa.Column("userId", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), server_default=sa.text("'REGISTERED'::text"), nullable=False), sa.Column("createdAt", TS, server_default=NOW, nullable=False),
        sa.ForeignKeyConstraint(["eventId"], ["SpeedEvent.id"], name="SpeedRegistration_eventId_fkey", onupdate="CASCADE", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["userId"], ["User.id"], name="SpeedRegistration_userId_fkey", onupdate="CASCADE", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="SpeedRegistration_pkey"),
    )
    op.create_index("SpeedRegistration_eventId_userId_key", "SpeedRegistration", ["eventId", "userId"], unique=True)
    op.create_index("SpeedRegistration_userId_idx", "SpeedRegistration", ["userId"])
    op.create_table(
        "SpeedPair",
        sa.Column("id", sa.Text(), nullable=False), sa.Column("eventId", sa.Text(), nullable=False), sa.Column("round", sa.Integer(), nullable=False),
        sa.Column("userAId", sa.Text(), nullable=False), sa.Column("userBId", sa.Text(), nullable=False),
        sa.Column("decisionA", sa.Text(), nullable=True), sa.Column("decisionB", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["eventId"], ["SpeedEvent.id"], name="SpeedPair_eventId_fkey", onupdate="CASCADE", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="SpeedPair_pkey"),
    )
    op.create_index("SpeedPair_eventId_round_idx", "SpeedPair", ["eventId", "round"])
    op.create_index("SpeedPair_userAId_idx", "SpeedPair", ["userAId"])
    op.create_index("SpeedPair_userBId_idx", "SpeedPair", ["userBId"])
    op.create_table(
        "SpeedMessage",
        sa.Column("id", sa.Text(), nullable=False), sa.Column("pairId", sa.Text(), nullable=False), sa.Column("senderId", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False), sa.Column("createdAt", TS, server_default=NOW, nullable=False),
        sa.ForeignKeyConstraint(["pairId"], ["SpeedPair.id"], name="SpeedMessage_pairId_fkey", onupdate="CASCADE", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="SpeedMessage_pkey"),
    )
    op.create_index("SpeedMessage_pairId_createdAt_idx", "SpeedMessage", ["pairId", "createdAt"])


def downgrade() -> None:
    for t in ("SpeedMessage", "SpeedPair", "SpeedRegistration", "SpeedEvent"):
        op.drop_table(t)
