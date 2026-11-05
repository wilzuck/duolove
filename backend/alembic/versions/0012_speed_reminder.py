"""Speed dating : rappel de début (horodatage d'envoi) et type de notification."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0012_speed_reminder"
down_revision = "0011_speed_dating"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE \"NotificationType\" ADD VALUE IF NOT EXISTS 'SPEED_REMINDER'")
    op.add_column("SpeedEvent", sa.Column("remindedAt", postgresql.TIMESTAMP(precision=3), nullable=True))


def downgrade() -> None:
    op.drop_column("SpeedEvent", "remindedAt")
