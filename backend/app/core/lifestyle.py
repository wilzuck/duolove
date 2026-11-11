"""Mode de vie : situation, études, tabac, alcool, religion (facultatifs) et signe astrologique (calculé, jamais saisi)."""
import datetime

MARITAL = ("SINGLE", "DIVORCED", "WIDOWED", "SEPARATED")
EDUCATION = ("SECONDARY", "BACCALAUREATE", "BACHELOR", "MASTER", "DOCTORATE", "OTHER")
HABIT = ("NEVER", "SOMETIMES", "OFTEN")  # tabac, alcool
RELIGION = ("CHRISTIAN", "MUSLIM", "TRADITIONAL", "OTHER", "NONE")

# (mois, jour de début, signe) : le signe en vigueur est le dernier dont la date de début est passée.
_SIGNS = ((1, 20, "aquarius"), (2, 19, "pisces"), (3, 21, "aries"), (4, 20, "taurus"), (5, 21, "gemini"), (6, 21, "cancer"), (7, 23, "leo"),
          (8, 23, "virgo"), (9, 23, "libra"), (10, 23, "scorpio"), (11, 22, "sagittarius"), (12, 22, "capricorn"))


def zodiac(birth: datetime.date | datetime.datetime | None) -> str | None:
    """Signe du zodiaque occidental d'après la date de naissance (None si inconnue)."""
    if birth is None:
        return None
    sign = "capricorn"  # du 22 décembre au 19 janvier
    for month, day, name in _SIGNS:
        if (birth.month, birth.day) >= (month, day):
            sign = name
    return sign


# Valeurs « Ce qui compte le plus pour moi » : jusqu'à 3, choisies dans le catalogue ou écrites par la personne.
LIFE_VALUES = ("HONESTY", "RESPECT", "MINDFULNESS", "FAMILY", "LOYALTY", "KINDNESS", "HUMOR", "AMBITION", "FREEDOM", "GENEROSITY",
               "COMMUNICATION", "ADVENTURE", "CREATIVITY", "STABILITY", "GROWTH", "SPIRITUALITY")
MAX_LIFE_VALUES = 3
CUSTOM_MIN, CUSTOM_MAX = 2, 24


def clean_life_values(raw: list[str]) -> list[str]:
    """Liste nettoyée : codes du catalogue tels quels, valeurs libres normalisées (espaces, 2 à 24 caractères, sans lien ni coordonnées), sans doublon, 3 au plus."""
    from app.core.errors import bad_request

    out: list[str] = []
    for item in raw:
        v = " ".join(str(item).split())
        if v in LIFE_VALUES:
            key = v
        else:
            low = v.lower()
            if not CUSTOM_MIN <= len(v) <= CUSTOM_MAX or any(c in low for c in ("@", "http", "www.", ".com")) or any(ch.isdigit() for ch in v):
                raise bad_request("INVALID_LIFE_VALUE", f"Valeur libre : {CUSTOM_MIN} à {CUSTOM_MAX} caractères, sans chiffre ni lien")
            key = v
        if key.lower() not in {o.lower() for o in out}:
            out.append(key)
    if len(out) > MAX_LIFE_VALUES:
        raise bad_request("TOO_MANY_LIFE_VALUES", f"{MAX_LIFE_VALUES} valeurs au plus")
    return out
