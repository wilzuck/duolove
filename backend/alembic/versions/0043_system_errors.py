"""Suivi des erreurs système : une ligne par erreur distincte (empreinte), avec compteur, première et dernière occurrence, résolution.

Revision ID: 0043_system_errors
Revises: 0042_blog_four_plans
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0043_system_errors"
down_revision = "0042_blog_four_plans"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "SystemError",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("fingerprint", sa.Text(), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("path", sa.Text()),
        sa.Column("method", sa.Text()),
        sa.Column("status", sa.Integer()),
        sa.Column("stack", sa.Text()),
        sa.Column("userAgent", sa.Text()),
        sa.Column("lastUserId", sa.Text()),
        sa.Column("release", sa.Text()),
        sa.Column("count", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("regressed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("firstSeenAt", postgresql.TIMESTAMP(precision=3), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("lastSeenAt", postgresql.TIMESTAMP(precision=3), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("resolvedAt", postgresql.TIMESTAMP(precision=3)),
        sa.Column("resolvedById", sa.Text()),
        sa.Column("note", sa.Text()),
    )
    op.create_index("SystemError_fingerprint_key", "SystemError", ["fingerprint"], unique=True)
    op.create_index("SystemError_resolvedAt_lastSeenAt_idx", "SystemError", ["resolvedAt", "lastSeenAt"])


def downgrade() -> None:
    op.drop_index("SystemError_resolvedAt_lastSeenAt_idx", table_name="SystemError")
    op.drop_index("SystemError_fingerprint_key", table_name="SystemError")
    op.drop_table("SystemError")
