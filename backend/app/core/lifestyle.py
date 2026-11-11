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
