"""Confirmation d'e-mail par code à 6 chiffres (essais limités, expiration courte)."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0009_email_code"
down_revision = "0008_rhythm"
branch_labels = None
depends_on = None

TS = postgresql.TIMESTAMP(precision=3)


def upgrade() -> None:
    op.create_table(
        "EmailCode",
        sa.Column("id", sa.Text(), nullable=False), sa.Column("userId", sa.Text(), nullable=False), sa.Column("codeHash", sa.Text(), nullable=False),
        sa.Column("attempts", sa.Integer(), server_default=sa.text("0"), nullable=False), sa.Column("expiresAt", TS, nullable=False), sa.Column("consumedAt", TS, nullable=True),
        sa.Column("createdAt", TS, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["userId"], ["User.id"], name="EmailCode_userId_fkey", onupdate="CASCADE", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="EmailCode_pkey"),
    )
    op.create_index("EmailCode_userId_createdAt_idx", "EmailCode", ["userId", "createdAt"])


def downgrade() -> None:
    op.drop_table("EmailCode")
