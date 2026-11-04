"""Les dates sont stockées en UTC sans fuseau : on les sérialise au format ISO 8601 avec millisecondes et « Z »
(2026-11-04T10:00:00.000Z), exactement comme l'ancienne API, pour que le front ne voie aucune différence."""
import datetime

from fastapi import encoders


def iso(d: datetime.datetime) -> str:
    if d.tzinfo is not None:
        d = d.astimezone(datetime.timezone.utc).replace(tzinfo=None)
    return d.isoformat(timespec="milliseconds") + "Z"


def install() -> None:
    encoders.ENCODERS_BY_TYPE[datetime.datetime] = iso
