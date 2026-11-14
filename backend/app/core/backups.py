"""Sauvegarde de la base PostgreSQL vers le stockage objet (R2) : noyau commun au cron (scripts/backup_db.py) et à la page admin « Sauvegardes ».
Rotation : 7 quotidiennes, 4 hebdomadaires, 6 mensuelles, jamais moins de 3. Les sauvegardes contiennent toutes les données personnelles : bucket privé,
téléchargement réservé aux administrateurs (mot de passe redemandé, journal d'audit, lien de 5 minutes)."""
from __future__ import annotations

import asyncio
import datetime
import hashlib
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from sqlalchemy import select

STATUS_KEY = "backup.status"
STALE_HOURS = 26  # au-delà, la page admin signale qu'une sauvegarde manque
RUN_TIMEOUT_MIN = 30  # une exécution « en cours » plus ancienne est considérée comme perdue
LINK_SECONDS = 300


PREFIX = "backups/db/"
NAME_RE = re.compile(r"duomatch-(\d{8})-(\d{6})\.dump$")
KEEP_DAILY, KEEP_WEEKLY, KEEP_MONTHLY, KEEP_MIN = 7, 4, 6, 3
MIN_BYTES = 2048  # une sauvegarde plus petite est forcément vide ou tronquée


def backup_name(now: datetime.datetime) -> str:
    return f"duomatch-{now:%Y%m%d-%H%M%S}.dump"


def parse_date(key: str) -> datetime.datetime | None:
    m = NAME_RE.search(key)
    return datetime.datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S") if m else None


def to_keep(keys: list[str]) -> set[str]:
    """Clés à conserver : 7 jours (la plus récente de chaque jour), 4 dimanches, 6 mois (le 1er du mois ou, à défaut, la première du mois), et au moins les 3 plus récentes."""
    dated = sorted(((d, k) for k in keys if (d := parse_date(k))), reverse=True)
    keep: set[str] = {k for _, k in dated[:KEEP_MIN]}
    seen: dict[str, set] = {"d": set(), "w": set(), "m": set()}
    for d, k in dated:  # du plus récent au plus ancien : la première rencontrée de chaque jour / semaine / mois est la plus récente
        day, week, month = d.date().isoformat(), f"{d.isocalendar().year}-{d.isocalendar().week}", f"{d.year}-{d.month}"
        if day not in seen["d"] and len(seen["d"]) < KEEP_DAILY:
            seen["d"].add(day); keep.add(k)
        if week not in seen["w"] and len(seen["w"]) < KEEP_WEEKLY:
            seen["w"].add(week); keep.add(k)
        if month not in seen["m"] and len(seen["m"]) < KEEP_MONTHLY:
            seen["m"].add(month); keep.add(k)
    return keep


def dump(database_url: str, path: Path) -> None:
    """pg_dump au format custom (compressé), sans propriétaire ni droits : restaurable dans n'importe quelle base."""
    url = database_url.replace("postgresql+asyncpg://", "postgresql://").replace("postgresql+psycopg2://", "postgresql://")
    subprocess.run(["pg_dump", "--format=custom", "--no-owner", "--no-privileges", "--file", str(path), url], check=True, capture_output=True, text=True)
    if path.stat().st_size < MIN_BYTES:
        raise RuntimeError(f"sauvegarde suspecte : {path.stat().st_size} octets")
    subprocess.run(["pg_restore", "--list", str(path)], check=True, capture_output=True, text=True)  # le fichier doit être relisible


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def list_keys(client, bucket: str, prefix: str) -> list[str]:
    out, token = [], None
    while True:
        r = client.list_objects_v2(Bucket=bucket, Prefix=prefix, **({"ContinuationToken": token} if token else {}))
        out += [o["Key"] for o in r.get("Contents", [])]
        token = r.get("NextContinuationToken")
        if not r.get("IsTruncated"):
            return out


