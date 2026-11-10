"""Installations de l'application (PWA) : un identifiant aléatoire par appareil, pour compter sans rien savoir de la personne."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import TIMESTAMP as PGTS

revision = "0020_app_install"
down_revision = "0019_email_suppression"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "AppInstall",
        sa.Column("id", sa.Text(), primary_key=True), sa.Column("platform", sa.Text(), nullable=False),
        sa.Column("createdAt", PGTS(precision=3), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("lastSeenAt", PGTS(precision=3), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("AppInstall_createdAt_idx", "AppInstall", ["createdAt"])


def downgrade() -> None:
    op.drop_table("AppInstall")
