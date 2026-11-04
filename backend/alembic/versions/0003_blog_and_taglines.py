"""Blog (articles bilingues avec image de couverture) et accroches des formules modifiables depuis l'admin."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003_blog_and_taglines"
down_revision = "0002_magic_link"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "BlogPost",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("slug", sa.Text(), nullable=False),
        sa.Column("locale", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("excerpt", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("coverKey", sa.Text(), nullable=True),
        sa.Column("coverAlt", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), server_default=sa.text("'DRAFT'::text"), nullable=False),
        sa.Column("publishedAt", postgresql.TIMESTAMP(precision=3), nullable=True),
        sa.Column("authorId", sa.Text(), nullable=True),
        sa.Column("createdAt", postgresql.TIMESTAMP(precision=3), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updatedAt", postgresql.TIMESTAMP(precision=3), nullable=False),
        sa.ForeignKeyConstraint(["authorId"], ["User.id"], name="BlogPost_authorId_fkey", onupdate="CASCADE", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="BlogPost_pkey"),
    )
    op.create_index("BlogPost_locale_slug_key", "BlogPost", ["locale", "slug"], unique=True)
    op.create_index("BlogPost_locale_status_publishedAt_idx", "BlogPost", ["locale", "status", "publishedAt"])
    op.add_column("SubscriptionPlan", sa.Column("taglineFr", sa.Text(), nullable=True))
    op.add_column("SubscriptionPlan", sa.Column("taglineEn", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("SubscriptionPlan", "taglineEn")
    op.drop_column("SubscriptionPlan", "taglineFr")
    op.drop_table("BlogPost")
