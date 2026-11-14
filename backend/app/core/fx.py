"""Prix affichés aussi dans la devise du visiteur, À TITRE INDICATIF : le paiement se fait toujours en FCFA (XOF).

- Devise devinée d'après le pays fourni par Cloudflare (en-tête CF-IPCountry, voir `geo`) ; le visiteur peut en choisir une autre.
- Taux du jour pris chez ExchangeRate-API (offre gratuite, sans clé, attribution affichée sur le site), rafraîchis toutes les 12 h
  au plus et gardés dans SystemSetting : un redémarrage ou une panne de la source ne vide pas les taux. Aucune donnée du visiteur
  n'est envoyée à la source (simple requête des taux).
- Les monnaies à parité fixe avec l'euro (FCFA d'Afrique de l'Ouest et centrale, euro, franc comorien, escudo cap-verdien) utilisent
  toujours leur parité officielle, plus exacte que la cotation du marché et disponible même sans la source.
"""
from __future__ import annotations

import asyncio
import datetime
import logging
import math
import time
from collections.abc import Awaitable, Callable

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ids import utcnow
from app.models.models import SystemSetting

log = logging.getLogger(__name__)

KEY = "fx.rates"
SOURCE_URL = "https://open.er-api.com/v6/latest/USD"  # base USD : plus de décimales que la base XOF (0,001524 € seulement)
REFRESH = datetime.timedelta(hours=12)
RETRY = datetime.timedelta(minutes=30)  # après un échec de la source, pas de nouvel essai avant ce délai
MEMORY_SECONDS = 600

EUR_XOF = 655.957
# Unités de chaque devise pour 1 FCFA (XOF), à parité fixe.
PEGGED: dict[str, float] = {"XOF": 1.0, "XAF": 1.0, "EUR": 1 / EUR_XOF, "KMF": 491.96775 / EUR_XOF, "CVE": 110.265 / EUR_XOF}

# Pays (ISO 3166-1) → devise d'usage (ISO 4217). Pays absent ou devise sans taux : dollar américain.
_COUNTRIES = """
AD:EUR AE:AED AF:AFN AG:XCD AI:XCD AL:ALL AM:AMD AO:AOA AR:ARS AS:USD AT:EUR AU:AUD AW:AWG AX:EUR AZ:AZN BA:BAM BB:BBD BD:BDT BE:EUR
BF:XOF BG:EUR BH:BHD BI:BIF BJ:XOF BL:EUR BM:BMD BN:BND BO:BOB BQ:USD BR:BRL BS:BSD BT:BTN BW:BWP BY:BYN BZ:BZD CA:CAD CC:AUD CD:CDF
CF:XAF CG:XAF CH:CHF CI:XOF CK:NZD CL:CLP CM:XAF CN:CNY CO:COP CR:CRC CU:CUP CV:CVE CW:XCG CX:AUD CY:EUR CZ:CZK DE:EUR DJ:DJF DK:DKK
DM:XCD DO:DOP DZ:DZD EC:USD EE:EUR EG:EGP EH:MAD ER:ERN ES:EUR ET:ETB FI:EUR FJ:FJD FK:FKP FM:USD FO:DKK FR:EUR GA:XAF GB:GBP GD:XCD
GE:GEL GF:EUR GG:GBP GH:GHS GI:GIP GL:DKK GM:GMD GN:GNF GP:EUR GQ:XAF GR:EUR GT:GTQ GU:USD GW:XOF GY:GYD HK:HKD HN:HNL HR:EUR HT:HTG
HU:HUF ID:IDR IE:EUR IL:ILS IM:GBP IN:INR IO:USD IQ:IQD IR:IRR IS:ISK IT:EUR JE:GBP JM:JMD JO:JOD JP:JPY KE:KES KG:KGS KH:KHR KI:AUD
KM:KMF KN:XCD KP:KPW KR:KRW KW:KWD KY:KYD KZ:KZT LA:LAK LB:LBP LC:XCD LI:CHF LK:LKR LR:LRD LS:LSL LT:EUR LU:EUR LV:EUR LY:LYD MA:MAD
MC:EUR MD:MDL ME:EUR MF:EUR MG:MGA MH:USD MK:MKD ML:XOF MM:MMK MN:MNT MO:MOP MP:USD MQ:EUR MR:MRU MS:XCD MT:EUR MU:MUR MV:MVR MW:MWK
MX:MXN MY:MYR MZ:MZN NA:NAD NC:XPF NE:XOF NF:AUD NG:NGN NI:NIO NL:EUR NO:NOK NP:NPR NR:AUD NU:NZD NZ:NZD OM:OMR PA:USD PE:PEN PF:XPF
PG:PGK PH:PHP PK:PKR PL:PLN PM:EUR PN:NZD PR:USD PS:ILS PT:EUR PW:USD PY:PYG QA:QAR RE:EUR RO:RON RS:RSD RU:RUB RW:RWF SA:SAR SB:SBD
SC:SCR SD:SDG SE:SEK SG:SGD SH:SHP SI:EUR SJ:NOK SK:EUR SL:SLE SM:EUR SN:XOF SO:SOS SR:SRD SS:SSP ST:STN SV:USD SX:XCG SY:SYP SZ:SZL
TC:USD TD:XAF TF:EUR TG:XOF TH:THB TJ:TJS TK:NZD TL:USD TM:TMT TN:TND TO:TOP TR:TRY TT:TTD TV:AUD TW:TWD TZ:TZS UA:UAH UG:UGX UM:USD
US:USD UY:UYU UZ:UZS VA:EUR VC:XCD VE:VES VG:USD VI:USD VN:VND VU:VUV WF:XPF WS:WST XK:EUR YE:YER YT:EUR ZA:ZAR ZM:ZMW ZW:ZWG
"""
COUNTRY_CURRENCY: dict[str, str] = dict(p.split(":") for p in _COUNTRIES.split())

