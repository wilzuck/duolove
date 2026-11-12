"""« Membre depuis » : mois d'inscription seulement (jamais le jour), repère « Nouveau » pendant 14 jours."""
import datetime

from sqlalchemy import update

from app.core.profile_card import member_since
from app.db.session import session_maker
from app.models.models import User
from tests.support_c import member


def test_mois_seulement_et_nouveau_14_jours():
    now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
    assert member_since(None) == (None, False)
    since, new = member_since(now - datetime.timedelta(days=3))
    assert len(since) == 7 and since[4] == "-" and new is True  # « AAAA-MM » : pas de jour
    assert member_since(now - datetime.timedelta(days=13, hours=23))[1] is True
    assert member_since(now - datetime.timedelta(days=15))[1] is False
    assert member_since(datetime.datetime(2025, 3, 28, 23, 59)) == ("2025-03", False)


async def test_profil_d_un_autre_membre_expose_membre_depuis(app, db):
    viewer, fresh, old = await member(app, db), await member(app, db), await member(app, db)
    async with session_maker()() as s:
        await s.execute(update(User).where(User.id == old.id).values(createdAt=datetime.datetime(2025, 3, 28, 10, 0)))
        await s.commit()
    a = (await viewer.agent.get(f"/api/profiles/{fresh.id}")).json()
    b = (await viewer.agent.get(f"/api/profiles/{old.id}")).json()
    assert a["isNew"] is True and len(a["memberSince"]) == 7
    assert b["memberSince"] == "2025-03" and b["isNew"] is False  # le jour (28) n'apparaît nulle part
    assert "28" not in str(b["memberSince"])
