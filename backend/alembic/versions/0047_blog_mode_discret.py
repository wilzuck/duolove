"""Blog : « mode privé » (ancien nom) devient « mode discret » dans les articles français.

Remplace seulement l'expression (titre, résumé, corps), sans toucher au reste du texte : les articles déjà modifiés ou publiés
dans l'administration gardent leurs changements. Deux phrases sont ajustées pour éviter la répétition de « discret ».

Revision ID: 0047_blog_mode_discret
Revises: 0046_blog_translations
"""
import sqlalchemy as sa
from alembic import op

revision = "0047_blog_mode_discret"
down_revision = "0046_blog_translations"
branch_labels = None
depends_on = None

# Dans l'ordre : d'abord les tournures ajustées, puis le remplacement général.
REPLACEMENTS = [
    ("Si vous préférez rester discret au début, le mode privé", "Si vous préférez rester en retrait au début, le mode discret"),
    ("si vous souhaitez vous faire plus discret un temps", "si vous souhaitez vous faire plus réservé un temps"),
    ("mode privé", "mode discret"),
    ("Mode privé", "Mode discret"),
]


def upgrade() -> None:
    bind = op.get_bind()
    for old, new in REPLACEMENTS:
        bind.execute(sa.text('UPDATE "BlogPost" SET "title"=replace("title",:o,:n), "excerpt"=replace("excerpt",:o,:n), "body"=replace("body",:o,:n) '
                             'WHERE "locale"=\'fr\' AND ("title" LIKE :p OR "excerpt" LIKE :p OR "body" LIKE :p)'), {"o": old, "n": new, "p": f"%{old}%"})


def downgrade() -> None:
    pass  # correction de texte : rien à défaire
