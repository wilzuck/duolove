"""Saisie semi-automatique des villes (publique : utilisée dès l'inscription)."""
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cities import POPULAR_CITIES, fold, suggest
from app.core.geo import country_from_headers
from app.core.ratelimit import limit
from app.db.session import get_db
from app.models.models import Profile, User

router = APIRouter(prefix="/places", tags=["places"])

_ACCENTS, _PLAIN = "àâäçéèêëîïôöùûüÿñ", "aaaceeeeiioouuuyn"


def _folded(col):
    """Même repli que `fold()` côté SQL (minuscules, sans accents courants, tirets et apostrophes en espaces) : le filtre se fait dans la requête,
    sinon les villes peu peuplées seraient écartées par la limite avant même d'être comparées à la saisie."""
    return func.replace(func.replace(func.translate(func.lower(col), _ACCENTS, _PLAIN), "-", " "), "'", " ")


@router.get("/country", dependencies=[limit(60, 60)])
async def detected_country(request: Request):
    """Pays probable du visiteur (code ISO fourni par Cloudflare), pour PRÉSÉLECTIONNER le pays à l'inscription. Simple indice : le visiteur peut le changer.
    Rien n'est conservé (ni adresse IP, ni ce code) ; None si inconnu (hors Cloudflare, Tor, réseau non localisé)."""
    return {"country": country_from_headers(request.headers)}


@router.get("/cities", dependencies=[limit(120, 60)])
async def cities(country: str = Query("", max_length=2), q: str = Query("", max_length=60), db: AsyncSession = Depends(get_db)):
    """Villes à proposer pour un pays (code ISO), filtrées par la saisie. Villes populaires + villes de membres actifs (au moins 2 par ville)."""
    code = country.upper()
    if code not in POPULAR_CITIES:
        return {"items": []}
    where = [Profile.country == code, User.status == "ACTIVE", Profile.city != ""]
    needle = fold(q)
    if needle:
        where.append(_folded(Profile.city).contains(needle, autoescape=True))
    rows = (await db.execute(
        select(Profile.city, func.count().label("n")).join(User, User.id == Profile.userId).where(*where)
        .group_by(Profile.city).order_by(func.count().desc()).limit(150)
    )).all()
    return {"items": suggest(code, q, [(c, int(n)) for c, n in rows])}
