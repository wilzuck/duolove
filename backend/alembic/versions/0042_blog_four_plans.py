"""Blog : les articles qui parlaient de « trois formules » (Gratuit, Premium, VIP) mentionnent désormais Gold.

Remplacement exact de la phrase d'origine dans le corps de l'article : un texte déjà modifié par l'administration n'est pas touché.

Revision ID: 0042_blog_four_plans
Revises: 0041_gold_plan
"""
import sqlalchemy as sa
from alembic import op

revision = "0042_blog_four_plans"
down_revision = "0041_gold_plan"
branch_labels = None
depends_on = None

PAIRS = [
    ('trois formules existent : **Gratuit**, **Premium** et **VIP**. Les deux dernières se paient', 'quatre formules existent : **Gratuit**, **Premium**, **VIP** et **Gold**. Les trois formules payantes se paient'),
    ('Quant aux formules, Gratuit, Premium et VIP, elles se paient en une fois', 'Quant aux formules payantes, Premium, VIP et Gold, elles se paient en une fois'),
    ('Les formules Gratuit, Premium et VIP se paient en une fois', 'Les formules payantes, Premium, VIP et Gold, se paient en une fois'),
]


def upgrade() -> None:
    for old, new in PAIRS:
        op.get_bind().execute(sa.text('UPDATE "BlogPost" SET body = replace(body, :old, :new) WHERE position(:old in body) > 0'), {"old": old, "new": new})


def downgrade() -> None:
    for old, new in PAIRS:
        op.get_bind().execute(sa.text('UPDATE "BlogPost" SET body = replace(body, :new, :old) WHERE position(:new in body) > 0'), {"old": old, "new": new})
