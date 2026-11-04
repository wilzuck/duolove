"""Garde-fou : les constantes partagées avec le web (packages/types/src/index.ts) et leur copie Python ne dérivent pas."""
import re
from pathlib import Path

from app.core import constants as c

TS = (Path(__file__).resolve().parents[2] / "packages/types/src/index.ts").read_text()


def ts_list(name: str) -> list[str]:
    m = re.search(rf"export const {name} = \[(.*?)\] as const", TS, re.S)
    assert m, name
    return re.findall(r"'([^']+)'", m.group(1))


def test_simple_lists_match_ts():
    for ts_name, py in [("GENDERS", c.GENDERS), ("SEEKING", c.SEEKING), ("INTENTS", c.INTENTS), ("PLAN_CODES", c.PLAN_CODES),
                        ("REPORT_REASONS", c.REPORT_REASONS), ("INTEREST_SLUGS", c.INTEREST_SLUGS), ("LIVING", c.LIVING),
                        ("TRI", c.TRI), ("CREDIT_TYPES", c.CREDIT_TYPES)]:
        assert ts_list(ts_name) == list(py), ts_name


def test_countries_match_ts():
    assert re.findall(r"\{ code: '([A-Z]{2})'", TS) == list(c.COUNTRY_CODES)


def test_flags_match_ts():
    ts = re.findall(r"\{ key: '(\w+)', category: '(\w+)', defaultOn: (true|false), emergency: (true|false) \}", TS)
    py = [(f.key, f.category, str(f.default_on).lower(), str(f.emergency).lower()) for f in c.FEATURE_FLAGS]
    assert ts == py


def test_numeric_constants_match_ts():
    live = dict(re.findall(r"^\s+([A-Z_]+): (\d+),", TS[TS.index("export const LIVE"):TS.index("export const liveCriteriaSchema")], re.M))
    for k, v in live.items():
        assert getattr(c.LIVE, k) == int(v), k
    ref = re.search(r"export const REFERRAL = \{([^}]*)\}", TS).group(1)
    for k, v in re.findall(r"([A-Z_]+): (\d+)", ref):
        assert getattr(c.REFERRAL, k) == int(v), k
    disc = re.search(r"DEFAULT_DISCOUNTS[^=]*= \{([^}]*)\}", TS).group(1)
    assert {int(k): int(v) for k, v in re.findall(r"(\d+): (\d+)", disc)} == c.DEFAULT_DISCOUNTS
    assert [int(x) for x in re.findall(r"\d+", re.search(r"DURATION_MONTHS = \[([^\]]*)\]", TS).group(1))] == list(c.DURATION_MONTHS)


def test_default_plans_match_ts():
    for code in c.PLAN_CODES:
        block = re.search(rf"  {code}: \{{ name: '([^']+)', priceXof: (\d+), featured: (true|false), sortOrder: (\d+), features: \{{([^}}]*)\}}", TS)
        assert block, code
        d = c.DEFAULT_PLANS[code]
        assert (block.group(1), int(block.group(2)), block.group(3) == "true", int(block.group(4))) == (d["name"], d["priceXof"], d["featured"], d["sortOrder"])
        feats = {k: (v == "true" if v in ("true", "false") else int(v)) for k, v in re.findall(r"(\w+): (-?\w+)", block.group(5))}
        assert feats == d["features"], code
