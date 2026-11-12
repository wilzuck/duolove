"""Images orphelines : fichiers du stockage qu'aucune ligne de la base ne référence (téléversement abandonné, ancienne couverture, ligne supprimée).

Sûreté : on ne propose et on ne supprime jamais une image plus récente que `MIN_AGE_HOURS` (un téléversement en cours n'est pas encore rattaché),
et la suppression revérifie l'état « orphelin » au moment de supprimer."""
from __future__ import annotations

import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.core.errors import bad_request
from app.core.ids import utcnow
from app.models.models import BlogPost, Message, ModerationStatus, MessageAttachment, Profile, ProfilePhoto, User, VerificationRequest

MIN_AGE_HOURS = 24
MAX_DELETE = 200


def thumb_of(key: str) -> str:
    return key.replace(".webp", "_t.webp")


def base_of(key: str) -> str:
    """Clé de l'image principale pour une miniature (`x_t.webp` → `x.webp`), sinon la clé elle-même."""
    return key[: -len("_t.webp")] + ".webp" if key.endswith("_t.webp") else key


def kind_of(key: str) -> str:
    for prefix, kind in (("blog/", "blog"), ("photos/", "photo"), ("private/verifications/", "verification"), ("private/chat/", "chat")):
        if key.startswith(prefix):
            return kind
    return "other"


async def referenced_keys(db: AsyncSession) -> set[str]:
    """Clés réellement utilisées, miniatures comprises. Une ligne qui ne sert plus à rien n'est PAS comptée comme référence :
    pièce jointe d'un message supprimé ou refusée, photo ou selfie d'un compte supprimé (la ligne reste parfois en base alors que le fichier n'est plus servi)."""
    queries = (
        select(BlogPost.coverKey).where(BlogPost.coverKey.is_not(None)),
        select(ProfilePhoto.key).join(Profile, Profile.id == ProfilePhoto.profileId).join(User, User.id == Profile.userId).where(User.status != "DELETED"),
        select(VerificationRequest.selfieKey).join(User, User.id == VerificationRequest.userId).where(User.status != "DELETED"),
        select(MessageAttachment.key).join(Message, Message.id == MessageAttachment.messageId)
        .where(Message.deletedAt.is_(None), MessageAttachment.moderationStatus != ModerationStatus.REJECTED),
    )
    keys: set[str] = set()
    for q in queries:
        for (k,) in (await db.execute(q)).all():
            if k:
                keys.add(k)
                keys.add(thumb_of(k))
    return keys


async def _raw(db: AsyncSession, min_age_hours: int) -> tuple[dict[str, dict], int, int, int]:
    """(orphelines par clé, fichiers analysés, référencés, trop récents) — miniatures incluses."""
    refs = await referenced_keys(db)
    objs = await storage.list_objects()
    limit = utcnow().replace(tzinfo=datetime.timezone.utc) - datetime.timedelta(hours=min_age_hours)
    orphans, young, referenced = {}, 0, 0
    for o in objs:
        if o["key"] in refs:
            referenced += 1
            continue
        mod = o["modified"] if o["modified"].tzinfo else o["modified"].replace(tzinfo=datetime.timezone.utc)
        if mod > limit:
            young += 1
            continue
        orphans[o["key"]] = {**o, "modified": mod}
    return orphans, len(objs), referenced, young


async def scan(db: AsyncSession, min_age_hours: int = MIN_AGE_HOURS) -> dict:
    """Une ligne par image : sa miniature orpheline est rattachée à l'image principale (taille cumulée)."""
    raw, scanned, referenced, young = await _raw(db, min_age_hours)
    items, total = [], 0
    for k, o in raw.items():
        if k.endswith("_t.webp") and base_of(k) in raw:
            continue  # affichée avec son image principale
        t = raw.get(thumb_of(k)) if not k.endswith("_t.webp") else None
        size = o["size"] + (t["size"] if t else 0)
        total += size
        items.append({"key": k, "kind": kind_of(k), "size": size, "modifiedAt": o["modified"].isoformat(), "thumb": k.endswith("_t.webp")})
    return {"items": items, "count": len(items), "totalSize": total, "scanned": scanned, "referenced": referenced, "tooRecent": young, "minAgeHours": min_age_hours}


async def delete_orphans(db: AsyncSession, keys: list[str], min_age_hours: int = MIN_AGE_HOURS) -> dict:
    """Supprime les clés demandées (et leur miniature) qui sont TOUJOURS orphelines et assez anciennes ; les autres sont ignorées."""
    if len(keys) > MAX_DELETE:
        raise bad_request("TOO_MANY_KEYS", f"{MAX_DELETE} images au maximum par suppression")
    raw, *_ = await _raw(db, min_age_hours)
    deleted, skipped, freed = [], [], 0
    for k in dict.fromkeys(keys):
        if k not in raw:
            skipped.append(k)
            continue
        for victim in (k, thumb_of(k)):
            if victim in raw:
                await storage.delete(victim)
                freed += raw[victim]["size"]
        deleted.append(k)
    return {"deleted": deleted, "skipped": skipped, "freedBytes": freed}
