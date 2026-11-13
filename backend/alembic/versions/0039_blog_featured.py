"""Blog : article « À la une » choisi à la main (un seul par langue ; sinon le plus récent) et compteur de visites.

Revision ID: 0039_blog_featured
Revises: 0038_blog_articles_3
"""
import sqlalchemy as sa
from alembic import op

revision = "0039_blog_featured"
down_revision = "0038_blog_articles_3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("BlogPost", sa.Column("featured", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("BlogPost", sa.Column("views", sa.Integer(), nullable=False, server_default=sa.text("0")))


def downgrade() -> None:
    op.drop_column("BlogPost", "views")
    op.drop_column("BlogPost", "featured")
