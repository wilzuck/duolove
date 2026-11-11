"""Formules : les appels audio / vidéo sont coupés par défaut tant que le fournisseur réel (LiveKit) n'est pas branché et testé.

Rendez-vous et idées de messagerie restent actifs pour Premium et VIP. L'administrateur peut réactiver les appels par formule.

Revision ID: 0022_plan_calls_off
Revises: 0021_plan_messaging
"""
from alembic import op

revision = "0022_plan_calls_off"
down_revision = "0021_plan_messaging"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""UPDATE "SubscriptionPlan" SET features = features || '{"calls_enabled": false}'::jsonb WHERE code IN ('PREMIUM', 'VIP')""")


def downgrade() -> None:
    op.execute("""UPDATE "SubscriptionPlan" SET features = features || '{"calls_enabled": true}'::jsonb WHERE code IN ('PREMIUM', 'VIP')""")
