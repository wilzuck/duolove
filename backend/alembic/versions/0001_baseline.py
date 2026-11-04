"""Schéma initial (hérité de Prisma).

Sur une base déjà créée par Prisma (table « User » présente), la migration ne fait rien :
le schéma est identique. Sur une base vide, elle crée tout.
"""
from pathlib import Path

from alembic import op
import sqlalchemy as sa

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    if conn.execute(sa.text("SELECT to_regclass('public.\"User\"')")).scalar():
        return
    sql = (Path(__file__).with_suffix(".sql")).read_text()
    conn.exec_driver_sql(sql)


def downgrade() -> None:
    raise NotImplementedError("Le schéma initial ne se défait pas.")
