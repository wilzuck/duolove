"""Jeton de connexion par lien magique (nouvelle valeur de l'enum TokenType)."""
from alembic import op

revision = "0002_magic_link"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ALTER TYPE … ADD VALUE ne peut pas s'utiliser dans la transaction qui l'ajoute : bloc autocommit.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE \"TokenType\" ADD VALUE IF NOT EXISTS 'MAGIC_LINK'")


def downgrade() -> None:
    raise NotImplementedError("Une valeur d'enum PostgreSQL ne se retire pas.")