_mem: dict = {"at": 0.0, "v": None}
_lock = asyncio.Lock()


def currency_for_country(country: str | None, rates: dict[str, float]) -> str | None:
    """Devise à proposer par défaut ; None si le pays est inconnu (le site affiche alors seulement le FCFA)."""
    if not country:
        return None
    code = COUNTRY_CURRENCY.get(country.upper(), "USD")
    return code if code in rates else ("USD" if "USD" in rates else None)


def parse(payload: dict) -> dict[str, float]:
    """Réponse de la source (base USD) → unités de chaque devise pour 1 FCFA. Lève ValueError si la réponse est inutilisable."""
    if not isinstance(payload, dict) or payload.get("result") != "success" or not isinstance(payload.get("rates"), dict):
        raise ValueError("réponse inattendue")
    raw = payload["rates"]
    xof = raw.get("XOF")
    if not isinstance(xof, (int, float)) or not math.isfinite(xof) or xof <= 0:
        raise ValueError("taux XOF absent")
    out = {}
    for code, v in raw.items():
        if isinstance(code, str) and len(code) == 3 and code.isalpha() and code.isupper() and isinstance(v, (int, float)) and math.isfinite(v) and v > 0:
            out[code] = float(v) / float(xof)
    if len(out) < 20:
        raise ValueError("trop peu de devises")
    return {**out, **PEGGED}


async def fetch_source() -> dict:
    async with httpx.AsyncClient(timeout=8, headers={"User-Agent": "Crushduo/1.0"}) as c:
        r = await c.get(SOURCE_URL)
        r.raise_for_status()
        return r.json()


def _fixed() -> dict:
    return {"rates": dict(PEGGED), "updatedAt": None, "source": "fixed"}


async def _stored(db: AsyncSession) -> dict | None:
    v = (await db.execute(select(SystemSetting.value).where(SystemSetting.key == KEY))).scalar_one_or_none()
    return v if isinstance(v, dict) and isinstance(v.get("rates"), dict) else None


async def _save(db: AsyncSession, value: dict) -> None:
    row = (await db.execute(select(SystemSetting).where(SystemSetting.key == KEY))).scalar_one_or_none()
    if row:
        row.value = value
    else:
        db.add(SystemSetting(key=KEY, value=value))
    await db.commit()


def _age(v: dict, field: str, now: datetime.datetime) -> datetime.timedelta | None:
    try:
        return now - datetime.datetime.fromisoformat(v[field])
    except (KeyError, TypeError, ValueError):
        return None


async def current(db: AsyncSession, fetch: Callable[[], Awaitable[dict]] | None = None, now: datetime.datetime | None = None,
                  use_memory: bool = True) -> dict:
    """Taux à afficher : {rates, updatedAt (ISO, heure de la source), source: "exchangerate-api" | "fixed"}."""
    if use_memory and _mem["v"] is not None and time.monotonic() - _mem["at"] < MEMORY_SECONDS:
        return _mem["v"]
    async with _lock:
        if use_memory and _mem["v"] is not None and time.monotonic() - _mem["at"] < MEMORY_SECONDS:
            return _mem["v"]
        now = now or utcnow()
        stored = await _stored(db)
        fetched_age = _age(stored, "fetchedAt", now) if stored else None
        failed_age = _age(stored, "failedAt", now) if stored else None
        fresh = fetched_age is not None and fetched_age < REFRESH
        if not fresh and (failed_age is None or failed_age >= RETRY):
            try:
                payload = await (fetch or fetch_source)()
                rates = parse(payload)
                ts = payload.get("time_last_update_unix")
                updated = datetime.datetime.fromtimestamp(ts, datetime.UTC).replace(tzinfo=None).isoformat() if isinstance(ts, (int, float)) else now.isoformat()
                stored = {"rates": rates, "updatedAt": updated, "fetchedAt": now.isoformat(), "source": "exchangerate-api"}
                await _save(db, stored)
            except Exception as e:  # source indisponible : on garde les derniers taux connus, ou la parité fixe
                log.warning("taux de change indisponibles : %s", e)
                if stored:
                    stored = {**stored, "failedAt": now.isoformat()}
                    await _save(db, stored)
        out = {"rates": {**stored["rates"], **PEGGED}, "updatedAt": stored.get("updatedAt"), "source": stored.get("source", "exchangerate-api")} if stored else _fixed()
        _mem.update(at=time.monotonic(), v=out)
        return out


def invalidate() -> None:
    _mem.update(at=0.0, v=None)
