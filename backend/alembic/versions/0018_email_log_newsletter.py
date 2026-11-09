"""Suivi des e-mails envoyés (EmailLog) et newsletter (abonnés, envois)."""
import sqlalchemy as sa
from alembic import op

revision = "0018_email_log_newsletter"
down_revision = "0017_profile_show_activity"
branch_labels = None
depends_on = None

from sqlalchemy.dialects.postgresql import TIMESTAMP as PGTS

TS = PGTS(precision=3)
NOW = sa.text("CURRENT_TIMESTAMP")


def upgrade() -> None:
    op.create_table(
        "EmailLog",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("toEmail", sa.Text(), nullable=False), sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False, server_default=sa.text("'other'")), sa.Column("status", sa.Text(), nullable=False),
        sa.Column("provider", sa.Text(), nullable=False, server_default=sa.text("'dev'")), sa.Column("error", sa.Text()), sa.Column("campaignId", sa.Text()),
        sa.Column("createdAt", TS, nullable=False, server_default=NOW),
    )
    op.create_index("EmailLog_createdAt_idx", "EmailLog", ["createdAt"])
    op.create_index("EmailLog_status_createdAt_idx", "EmailLog", ["status", "createdAt"])
    op.create_index("EmailLog_campaignId_idx", "EmailLog", ["campaignId"])
    op.create_table(
        "NewsletterSubscriber",
        sa.Column("id", sa.Text(), primary_key=True), sa.Column("email", sa.Text(), nullable=False), sa.Column("token", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'PENDING'")), sa.Column("source", sa.Text(), nullable=False, server_default=sa.text("'site'")),
        sa.Column("createdAt", TS, nullable=False, server_default=NOW), sa.Column("confirmedAt", TS), sa.Column("unsubscribedAt", TS), sa.Column("userId", sa.Text()),
    )
    op.create_index("NewsletterSubscriber_email_key", "NewsletterSubscriber", ["email"], unique=True)
    op.create_index("NewsletterSubscriber_token_key", "NewsletterSubscriber", ["token"], unique=True)
    op.create_index("NewsletterSubscriber_status_idx", "NewsletterSubscriber", ["status"])
    op.create_table(
        "NewsletterCampaign",
        sa.Column("id", sa.Text(), primary_key=True), sa.Column("subject", sa.Text(), nullable=False), sa.Column("preheader", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("body", sa.Text(), nullable=False), sa.Column("ctaLabel", sa.Text()), sa.Column("ctaUrl", sa.Text()),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'DRAFT'")),
        sa.Column("recipients", sa.Integer(), nullable=False, server_default=sa.text("0")), sa.Column("sent", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("failed", sa.Integer(), nullable=False, server_default=sa.text("0")), sa.Column("createdById", sa.Text()),
        sa.Column("createdAt", TS, nullable=False, server_default=NOW), sa.Column("sentAt", TS),
    )
    op.create_index("NewsletterCampaign_status_createdAt_idx", "NewsletterCampaign", ["status", "createdAt"])


def downgrade() -> None:
    op.drop_table("NewsletterCampaign")
    op.drop_table("NewsletterSubscriber")
    op.drop_table("EmailLog")
