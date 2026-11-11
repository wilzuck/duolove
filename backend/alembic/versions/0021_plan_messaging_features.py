"""Formules : idées pour briser la glace, appels et rendez-vous deviennent des fonctionnalités par formule.

Premium et VIP les gardent (valeur vraie) ; la formule gratuite ne les a plus. L'administration peut les activer ou les couper pour chaque formule.

Revision ID: 0021_plan_messaging
Revises: 0020_app_install
"""
from alembic import op

revision = "0021_plan_messaging"
down_revision = "0020_app_install"
branch_labels = None
depends_on = None

KEYS = '{"chat_suggestions_enabled": true, "calls_enabled": true, "dates_enabled": true}'


def upgrade() -> None:
    op.execute(f"""UPDATE "SubscriptionPlan" SET features = features || '{KEYS}'::jsonb
                   WHERE code IN ('PREMIUM', 'VIP') AND NOT (features ? 'calls_enabled')""")


def downgrade() -> None:
    op.execute("""UPDATE "SubscriptionPlan" SET features = features - 'chat_suggestions_enabled' - 'calls_enabled' - 'dates_enabled'""")
