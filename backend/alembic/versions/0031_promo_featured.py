"""Codes promo : colonne `featured` (code proposé à tous les membres, affiché avec un bouton « Appliquer »).

Revision ID: 0031_promo_featured
Revises: 0030_blog_articles_2
"""
import sqlalchemy as sa
from alembic import op

revision = "0031_promo_featured"
down_revision = "0030_blog_articles_2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("PromoCode", sa.Column("featured", sa.Boolean(), nullable=False, server_default=sa.text("false")))


def downgrade() -> None:
    op.drop_column("PromoCode", "featured")