def run(client, bucket: str, base_prefix: str, database_url: str, now: datetime.datetime | None = None, dump_fn=dump) -> dict:
    """Une sauvegarde complète : envoi, vérification, rotation. `client` : client S3 (boto3) ou équivalent."""
    now = now or datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
    prefix = f"{base_prefix.strip('/')}/{PREFIX}" if base_prefix.strip("/") else PREFIX
    key = prefix + backup_name(now)
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "db.dump"
        dump_fn(database_url, path)
        size, digest = path.stat().st_size, sha256(path)
        client.upload_file(str(path), bucket, key, ExtraArgs={"Metadata": {"sha256": digest}})
    head = client.head_object(Bucket=bucket, Key=key)
    if head["ContentLength"] != size:
        raise RuntimeError(f"taille différente côté stockage ({head['ContentLength']} au lieu de {size}) : sauvegarde non fiable")
    keys = list_keys(client, bucket, prefix)
    drop = [k for k in keys if parse_date(k) and k not in to_keep(keys)]
    for i in range(0, len(drop), 1000):
        client.delete_objects(Bucket=bucket, Delete={"Objects": [{"Key": k} for k in drop[i:i + 1000]]})
    return {"key": key, "bytes": size, "sha256": digest, "kept": len(keys) - len(drop), "deleted": len(drop)}


# ───────── Copie des photos (fichiers des membres) vers le bucket de sauvegarde ─────────
PHOTOS_PREFIX = "backups/photos/"
DELETED_PREFIX = "backups/photos-deleted/"  # marque <AAAAMMJJ>/<clé> : date à laquelle la photo a disparu de la source
PHOTO_GRACE_DAYS = 30  # une photo supprimée par son membre reste 30 jours dans la sauvegarde (erreur, suppression accidentelle), puis est effacée
_SKIP = ("backups/", "healthcheck/")


def _root(base_prefix: str) -> str:
    return f"{base_prefix.strip('/')}/" if base_prefix.strip("/") else ""


def _sizes(client, bucket: str, prefix: str) -> dict[str, int]:
    out, token = {}, None
    while True:
        r = client.list_objects_v2(Bucket=bucket, Prefix=prefix, **({"ContinuationToken": token} if token else {}))
        out.update({o["Key"][len(prefix):]: o.get("Size", 0) for o in r.get("Contents", [])})
        token = r.get("NextContinuationToken")
        if not r.get("IsTruncated"):
            return out


def copy_photos(client, src_bucket: str, dst_bucket: str, base_prefix: str, now: datetime.datetime | None = None) -> dict:
    """Copie incrémentale des fichiers des membres (photos, miniatures, pièces jointes) vers `<préfixe>/backups/photos/` du bucket de sauvegarde.
    Copie côté serveur (rien ne transite par l'API), seulement les fichiers absents ou de taille différente. Une photo supprimée de la source
    est gardée PHOTO_GRACE_DAYS jours puis effacée de la sauvegarde (une photo retirée par son membre ne doit pas survivre indéfiniment)."""
    now = now or datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
    root = _root(base_prefix)
    src = {k: s for k, s in _sizes(client, src_bucket, root).items() if not k.startswith(_SKIP)}
    dst_root, marks_root = root + PHOTOS_PREFIX, root + DELETED_PREFIX
    dst = _sizes(client, dst_bucket, dst_root)
    copied = 0
    for k, size in src.items():
        if dst.get(k) != size:
            client.copy_object(Bucket=dst_bucket, Key=dst_root + k, CopySource={"Bucket": src_bucket, "Key": root + k})
            copied += 1
    marks: dict[str, tuple[str, datetime.datetime]] = {}  # clé → (clé de la marque, date de disparition)
    for mk in _sizes(client, dst_bucket, marks_root):
        day, _, k = mk.partition("/")
        try:
            marks[k] = (marks_root + mk, datetime.datetime.strptime(day, "%Y%m%d"))
        except ValueError:
            continue
    drop: list[str] = []
    orphans = [k for k in dst if k not in src]
    marked = purged = 0
    for k in orphans:
        if k not in marks:
            client.put_object(Bucket=dst_bucket, Key=f"{marks_root}{now:%Y%m%d}/{k}", Body=b"")
            marked += 1
        elif now - marks[k][1] >= datetime.timedelta(days=PHOTO_GRACE_DAYS):
            drop += [dst_root + k, marks[k][0]]
            purged += 1
    drop += [mk for k, (mk, _) in marks.items() if k in src]  # revenue dans la source : la marque ne sert plus
    for i in range(0, len(drop), 1000):
        client.delete_objects(Bucket=dst_bucket, Delete={"Objects": [{"Key": x} for x in drop[i:i + 1000]]})
    return {"files": len(src), "copied": copied, "pendingDeletion": len(orphans) - purged, "newlyDeleted": marked, "purged": purged}


