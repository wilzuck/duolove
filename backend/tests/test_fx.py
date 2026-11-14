"""Prix dans la devise du visiteur : taux BCE (base euro → par FCFA), parités fixes, devises des pays ouverts seulement, cache, panne, devise devinée par pays."""
import datetime

import pytest
from sqlalchemy import delete

from app.core import fx
from app.models.models import SystemSetting

NOW = datetime.datetime(2026, 11, 14, 12, 0, 0)


def payload(cad=1.5, **extra):
    rates = {"USD": 1.1, "CAD": cad, "GBP": 0.85, "CHF": 0.93, **extra}
    rates.update({f"Q{c}{c}": 1.0 for c in "ABCDEFGHIJ"})  # assez de devises pour une réponse crédible
    return {"amount": 1.0, "base": "EUR", "date": "2026-11-13", "rates": rates}


@pytest.fixture
async def clean(db):
    await db.execute(delete(SystemSetting).where(SystemSetting.key == fx.KEY))
    await db.commit()
    fx.invalidate()
    yield
    await db.execute(delete(SystemSetting).where(SystemSetting.key == fx.KEY))
    await db.commit()
    fx.invalidate()


def test_conversion_depuis_la_base_euro_et_parites_fixes():
    r = fx.parse(payload())
    assert r["CAD"] == pytest.approx(1.5 / 655.957)
    assert 2500 * r["CAD"] == pytest.approx(5.72, abs=0.01)
    # Parités officielles, prioritaires sur la cotation du marché.
    assert r["EUR"] == pytest.approx(1 / 655.957) and r["XAF"] == 1.0 and r["XOF"] == 1.0
    assert 2500 * r["EUR"] == pytest.approx(3.81, abs=0.01)


@pytest.mark.parametrize("bad", [{}, {"base": "USD", "rates": {f"Q{c}{c}": 1 for c in "ABCDEFGHIJKL"}}, {"base": "EUR", "rates": {"CAD": 1.5}}, {"base": "EUR", "rates": "x"}])
def test_reponse_inutilisable_refusee(bad):
    with pytest.raises(ValueError):
        fx.parse(bad)


def test_valeurs_aberrantes_ignorees():
    r = fx.parse(payload(BAD=-1, nan=float("nan"), LONGER=2))
    assert "BAD" not in r and "nan" not in r and "LONGER" not in r and r["XOF"] == 1.0


def test_devise_devinee_par_pays_et_limitee_aux_pays_ouverts():
    rates = fx.parse(payload())
    assert fx.currency_for_country("FR", rates) == "EUR"
    assert fx.currency_for_country("bj", rates) == "XOF"
    assert fx.currency_for_country("CM", rates) == "XAF"
    assert fx.currency_for_country("CA", rates) == "CAD"
    assert fx.currency_for_country("NG", rates) is None  # naira absent des taux BCE : FCFA
    assert fx.currency_for_country(None, rates) is None
    open_ = fx.for_countries(rates, ["BJ", "CI", "FR", "BE", "CA", "CD"])
    assert set(open_) == {"XOF", "EUR", "CAD"}  # franc congolais sans taux BCE : non proposé
    assert set(fx.for_countries(rates, ["SN"])) == {"XOF"}
    assert set(fx.COUNTRY_CURRENCY.values()) >= {"XOF", "XAF", "EUR", "USD"} and len(fx.COUNTRY_CURRENCY) > 240


@pytest.mark.asyncio
async def test_taux_gardes_12_h_puis_rafraichis(db, clean):
    calls = []

    async def fetch():
        calls.append(1)
        return payload(cad=1.5 if len(calls) == 1 else 1.8)

    a = await fx.current(db, fetch, NOW, use_memory=False)
    assert a["source"] == "ecb" and a["rates"]["CAD"] == pytest.approx(1.5 / 655.957) and a["updatedAt"] == "2026-11-13"
    await fx.current(db, fetch, NOW + datetime.timedelta(hours=11), use_memory=False)
    assert len(calls) == 1
    b = await fx.current(db, fetch, NOW + datetime.timedelta(hours=12), use_memory=False)
    assert len(calls) == 2 and b["rates"]["CAD"] == pytest.approx(1.8 / 655.957)


@pytest.mark.asyncio
async def test_panne_de_la_source(db, clean):
    async def down():
        raise RuntimeError("hors service")

    # Jamais de taux enregistrés : seulement les parités fixes (FCFA, euro…).
    r = await fx.current(db, down, NOW, use_memory=False)
    assert r["source"] == "fixed" and set(r["rates"]) == set(fx.PEGGED)

    async def ok():
        return payload()

    await fx.current(db, ok, NOW, use_memory=False)
    calls = []

    async def down_counted():
        calls.append(1)
        raise RuntimeError("hors service")

    # Taux périmés + source en panne : les derniers taux restent affichés, nouvel essai seulement 30 min plus tard.
    later = NOW + datetime.timedelta(hours=13)
    r = await fx.current(db, down_counted, later, use_memory=False)
    assert r["rates"]["CAD"] == pytest.approx(1.5 / 655.957) and len(calls) == 1
    await fx.current(db, down_counted, later + datetime.timedelta(minutes=10), use_memory=False)
    assert len(calls) == 1
    await fx.current(db, down_counted, later + datetime.timedelta(minutes=31), use_memory=False)
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_route_publique(http, clean, monkeypatch):
    async def ok():
        return payload()

    monkeypatch.setattr(fx, "fetch_source", ok)
    r = await http.get("/api/fx", headers={"cf-ipcountry": "FR"})
    assert r.status_code == 200
    body = r.json()
    assert body["country"] == "FR" and body["rates"]["XOF"] == 1.0 and "GBP" not in body["rates"]  # devises des pays ouverts seulement
    assert body["detected"] == ("EUR" if "EUR" in body["rates"] else None)
    assert (await http.get("/api/fx", headers={"cf-ipcountry": "GB"})).json()["detected"] is None  # pays non ouvert : FCFA
    r = await http.get("/api/fx")  # hors Cloudflare : pas de devise proposée
    assert r.json()["detected"] is None and r.json()["country"] is None


@pytest.mark.asyncio
async def test_taux_d_une_ancienne_source_remplaces(db, clean):
    db.add(SystemSetting(key=fx.KEY, value={"rates": {"XOF": 1.0, "NGN": 2.0}, "updatedAt": "2026-11-14", "fetchedAt": NOW.isoformat(), "source": "exchangerate-api"}))
    await db.commit()

    async def ok():
        return payload()

    r = await fx.current(db, ok, NOW, use_memory=False)
    assert r["source"] == "ecb" and "CAD" in r["rates"]
