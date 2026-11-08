"""Renommage du menu « Match » en « Crush » : noms des packs de jetons déjà enregistrés."""
from alembic import op

revision = "0016_rename_crush_products"
down_revision = "0015_profile_visit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""UPDATE "Product" SET name = replace(name, 'tokens Match', 'tokens Crush') WHERE name LIKE '%tokens Match%'""")


def downgrade() -> None:
    op.execute("""UPDATE "Product" SET name = replace(name, 'tokens Crush', 'tokens Match') WHERE name LIKE '%tokens Crush%'""")
