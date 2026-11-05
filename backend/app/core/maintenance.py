"""Tâches de fond horaires (instance unique ; plusieurs instances → cron avec verrou) : suppression des comptes jamais confirmés."""
import asyncio
import logging

from app.core import authsvc

log = logging.getLogger(__name__)


async def purge_loop(maker, every: int = 3600) -> None:
    while True:
        await asyncio.sleep(every)
        try:
            async with maker() as db:
                n = await authsvc.purge_unverified(db)
                if n:
                    log.info("comptes non confirmés supprimés : %s", n)
        except Exception:
            log.exception("purge des comptes non confirmés")
