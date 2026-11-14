"""Mesure d'audience maison, sans cookie : totaux par jour (`AudienceDaily`) et empreintes du jour pour compter les visiteurs uniques (`AudienceSeen`).
Aucune adresse IP n'est enregistrée : seule une empreinte salée, dont le sel change chaque jour et est jeté, ce qui rend impossible tout rapprochement d'un jour à l'autre.

Revision ID: 0054_site_audience
Revises: 0053_preference_cities
"""
import sqlalchemy as sa
from alembic import op

revision = "0054_site_audience"
down_revision = "0053_preference_cities"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "AudienceDaily",
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("dim", sa.Text(), nullable=False),
        sa.Column("key", sa.Text(), nullable=False),
        sa.Column("views", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("visitors", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.PrimaryKeyConstraint("day", "dim", "key", name="AudienceDaily_pkey"),
    )
    op.create_table(
        "AudienceSeen",
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("hash", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("day", "hash", name="AudienceSeen_pkey"),
    )


def downgrade() -> None:
    op.drop_table("AudienceSeen")
    op.drop_table("AudienceDaily")
