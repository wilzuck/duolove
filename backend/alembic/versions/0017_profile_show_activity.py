"""Statut d'activité (« en ligne », « actif aujourd'hui ») : chaque membre peut choisir de ne pas l'afficher."""
import sqlalchemy as sa
from alembic import op

revision = "0017_profile_show_activity"
down_revision = "0016_rename_crush_products"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("Profile", sa.Column("showActivity", sa.Boolean(), nullable=False, server_default=sa.text("true")))


def downgrade() -> None:
    op.drop_column("Profile", "showActivity")
