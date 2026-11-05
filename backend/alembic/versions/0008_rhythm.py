"""Fidélisation éthique : mode pause, périodes de repos, rappels de rendez-vous facultatifs, suivi des e-mails envoyés."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0008_rhythm"
down_revision = "0007_dates"
branch_labels = None
depends_on = None

TS = postgresql.TIMESTAMP(precision=3)


def upgrade() -> None:
    op.add_column("Profile", sa.Column("pausedAt", TS, nullable=True))
    op.add_column("Profile", sa.Column("pauseEndsAt", TS, nullable=True))
    op.add_column("NotificationPreference", sa.Column("quietStart", sa.Integer(), nullable=True))
    op.add_column("NotificationPreference", sa.Column("quietEnd", sa.Integer(), nullable=True))
    op.add_column("NotificationPreference", sa.Column("tzOffsetMinutes", sa.Integer(), server_default=sa.text("0"), nullable=False))
    op.add_column("NotificationPreference", sa.Column("dateReminders", sa.Boolean(), server_default=sa.text("true"), nullable=False))
    op.add_column("Notification", sa.Column("emailedAt", TS, nullable=True))


def downgrade() -> None:
    op.drop_column("Notification", "emailedAt")
    op.drop_column("NotificationPreference", "dateReminders")
    op.drop_column("NotificationPreference", "tzOffsetMinutes")
    op.drop_column("NotificationPreference", "quietEnd")
    op.drop_column("NotificationPreference", "quietStart")
    op.drop_column("Profile", "pauseEndsAt")
    op.drop_column("Profile", "pausedAt")
