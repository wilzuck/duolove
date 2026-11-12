"""Blog : remplace les articles existants par 10 articles originaux, enregistrés en BROUILLON sans image de couverture.

Pour les mettre en ligne : Administration › Blog › ouvrir l'article › choisir l'image de couverture › passer en « Publié ».
(La description de l'image, exigée pour publier, est déjà renseignée.) Les articles sont lus dans app/assets/blog/*.md.

Revision ID: 0029_blog_articles
Revises: 0028_live_events
"""
import datetime
import os
import re
import secrets

import sqlalchemy as sa
from alembic import op

revision = "0029_blog_articles"
down_revision = "0028_live_events"
branch_labels = None
depends_on = None

DIR = os.path.join(os.path.dirname(__file__), "..", "..", "app", "assets", "blog")
HEAD = re.compile(r"\A---\n(.*?)\n---\n(.*)\Z", re.S)


def _articles() -> list[dict]:
    out = []
    for name in sorted(os.listdir(DIR)):
        if not name.endswith(".md"):
            continue
        m = HEAD.match(open(os.path.join(DIR, name), encoding="utf-8").read().replace("\r\n", "\n"))
        if not m:
            raise RuntimeError(f"En-tête manquant dans {name}")
        meta = {k.strip(): v.strip() for k, _, v in (line.partition(":") for line in m.group(1).split("\n") if ":" in line)}
        out.append({"slug": meta["slug"], "title": meta["title"], "excerpt": meta["excerpt"], "coverAlt": meta["coverAlt"], "body": m.group(2).strip()})
    return out


def upgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text('DELETE FROM "BlogPost"'))
    now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
    ins = sa.text('INSERT INTO "BlogPost" ("id","slug","locale","title","excerpt","body","coverAlt","status","createdAt","updatedAt") '
                  "VALUES (:id,:slug,'fr',:title,:excerpt,:body,:alt,'DRAFT',:at,:at)")
    for i, a in enumerate(_articles()):
        bind.execute(ins, {"id": secrets.token_hex(15), "slug": a["slug"], "title": a["title"], "excerpt": a["excerpt"], "body": a["body"], "alt": a["coverAlt"],
                           "at": now + datetime.timedelta(seconds=i)})


def downgrade() -> None:
    bind = op.get_bind()
    for a in _articles():
        bind.execute(sa.text('DELETE FROM "BlogPost" WHERE "locale"=\'fr\' AND "slug"=:s'), {"s": a["slug"]})
