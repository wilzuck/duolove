"""Adresses bloquées après un rebond définitif ou une plainte (retours d'Amazon SES)."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import TIMESTAMP as PGTS

revision = "0019_email_suppression"
down_revision = "0018_email_log_newsletter"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "EmailSuppression",
        sa.Column("id", sa.Text(), primary_key=True), sa.Column("email", sa.Text(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False), sa.Column("detail", sa.Text()),
        sa.Column("createdAt", PGTS(precision=3), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("EmailSuppression_email_key", "EmailSuppression", ["email"], unique=True)
    op.create_index("EmailSuppression_createdAt_idx", "EmailSuppression", ["createdAt"])


def downgrade() -> None:
    op.drop_table("EmailSuppression")
