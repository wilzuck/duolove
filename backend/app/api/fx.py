"""Taux de change publics pour afficher les prix aussi dans la devise du visiteur (indicatif : le paiement reste en FCFA)."""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import fx, launch
from app.core.geo import country_from_headers
from app.core.ratelimit import limit
from app.db.session import get_db

router = APIRouter(tags=["fx"])


@router.get("/fx", dependencies=[limit(60, 60)])
async def rates(request: Request, db: AsyncSession = Depends(get_db)):
    """Unités pour 1 FCFA des devises des pays ouverts, et devise proposée d'après le pays du visiteur (Cloudflare). Rien n'est conservé sur le visiteur."""
    cur = await fx.current(db)
    rates = fx.for_countries(cur["rates"], await launch.enabled(db))  # seulement les devises des pays ouverts
    country = country_from_headers(request.headers)
    return {**cur, "rates": rates, "country": country, "detected": fx.currency_for_country(country, rates)}