def prefix_for(base_prefix: str) -> str:
    return f"{base_prefix.strip('/')}/{PREFIX}" if base_prefix.strip("/") else PREFIX


def list_backups(client, bucket: str, base_prefix: str) -> list[dict]:
    """Sauvegardes présentes (plus récente d'abord) : clé, nom, taille, date (d'après le nom du fichier)."""
    prefix, out, token = prefix_for(base_prefix), [], None
    while True:
        r = client.list_objects_v2(Bucket=bucket, Prefix=prefix, **({"ContinuationToken": token} if token else {}))
        for o in r.get("Contents", []):
            d = parse_date(o["Key"])
            if d:
                out.append({"key": o["Key"], "name": Path(o["Key"]).name, "bytes": o.get("Size", 0), "createdAt": d})
        token = r.get("NextContinuationToken")
        if not r.get("IsTruncated"):
            return sorted(out, key=lambda x: x["createdAt"], reverse=True)


def presign(client, bucket: str, key: str, seconds: int = LINK_SECONDS) -> str:
    """Lien de téléchargement direct depuis R2, valable `seconds` secondes."""
    return client.generate_presigned_url("get_object", Params={"Bucket": bucket, "Key": key, "ResponseContentDisposition": f'attachment; filename="{Path(key).name}"'}, ExpiresIn=seconds)


async def client_and_cfg():
    """Client S3 et configuration du stockage actif ; refus explicite si R2 n'est pas configuré (jamais de sauvegarde sur le disque du serveur)."""
    from app.core import storage, storage_config

    cfg = await storage_config.effective()
    if cfg.driver != "s3":
        raise RuntimeError("STORAGE_NOT_CONFIGURED")
    return storage._s3_client(cfg), cfg


async def get_status(db) -> dict:
    from app.models.models import SystemSetting

    v = (await db.execute(select(SystemSetting.value).where(SystemSetting.key == STATUS_KEY))).scalar_one_or_none()
    return v if isinstance(v, dict) else {}


async def set_status(value: dict) -> None:
    from app.db.session import session_maker
    from app.models.models import SystemSetting

    async with session_maker()() as db:
        row = (await db.execute(select(SystemSetting).where(SystemSetting.key == STATUS_KEY))).scalar_one_or_none()
        if row:
            row.value = value
        else:
            db.add(SystemSetting(key=STATUS_KEY, value=value))
        await db.commit()


def is_running(status: dict, now: datetime.datetime | None = None) -> bool:
    r = status.get("running")
    if not r:
        return False
    since = datetime.datetime.fromisoformat(r["since"])
    return ((now or datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)) - since) < datetime.timedelta(minutes=RUN_TIMEOUT_MIN)


