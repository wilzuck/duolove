"""E-mail « De nouveaux profils pour vous » : case du membre `emailNewProfiles` (activée par défaut), date de la dernière tentative
(réservation, jamais deux envois pour une même échéance) et date du dernier envoi réel (point de départ des « nouveaux » profils).

Revision ID: 0052_new_profiles_email
Revises: 0051_blog_soirees_crush
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0052_new_profiles_email"
down_revision = "0051_blog_soirees_crush"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("NotificationPreference", sa.Column("emailNewProfiles", sa.Boolean(), nullable=False, server_default=sa.text("true")))
    op.add_column("NotificationPreference", sa.Column("lastNewProfilesAt", postgresql.TIMESTAMP(precision=3)))
    op.add_column("NotificationPreference", sa.Column("newProfilesSentAt", postgresql.TIMESTAMP(precision=3)))


def downgrade() -> None:
    op.drop_column("NotificationPreference", "newProfilesSentAt")
    op.drop_column("NotificationPreference", "lastNewProfilesAt")
    op.drop_column("NotificationPreference", "emailNewProfiles")
