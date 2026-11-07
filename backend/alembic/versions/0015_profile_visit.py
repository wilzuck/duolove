"""Visiteurs du profil : qui a consulté mon profil (une ligne par couple visiteur / profil visité)."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0015_profile_visit"
down_revision = "0014_contact_message"
branch_labels = None
depends_on = None

TS = postgresql.TIMESTAMP(precision=3)


def upgrade() -> None:
    op.create_table(
        "ProfileVisit",
        sa.Column("id", sa.Text(), nullable=False), sa.Column("viewerId", sa.Text(), nullable=False), sa.Column("visitedId", sa.Text(), nullable=False),
        sa.Column("visits", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("lastVisitAt", TS, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["viewerId"], ["User.id"], name="ProfileVisit_viewerId_fkey", onupdate="CASCADE", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["visitedId"], ["User.id"], name="ProfileVisit_visitedId_fkey", onupdate="CASCADE", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="ProfileVisit_pkey"),
    )
    op.create_index("ProfileVisit_viewerId_visitedId_key", "ProfileVisit", ["viewerId", "visitedId"], unique=True)
    op.create_index("ProfileVisit_visitedId_lastVisitAt_idx", "ProfileVisit", ["visitedId", "lastVisitAt"])


def downgrade() -> None:
    op.drop_table("ProfileVisit")
