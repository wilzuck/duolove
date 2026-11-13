"""Blog : les soirées programmées s'appellent désormais « Soirées Crush » (en anglais « Crush Nights »).

Anciens noms remplacés : « soirée Duo », « soirée Match en direct », « soirée en direct » (français) et « Duo Night » (anglais),
pour éviter la confusion avec un Duo (deux personnes qui se plaisent) et rattacher les soirées à l'onglet Crush où elles ont lieu.
L'ancien nom du menu, « Match en direct », devient aussi « Crush en direct ».
Remplace seulement l'expression (titre, résumé, corps), sans toucher au reste du texte : les articles déjà modifiés ou publiés
dans l'administration gardent leurs changements.

Revision ID: 0051_blog_soirees_crush
Revises: 0050_blog_translations_4
"""
import sqlalchemy as sa
from alembic import op

revision = "0051_blog_soirees_crush"
down_revision = "0050_blog_translations_4"
branch_labels = None
depends_on = None

# Dans l'ordre : d'abord les tournures longues, puis les remplacements généraux.
REPLACEMENTS = {
    "fr": [
        ("soirées Match en direct", "Soirées Crush"),
        ("soirée Match en direct", "Soirée Crush"),
        ("soirées en direct", "Soirées Crush"),
        ("soirée en direct", "Soirée Crush"),
        ("Soirées Duo", "Soirées Crush"),
        ("Soirée Duo", "Soirée Crush"),
        ("soirées Duo", "Soirées Crush"),
        ("soirée Duo", "Soirée Crush"),
        # ancien nom du menu (l'onglet Crush) : « Match en direct » devient « Crush en direct »
        ("« Match en direct »", "« Crush en direct »"),
        ("en Match en direct", "dans Crush en direct"),
    ],
    "en": [
        ("Duo Nights", "Crush Nights"),
        ("Duo Night", "Crush Night"),
    ],
}


def upgrade() -> None:
    bind = op.get_bind()
    for locale, pairs in REPLACEMENTS.items():
        for old, new in pairs:
            bind.execute(sa.text('UPDATE "BlogPost" SET "title"=replace("title",:o,:n), "excerpt"=replace("excerpt",:o,:n), "body"=replace("body",:o,:n) '
                                 'WHERE "locale"=:l AND ("title" LIKE :p OR "excerpt" LIKE :p OR "body" LIKE :p)'), {"o": old, "n": new, "l": locale, "p": f"%{old}%"})


def downgrade() -> None:
    pass  # correction de texte : rien à défaire
