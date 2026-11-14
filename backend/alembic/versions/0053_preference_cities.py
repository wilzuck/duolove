"""Critères de rencontre sur plusieurs villes : `Preference.cities` (liste, vide = toutes les villes), remplie depuis l'ancienne `city`.
`city` est conservée (première ville de la liste) pour les anciens clients ; la découverte lit `cities`.

Revision ID: 0053_preference_cities
Revises: 0052_new_profiles_email
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0053_preference_cities"
down_revision = "0052_new_profiles_email"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("Preference", sa.Column("cities", postgresql.ARRAY(sa.Text()), nullable=False, server_default=sa.text("ARRAY[]::text[]")))
    op.execute("""UPDATE "Preference" SET cities = ARRAY[btrim(city)] WHERE city IS NOT NULL AND btrim(city) <> ''""")


def downgrade() -> None:
    op.drop_column("Preference", "cities")
