"""Régénère les fichiers des photos de démonstration (clés `photos/5eed…`) qui existent en base mais plus sur le disque.
Usage : PYTHONPATH=. .venv/bin/python scripts/restore_seed_photos.py   (dev uniquement : ne touche jamais aux photos réelles des membres)"""
import asyncio
from pathlib import Path

from sqlalchemy import select

from app.core.config import get_settings
from app.db.session import dispose, session_maker
from app.models.models import Profile, ProfilePhoto
from scripts.seed import avatar

assert get_settings().node_env != "production", "script de développement"


async def main() -> None:
    root = Path(get_settings().upload_dir).resolve()
    async with session_maker()() as db:
        rows = (await db.execute(select(ProfilePhoto.key, Profile.displayName).join(Profile, Profile.id == ProfilePhoto.profileId)
                                 .where(ProfilePhoto.key.like("photos/5eed%")))).all()
    restored = 0
    for i, (key, name) in enumerate(rows):
        if not (root / key).exists():
            avatar(name, i, key)
            restored += 1
    print(f"{restored} photo(s) régénérée(s) sur {len(rows)} photo(s) de démonstration")
    await dispose()


asyncio.run(main())
