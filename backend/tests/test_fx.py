"""Prix dans la devise du visiteur : taux du jour (base USD → par FCFA), parités fixes, cache, panne de la source, devise devinée par pays."""
import datetime

import pytest
from sqlalchemy import delete

from app.core import fx
from app.models.models import SystemSetting

NOW = datetime.datetime(2026, 11, 14, 12, 0, 0)


def payload(xof=600.0, **extra):
    rates = {"USD": 1, "XOF": xof, "EUR": 0.92, "NGN": 1500.0, "GBP": 0.78, "XAF": 601.0, "GHS": 12.0, **extra}
    rates.update({f"Q{c}{c}": 1.0 for c in "ABCDEFGHIJKLMNOPQRS"})  # assez de devises pour une réponse crédible
    return {"result": "success", "time_last_update_unix": 1794787200, "rates": rates}


@pytest.fixture
async def clean(db):
    await db.execute(delete(SystemSetting).where(SystemSetting.key == fx.KEY))
    await db.commit()
    fx.invalidate()
    yield
    await db.execute(delete(SystemSetting).where(SystemSetting.key == fx.KEY))
    await db.commit()
    fx.invalidate()


def test_conversion_depuis_la_base_usd_et_parites_fixes():
    r = fx.parse(payload())
    assert r["NGN"] == pytest.approx(2.5)  # 1500 / 600
    assert r["GBP"] == pytest.approx(0.0013)
    # Parités officielles, prioritaires sur la cotation du marché.
    assert r["EUR"] == pytest.approx(1 / 655.957) and r["XAF"] == 1.0 and r["XOF"] == 1.0
    assert 2500 * r["EUR"] == pytest.approx(3.81, abs=0.01)


@pytest.mark.parametrize("bad", [{}, {"result": "error"}, {"result": "success", "rates": {"USD": 1}}, {"result": "success", "rates": {"USD": 1, "XOF": 0}}])
def test_reponse_inutilisable_refusee(bad):
    with pytest.raises(ValueError):
        fx.parse(bad)


def test_valeurs_aberrantes_ignorees():
    r = fx.parse(payload(BAD=-1, nan=float("nan"), LONGER=2))
    assert "BAD" not in r and "nan" not in r and "LONGER" not in r


def test_devise_devinee_par_pays():
    rates = fx.parse(payload())
    assert fx.currency_for_country("FR", rates) == "EUR"
    assert fx.currency_for_country("bj", rates) == "XOF"
    assert fx.currency_for_country("CM", rates) == "XAF"
    assert fx.currency_for_country("NG", rates) == "NGN"
    assert fx.currency_for_country("CA", rates) == "USD"  # CAD absent des taux : dollar américain
    assert fx.currency_for_country(None, rates) is None
    assert set(fx.COUNTRY_CURRENCY.values()) >= {"XOF", "XAF", "EUR", "USD"} and len(fx.COUNTRY_CURRENCY) > 240


@pytest.mark.asyncio
async def test_taux_gardes_12_h_puis_rafraichis(db, clean):
    calls = []

    async def fetch():
        calls.append(1)
        return payload(xof=600.0 if len(calls) == 1 else 500.0)

    a = await fx.current(db, fetch, NOW, use_memory=False)
    assert a["source"] == "exchangerate-api" and a["rates"]["NGN"] == pytest.approx(2.5) and a["updatedAt"].startswith("2026-11-")
    await fx.current(db, fetch, NOW + datetime.timedelta(hours=11), use_memory=False)
    assert len(calls) == 1
    b = await fx.current(db, fetch, NOW + datetime.timedelta(hours=12), use_memory=False)
    assert len(calls) == 2 and b["rates"]["NGN"] == pytest.approx(3.0)


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
    assert r["rates"]["NGN"] == pytest.approx(2.5) and len(calls) == 1
    await fx.current(db, down_counted, later + datetime.timedelta(minutes=10), use_memory=False)
    assert len(calls) == 1
    await fx.current(db, down_counted, later + datetime.timedelta(minutes=31), use_memory=False)
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_route_publique(http, clean, monkeypatch):
    async def ok():
        return payload()

    monkeypatch.setattr(fx, "fetch_source", ok)
    r = await http.get("/api/fx", headers={"cf-ipcountry": "NG"})
    assert r.status_code == 200
    body = r.json()
    assert body["country"] == "NG" and body["detected"] == "NGN" and body["rates"]["XOF"] == 1.0
    r = await http.get("/api/fx")  # hors Cloudflare : pas de devise proposée
    assert r.json()["detected"] is None and r.json()["country"] is None
