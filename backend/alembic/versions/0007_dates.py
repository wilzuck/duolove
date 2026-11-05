"""Mode rendez-vous : propositions, rappels, partages volontaires ; nouveaux types de notification."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0007_dates"
down_revision = "0006_typing_pref_travel_prompt"
branch_labels = None
depends_on = None

TS = postgresql.TIMESTAMP(precision=3)


def upgrade() -> None:
    with op.get_context().autocommit_block():
        for v in ("DATE_UPDATE", "DATE_REMINDER"):
            op.execute(f"ALTER TYPE \"NotificationType\" ADD VALUE IF NOT EXISTS '{v}'")
    op.create_table(
        "DateProposal",
        sa.Column("id", sa.Text(), nullable=False), sa.Column("conversationId", sa.Text(), nullable=False),
        sa.Column("proposerId", sa.Text(), nullable=False), sa.Column("inviteeId", sa.Text(), nullable=False),
        sa.Column("startsAt", TS, nullable=False), sa.Column("endsAt", TS, nullable=False),
        sa.Column("placeKind", sa.Text(), nullable=False), sa.Column("placeName", sa.Text(), nullable=False), sa.Column("note", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), server_default=sa.text("'PROPOSED'::text"), nullable=False), sa.Column("previousId", sa.Text(), nullable=True),
        sa.Column("proposerFeedback", sa.Integer(), nullable=True), sa.Column("inviteeFeedback", sa.Integer(), nullable=True),
        sa.Column("respondedAt", TS, nullable=True),
        sa.Column("createdAt", TS, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False), sa.Column("updatedAt", TS, nullable=False),
        sa.ForeignKeyConstraint(["conversationId"], ["Conversation.id"], name="DateProposal_conversationId_fkey", onupdate="CASCADE", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["proposerId"], ["User.id"], name="DateProposal_proposerId_fkey", onupdate="CASCADE", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["inviteeId"], ["User.id"], name="DateProposal_inviteeId_fkey", onupdate="CASCADE", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["previousId"], ["DateProposal.id"], name="DateProposal_previousId_fkey", onupdate="CASCADE", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="DateProposal_pkey"),
    )
    op.create_index("DateProposal_conversationId_createdAt_idx", "DateProposal", ["conversationId", "createdAt"])
    op.create_index("DateProposal_status_startsAt_idx", "DateProposal", ["status", "startsAt"])
    op.create_table(
        "DateReminder",
        sa.Column("id", sa.Text(), nullable=False), sa.Column("dateId", sa.Text(), nullable=False), sa.Column("userId", sa.Text(), nullable=False),
        sa.Column("minutesBefore", sa.Integer(), nullable=False), sa.Column("sentAt", TS, nullable=True),
        sa.ForeignKeyConstraint(["dateId"], ["DateProposal.id"], name="DateReminder_dateId_fkey", onupdate="CASCADE", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["userId"], ["User.id"], name="DateReminder_userId_fkey", onupdate="CASCADE", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="DateReminder_pkey"),
    )
    op.create_index("DateReminder_dateId_userId_key", "DateReminder", ["dateId", "userId"], unique=True)
    op.create_index("DateReminder_sentAt_idx", "DateReminder", ["sentAt"])
    op.create_table(
        "DateShare",
        sa.Column("id", sa.Text(), nullable=False), sa.Column("dateId", sa.Text(), nullable=False), sa.Column("userId", sa.Text(), nullable=False),
        sa.Column("tokenHash", sa.Text(), nullable=False), sa.Column("expiresAt", TS, nullable=False), sa.Column("revokedAt", TS, nullable=True),
        sa.Column("createdAt", TS, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["dateId"], ["DateProposal.id"], name="DateShare_dateId_fkey", onupdate="CASCADE", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["userId"], ["User.id"], name="DateShare_userId_fkey", onupdate="CASCADE", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="DateShare_pkey"),
    )
    op.create_index("DateShare_tokenHash_key", "DateShare", ["tokenHash"], unique=True)
    op.create_index("DateShare_dateId_userId_idx", "DateShare", ["dateId", "userId"])


def downgrade() -> None:
    op.drop_table("DateShare")
    op.drop_table("DateReminder")
    op.drop_table("DateProposal")
    raise NotImplementedError("Les valeurs d'enum PostgreSQL ajoutées (DATE_UPDATE, DATE_REMINDER) ne se retirent pas.")
