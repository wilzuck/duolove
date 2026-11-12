"""Double authentification (TOTP) : colonnes sur User et valeur TWO_FACTOR du type de jeton.

Revision ID: 0035_two_factor
Revises: 0034_launch_cities_waitlist
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0035_two_factor"
down_revision = "0034_launch_cities_waitlist"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE \"TokenType\" ADD VALUE IF NOT EXISTS 'TWO_FACTOR'")
    op.add_column("User", sa.Column("totpSecretEnc", sa.Text()))
    op.add_column("User", sa.Column("totpEnabledAt", postgresql.TIMESTAMP(precision=3)))
    op.add_column("User", sa.Column("totpLastStep", sa.BigInteger()))
    op.add_column("User", sa.Column("totpRecovery", postgresql.JSONB()))


def downgrade() -> None:
    for c in ("totpRecovery", "totpLastStep", "totpEnabledAt", "totpSecretEnc"):
        op.drop_column("User", c)
