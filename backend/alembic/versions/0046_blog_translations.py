"""Blog : lien entre les versions d'un même article dans les deux langues (translationKey), et 15 articles traduits en anglais.

Les traductions sont lues dans app/assets/blog/en/*.md (champ « translationOf » = lien de l'article français). Elles sont ajoutées
en BROUILLON, sans image de couverture, et liées à leur article français : à publier depuis Administration › Blog.
Un article anglais dont le lien (slug) existe déjà est ignoré ; rien n'est effacé.

Revision ID: 0046_blog_translations
Revises: 0045_blog_articles_4
"""
import datetime
import os
import re
import secrets

import sqlalchemy as sa
from alembic import op

revision = "0046_blog_translations"
down_revision = "0045_blog_articles_4"
branch_labels = None
depends_on = None

DIR = os.path.join(os.path.dirname(__file__), "..", "..", "app", "assets", "blog", "en")
# Les 15 premières traductions ; les suivantes sont ajoutées par leurs propres migrations (0048…).
FIRST = {"01", "02", "03", "07", "08", "09", "12", "21", "22", "26", "27", "28", "33", "41", "43"}
HEAD = re.compile(r"\A---\n(.*?)\n---\n(.*)\Z", re.S)


def _articles() -> list[dict]:
    out = []
    for name in sorted(os.listdir(DIR)):
        if not name.endswith(".md") or name[:2] not in FIRST:
            continue
        m = HEAD.match(open(os.path.join(DIR, name), encoding="utf-8").read().replace("\r\n", "\n"))
        if not m:
            raise RuntimeError(f"En-tête manquant dans {name}")
        meta = {k.strip(): v.strip() for k, _, v in (line.partition(":") for line in m.group(1).split("\n") if ":" in line)}
        out.append({"slug": meta["slug"], "of": meta["translationOf"], "title": meta["title"], "excerpt": meta["excerpt"], "coverAlt": meta["coverAlt"], "body": m.group(2).strip()})
    return out


def upgrade() -> None:
    op.add_column("BlogPost", sa.Column("translationKey", sa.Text(), nullable=True))
    op.create_index("BlogPost_translationKey_locale_key", "BlogPost", ["translationKey", "locale"], unique=True, postgresql_where=sa.text('"translationKey" IS NOT NULL'))

    bind = op.get_bind()
    now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
    ins = sa.text('INSERT INTO "BlogPost" ("id","slug","locale","title","excerpt","body","coverAlt","status","translationKey","createdAt","updatedAt") '
                  "VALUES (:id,:slug,'en',:title,:excerpt,:body,:alt,'DRAFT',:key,:at,:at) ON CONFLICT (\"locale\", \"slug\") DO NOTHING")
    for i, a in enumerate(_articles()):
        key = None
        fr = bind.execute(sa.text('SELECT "id","translationKey" FROM "BlogPost" WHERE "locale"=\'fr\' AND "slug"=:s'), {"s": a["of"]}).first()
        if fr:
            key = fr.translationKey or secrets.token_hex(12)
            taken = bind.execute(sa.text('SELECT 1 FROM "BlogPost" WHERE "locale"=\'en\' AND "translationKey"=:k'), {"k": key}).first()
            if taken:
                key = None  # l'article français a déjà une version anglaise liée : on n'y touche pas
            elif not fr.translationKey:
                bind.execute(sa.text('UPDATE "BlogPost" SET "translationKey"=:k WHERE "id"=:id'), {"k": key, "id": fr.id})
        bind.execute(ins, {"id": secrets.token_hex(15), "slug": a["slug"], "title": a["title"], "excerpt": a["excerpt"], "body": a["body"], "alt": a["coverAlt"],
                           "key": key, "at": now + datetime.timedelta(seconds=i)})


def downgrade() -> None:
    bind = op.get_bind()
    for a in _articles():
        bind.execute(sa.text('DELETE FROM "BlogPost" WHERE "locale"=\'en\' AND "slug"=:s AND "status"=\'DRAFT\''), {"s": a["slug"]})
    op.drop_index("BlogPost_translationKey_locale_key", table_name="BlogPost")
    op.drop_column("BlogPost", "translationKey")
