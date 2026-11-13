"""Blog : ajoute 10 nouveaux articles originaux (36 à 45), en BROUILLON et sans image de couverture. N'efface rien.

Pour les mettre en ligne : Administration › Blog › ouvrir l'article › choisir l'image de couverture › passer en « Publié ».
Les articles sont lus dans app/assets/blog/36-*.md à 45-*.md ; un article dont le lien (slug) existe déjà est ignoré.

Revision ID: 0045_blog_articles_4
Revises: 0044_guided_tours
"""
import datetime
import os
import re
import secrets

import sqlalchemy as sa
from alembic import op

revision = "0045_blog_articles_4"
down_revision = "0044_guided_tours"
branch_labels = None
depends_on = None

DIR = os.path.join(os.path.dirname(__file__), "..", "..", "app", "assets", "blog")
HEAD = re.compile(r"\A---\n(.*?)\n---\n(.*)\Z", re.S)


def _articles() -> list[dict]:
    out = []
    for name in sorted(os.listdir(DIR)):
        if not name.endswith(".md") or not ("36" <= name[:2] <= "45"):
            continue
        m = HEAD.match(open(os.path.join(DIR, name), encoding="utf-8").read().replace("\r\n", "\n"))
        if not m:
            raise RuntimeError(f"En-tête manquant dans {name}")
        meta = {k.strip(): v.strip() for k, _, v in (line.partition(":") for line in m.group(1).split("\n") if ":" in line)}
        out.append({"slug": meta["slug"], "title": meta["title"], "excerpt": meta["excerpt"], "coverAlt": meta["coverAlt"], "body": m.group(2).strip()})
    return out


def upgrade() -> None:
    bind = op.get_bind()
    now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
    ins = sa.text('INSERT INTO "BlogPost" ("id","slug","locale","title","excerpt","body","coverAlt","status","createdAt","updatedAt") '
                  "VALUES (:id,:slug,'fr',:title,:excerpt,:body,:alt,'DRAFT',:at,:at) ON CONFLICT (\"locale\", \"slug\") DO NOTHING")
    for i, a in enumerate(_articles()):
        bind.execute(ins, {"id": secrets.token_hex(15), "slug": a["slug"], "title": a["title"], "excerpt": a["excerpt"], "body": a["body"], "alt": a["coverAlt"],
                           "at": now + datetime.timedelta(seconds=i)})


def downgrade() -> None:
    bind = op.get_bind()
    for a in _articles():
        bind.execute(sa.text('DELETE FROM "BlogPost" WHERE "locale"=\'fr\' AND "slug"=:s AND "status"=\'DRAFT\''), {"s": a["slug"]})
