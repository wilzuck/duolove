"""Question du jour : questions planifiées ou en rotation, réponses des membres."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0013_daily_question"
down_revision = "0012_speed_reminder"
branch_labels = None
depends_on = None

TS = postgresql.TIMESTAMP(precision=3)


def upgrade() -> None:
    op.create_table(
        "DailyQuestion",
        sa.Column("id", sa.Text(), nullable=False), sa.Column("day", sa.Date(), nullable=True), sa.Column("textFr", sa.Text(), nullable=False), sa.Column("textEn", sa.Text(), nullable=False),
        sa.Column("options", postgresql.JSONB(), nullable=False), sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("createdAt", TS, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="DailyQuestion_pkey"),
    )
    op.create_index("DailyQuestion_day_key", "DailyQuestion", ["day"], unique=True)
    op.create_table(
        "DailyQuestionAnswer",
        sa.Column("id", sa.Text(), nullable=False), sa.Column("questionId", sa.Text(), nullable=False), sa.Column("userId", sa.Text(), nullable=False),
        sa.Column("optionKey", sa.Text(), nullable=False), sa.Column("createdAt", TS, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["questionId"], ["DailyQuestion.id"], name="DailyQuestionAnswer_questionId_fkey", onupdate="CASCADE", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["userId"], ["User.id"], name="DailyQuestionAnswer_userId_fkey", onupdate="CASCADE", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="DailyQuestionAnswer_pkey"),
    )
    op.create_index("DailyQuestionAnswer_questionId_userId_key", "DailyQuestionAnswer", ["questionId", "userId"], unique=True)
    op.create_index("DailyQuestionAnswer_userId_idx", "DailyQuestionAnswer", ["userId"])


def downgrade() -> None:
    op.drop_table("DailyQuestionAnswer")
    op.drop_table("DailyQuestion")