async def notify_failure(error: str) -> None:
    """E-mail aux administrateurs actifs quand une sauvegarde échoue (au mieux : un échec d'envoi n'en cache pas un autre)."""
    from app.core import mail
    from app.db.session import session_maker
    from app.models.models import User

    try:
        async with session_maker()() as db:
            to = list((await db.execute(select(User.email).where(User.role.in_(["ADMIN", "SUPER_ADMIN"]), User.status == "ACTIVE"))).scalars())
        for addr in to:
            await mail.send(addr, "Crushduo : une sauvegarde a échoué", f"Une sauvegarde (base de données ou photos) a échoué.\n\nErreur : {error[:500]}\n\nOuvrez l'administration > Sauvegardes pour relancer une sauvegarde et vérifier l'état.")
    except Exception:  # noqa: BLE001
        pass


async def mark_running(trigger: str) -> dict:
    """Enregistre « en cours » avant de répondre au clic : l'écran voit tout de suite l'exécution et un second clic est refusé. Renvoie l'état précédent."""
    from app.db.session import session_maker

    now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
    async with session_maker()() as db:
        prev = await get_status(db)
    await set_status({**prev, "running": {"since": now.isoformat(), "trigger": trigger}})
    return prev


async def run_and_record(trigger: str, database_url: str, dump_fn=None) -> dict:
    """Exécute une sauvegarde complète (hors boucle d'événements pour ne rien bloquer), enregistre le résultat et prévient les administrateurs en cas d'échec."""
    now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
    try:
        prev = await mark_running(trigger)
    except Exception:  # noqa: BLE001 — l'état est un confort : la sauvegarde elle-même passe avant
        prev = {}
    try:
        client, cfg = await client_and_cfg()
        r = await asyncio.to_thread(run, client, cfg.backups_bucket, cfg.prefix, database_url, None, dump_fn or dump)
        last = {"ok": True, "at": now.isoformat(), "trigger": trigger, "key": r["key"], "bytes": r["bytes"]}
        try:  # les photos ensuite : un échec ici n'annule pas la sauvegarde de la base, mais il est enregistré et signalé
            last["photos"] = await asyncio.to_thread(copy_photos, client, cfg.bucket, cfg.backups_bucket, cfg.prefix, now)
        except Exception as e:  # noqa: BLE001
            last["photos"] = {"error": (str(e) or type(e).__name__)[:300]}
    except Exception as e:  # noqa: BLE001 — tout échec est enregistré et notifié
        msg = (e.stderr.strip() if isinstance(e, subprocess.CalledProcessError) and e.stderr else str(e)) or type(e).__name__
        last = {"ok": False, "at": now.isoformat(), "trigger": trigger, "error": msg[:500]}
    await set_status({"last": last, **({"lastOk": last} if last["ok"] else ({"lastOk": prev["lastOk"]} if prev.get("lastOk") else {}))})
    if not last["ok"]:
        await notify_failure(last["error"])
    elif "error" in last.get("photos", {}):
        await notify_failure("copie des photos : " + last["photos"]["error"])  # après l'enregistrement : l'état s'affiche sans attendre l'envoi des e-mails
    return last


async def first_backup_loop(interval: float = 600.0) -> None:
    """Première sauvegarde automatique : dès que le stockage objet est actif et qu'aucune sauvegarde n'a jamais été tentée, en lance une (sans clic).
    Ensuite la sauvegarde de nuit prend le relais ; un échec est enregistré, notifié aux administrateurs, et n'est pas retenté en boucle."""
    from app.core import storage_config
    from app.core.config import get_settings
    from app.db.session import session_maker

    await asyncio.sleep(90)
    while True:
        try:
            cfg = await storage_config.effective()
            if cfg.driver == "s3" and shutil.which("pg_dump"):
                async with session_maker()() as db:
                    status = await get_status(db)
                if not status.get("last") and not is_running(status):
                    await run_and_record("auto", get_settings().database_url)
                    return
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 — base ou stockage momentanément indisponible : nouvel essai au prochain passage
            pass
        await asyncio.sleep(interval)
