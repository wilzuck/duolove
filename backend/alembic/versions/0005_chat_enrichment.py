"""Messagerie enrichie : réactions, réponses à un message précis, modèles de brise-glace."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0005_chat_enrichment"
down_revision = "0004_engagement"
branch_labels = None
depends_on = None

TS = postgresql.TIMESTAMP(precision=3)


def upgrade() -> None:
    op.add_column("Message", sa.Column("replyToId", sa.Text(), nullable=True))
    op.create_foreign_key("Message_replyToId_fkey", "Message", "Message", ["replyToId"], ["id"], onupdate="CASCADE", ondelete="SET NULL")
    op.create_table(
        "MessageReaction",
        sa.Column("id", sa.Text(), nullable=False), sa.Column("messageId", sa.Text(), nullable=False), sa.Column("userId", sa.Text(), nullable=False),
        sa.Column("emoji", sa.Text(), nullable=False), sa.Column("createdAt", TS, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["messageId"], ["Message.id"], name="MessageReaction_messageId_fkey", onupdate="CASCADE", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["userId"], ["User.id"], name="MessageReaction_userId_fkey", onupdate="CASCADE", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="MessageReaction_pkey"),
    )
    op.create_index("MessageReaction_messageId_userId_key", "MessageReaction", ["messageId", "userId"], unique=True)
    op.create_table(
        "IcebreakerTemplate",
        sa.Column("id", sa.Text(), nullable=False), sa.Column("slug", sa.Text(), nullable=False), sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("key", sa.Text(), nullable=True), sa.Column("textFr", sa.Text(), nullable=False), sa.Column("textEn", sa.Text(), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False), sa.Column("sortOrder", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("createdAt", TS, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="IcebreakerTemplate_pkey"),
    )
    op.create_index("IcebreakerTemplate_slug_key", "IcebreakerTemplate", ["slug"], unique=True)


def downgrade() -> None:
    op.drop_table("IcebreakerTemplate")
    op.drop_table("MessageReaction")
    op.drop_constraint("Message_replyToId_fkey", "Message", type_="foreignkey")
    op.drop_column("Message", "replyToId")
