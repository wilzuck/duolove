"""Engagement : questions de personnalité, likes commentés, découvertes du jour."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004_engagement"
down_revision = "0003_blog_and_taglines"
branch_labels = None
depends_on = None

TS = postgresql.TIMESTAMP(precision=3)


def upgrade() -> None:
    op.create_table(
        "ProfilePrompt",
        sa.Column("id", sa.Text(), nullable=False), sa.Column("slug", sa.Text(), nullable=False),
        sa.Column("textFr", sa.Text(), nullable=False), sa.Column("textEn", sa.Text(), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("sortOrder", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("createdAt", TS, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="ProfilePrompt_pkey"),
    )
    op.create_index("ProfilePrompt_slug_key", "ProfilePrompt", ["slug"], unique=True)
    op.create_table(
        "ProfilePromptAnswer",
        sa.Column("id", sa.Text(), nullable=False), sa.Column("userId", sa.Text(), nullable=False), sa.Column("promptId", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False), sa.Column("position", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("createdAt", TS, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False), sa.Column("updatedAt", TS, nullable=False),
        sa.ForeignKeyConstraint(["userId"], ["User.id"], name="ProfilePromptAnswer_userId_fkey", onupdate="CASCADE", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["promptId"], ["ProfilePrompt.id"], name="ProfilePromptAnswer_promptId_fkey", onupdate="CASCADE", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="ProfilePromptAnswer_pkey"),
    )
    op.create_index("ProfilePromptAnswer_userId_promptId_key", "ProfilePromptAnswer", ["userId", "promptId"], unique=True)
    op.create_index("ProfilePromptAnswer_userId_position_idx", "ProfilePromptAnswer", ["userId", "position"])
    op.create_table(
        "DailyRecommendation",
        sa.Column("id", sa.Text(), nullable=False), sa.Column("userId", sa.Text(), nullable=False), sa.Column("targetId", sa.Text(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False), sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("reasons", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("createdAt", TS, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["userId"], ["User.id"], name="DailyRecommendation_userId_fkey", onupdate="CASCADE", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["targetId"], ["User.id"], name="DailyRecommendation_targetId_fkey", onupdate="CASCADE", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="DailyRecommendation_pkey"),
    )
    op.create_index("DailyRecommendation_userId_targetId_day_key", "DailyRecommendation", ["userId", "targetId", "day"], unique=True)
    op.create_index("DailyRecommendation_userId_day_idx", "DailyRecommendation", ["userId", "day"])
    op.add_column("Swipe", sa.Column("comment", sa.Text(), nullable=True))
    op.add_column("Swipe", sa.Column("targetKind", sa.Text(), nullable=True))
    op.add_column("Swipe", sa.Column("targetRef", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("Swipe", "targetRef")
    op.drop_column("Swipe", "targetKind")
    op.drop_column("Swipe", "comment")
    op.drop_table("DailyRecommendation")
    op.drop_table("ProfilePromptAnswer")
    op.drop_table("ProfilePrompt")
