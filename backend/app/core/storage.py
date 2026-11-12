"""Stockage des fichiers (dossier local ou stockage objet S3, selon STORAGE_DRIVER) et assainissement des images (format réel, EXIF appliqué puis supprimé, ré-encodage WebP)."""
import asyncio
import datetime
import io
import logging
import re
import secrets
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from app.core import storage_config
from app.core.config import get_settings
from app.core.errors import bad_request

KEY_RE = re.compile(r"^[a-z0-9][a-z0-9/_-]*\.webp$", re.I)
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
Image.MAX_IMAGE_PIXELS = 50_000_000


def _root() -> Path:
    return Path(get_settings().upload_dir).resolve()


def _resolve(key: str) -> Path:
    if not KEY_RE.match(key) or ".." in key:
        raise bad_request("INVALID_KEY")
    return _root() / key


_clients: dict = {}


def _s3_client(cfg: storage_config.Effective):
    """Client S3 mis en cache par configuration ; échoue clairement si elle est incomplète (jamais de repli silencieux vers le disque en écriture)."""
    missing = [n for n, v in (("bucket", cfg.bucket), ("clé d'accès", cfg.access_key_id), ("clé secrète", cfg.secret)) if not v]
    if missing:
        raise RuntimeError("Stockage objet : configuration incomplète (" + ", ".join(missing) + ")")
    k = (cfg.endpoint, cfg.region, cfg.access_key_id, cfg.secret)
    if k not in _clients:
        import boto3
        from botocore.config import Config

        _clients.clear()  # une seule configuration active à la fois
        _clients[k] = boto3.client("s3", endpoint_url=cfg.endpoint or None, region_name=cfg.region, aws_access_key_id=cfg.access_key_id,
                                   aws_secret_access_key=cfg.secret, config=Config(signature_version="s3v4", retries={"max_attempts": 3, "mode": "standard"},
                                                                                    connect_timeout=5, read_timeout=20))
    return _clients[k]


def _s3_key(cfg: storage_config.Effective, key: str) -> str:
    if not KEY_RE.match(key) or ".." in key:
        raise bad_request("INVALID_KEY")
    prefix = cfg.prefix.strip("/")
    return f"{prefix}/{key}" if prefix else key


def _is_missing(e) -> bool:
    return e.response.get("Error", {}).get("Code") in ("NoSuchKey", "404", "NotFound")


async def put(key: str, data: bytes) -> None:
    cfg = await storage_config.effective()
    if cfg.driver == "s3":
        k = _s3_key(cfg, key)
        await asyncio.to_thread(lambda: _s3_client(cfg).put_object(Bucket=cfg.bucket, Key=k, Body=data, ContentType="image/webp"))
        return
    f = _resolve(key)

    def _w() -> None:
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(data)

    await asyncio.to_thread(_w)


def _read_local(key: str) -> bytes | None:
    try:
        return _resolve(key).read_bytes()
    except FileNotFoundError:
        return None


def _s3_get(cfg: storage_config.Effective, key: str) -> bytes | None:
    from botocore.exceptions import ClientError

    try:
        return _s3_client(cfg).get_object(Bucket=cfg.bucket, Key=_s3_key(cfg, key))["Body"].read()
    except ClientError as e:
        if _is_missing(e):
            # Migration : une photo pas encore copiée dans le bucket reste servie depuis le disque.
            return _read_local(key)
        raise


async def get(key: str) -> bytes | None:
    cfg = await storage_config.effective()
    if cfg.driver == "s3":
        return await asyncio.to_thread(_s3_get, cfg, key)
    return await asyncio.to_thread(_read_local, key)  # None : un fichier absent se traduit par un 404 chez l'appelant


async def delete(key: str) -> None:
    cfg = await storage_config.effective()
    if cfg.driver == "s3":
        k = _s3_key(cfg, key)
        await asyncio.to_thread(lambda: _s3_client(cfg).delete_object(Bucket=cfg.bucket, Key=k))  # idempotent
    f = _resolve(key)  # supprime aussi une éventuelle copie locale non migrée
    await asyncio.to_thread(lambda: f.unlink(missing_ok=True))


async def probe(cfg: storage_config.Effective, bucket: str | None = None) -> None:
    """Écrit, relit puis supprime un fichier d'essai avec CETTE configuration. Lève AppError avec un message clair (jamais le secret)."""
    from botocore.exceptions import BotoCoreError, ClientError

    key = f"healthcheck/probe-{secrets.token_hex(6)}.webp"
    payload = secrets.token_bytes(32)
    target = bucket or cfg.bucket

    def _run() -> None:
        c = _s3_client(cfg)
        k = _s3_key(cfg, key)
        c.put_object(Bucket=target, Key=k, Body=payload, ContentType="image/webp")
        got = c.get_object(Bucket=target, Key=k)["Body"].read()
        c.delete_object(Bucket=target, Key=k)
        if got != payload:
            raise RuntimeError("relecture différente")

    try:
        await asyncio.to_thread(_run)
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        msgs = {"NoSuchBucket": "Le bucket n'existe pas", "InvalidAccessKeyId": "Identifiant de clé d'accès refusé", "SignatureDoesNotMatch": "Clé secrète refusée",
                "AccessDenied": "Droits insuffisants : la clé doit pouvoir lire, écrire et supprimer dans ce bucket", "403": "Accès refusé"}
        raise bad_request("STORAGE_TEST_FAILED", msgs.get(code, f"Le stockage a refusé la requête ({code or 'erreur'})")) from None
    except RuntimeError:
        raise bad_request("STORAGE_TEST_FAILED", "Le test d'écriture a échoué") from None
    except (BotoCoreError, OSError):
        raise bad_request("STORAGE_TEST_FAILED", "Connexion impossible : vérifiez l'adresse du stockage") from None


def local_keys() -> list[str]:
    root = _root()
    if not root.exists():
        return []
    keys = [f.relative_to(root).as_posix() for f in root.rglob("*.webp") if f.is_file()]
    return sorted(k for k in keys if KEY_RE.match(k) and not k.startswith("healthcheck/"))


def _local_objects() -> list[dict]:
    root = _root()
    if not root.exists():
        return []
    out = []
    for f in root.rglob("*.webp"):
        k = f.relative_to(root).as_posix()
        if f.is_file() and KEY_RE.match(k):
            st = f.stat()
            out.append({"key": k, "size": st.st_size, "modified": datetime.datetime.fromtimestamp(st.st_mtime, datetime.timezone.utc)})
    return out


def _s3_objects(cfg: storage_config.Effective) -> list[dict]:
    prefix = cfg.prefix.strip("/")
    base = f"{prefix}/" if prefix else ""
    out = []
    for page in _s3_client(cfg).get_paginator("list_objects_v2").paginate(Bucket=cfg.bucket, Prefix=base):
        for o in page.get("Contents", []):
            k = o["Key"][len(base):]
            if KEY_RE.match(k) and ".." not in k:
                out.append({"key": k, "size": o["Size"], "modified": o["LastModified"]})
    return out


async def list_objects() -> list[dict]:
    """Toutes les images stockées (clé, taille, date), sur le disque et, si actif, dans le bucket. `healthcheck/` exclu."""
    cfg = await storage_config.effective()
    found = {o["key"]: o for o in await asyncio.to_thread(_local_objects)}
    if cfg.driver == "s3":
        for o in await asyncio.to_thread(_s3_objects, cfg):
            found[o["key"]] = o
    return sorted((o for k, o in found.items() if not k.startswith("healthcheck/")), key=lambda o: o["key"])


async def migrate_local(cfg: storage_config.Effective, budget_seconds: float = 20.0) -> dict:
    """Copie vers le bucket les fichiers du disque qui n'y sont pas encore, dans la limite du temps imparti (rappelable jusqu'à remaining = 0).
    Les fichiers locaux ne sont jamais supprimés ici : la suppression du volume reste une décision humaine, après vérification."""
    import time

    def _run() -> dict:
        c = _s3_client(cfg)
        prefix = cfg.prefix.strip("/")
        present: set[str] = set()
        for page in c.get_paginator("list_objects_v2").paginate(Bucket=cfg.bucket, Prefix=(prefix + "/") if prefix else ""):
            for o in page.get("Contents", []):
                present.add(o["Key"][len(prefix) + 1:] if prefix else o["Key"])
        todo = [k for k in local_keys() if k not in present]
        deadline = time.monotonic() + budget_seconds
        copied = errors = 0
        for k in todo:
            if time.monotonic() > deadline:
                break
            try:
                c.put_object(Bucket=cfg.bucket, Key=_s3_key(cfg, k), Body=_resolve(k).read_bytes(), ContentType="image/webp")
                copied += 1
            except Exception:  # un fichier en échec n'arrête pas les autres ; il est recompté dans « remaining »
                errors += 1
        return {"copied": copied, "errors": errors, "remaining": len(todo) - copied, "localTotal": len(local_keys()), "inBucket": len(present) + copied}

    return await asyncio.to_thread(_run)


_wake = asyncio.Event()
_log = logging.getLogger("duomatch.storage")


def request_migration() -> None:
    """Réveille la copie automatique (après l'activation du stockage objet) sans attendre le prochain passage."""
    _wake.set()


async def auto_migrate_once() -> dict | None:
    """Un passage : si le stockage objet est actif et que des fichiers du disque n'y sont pas, en copie un lot. Ne supprime jamais rien du disque."""
    cfg = await storage_config.effective()
    if cfg.driver != "s3" or not await asyncio.to_thread(local_keys):
        return None
    r = await migrate_local(cfg)
    if r["copied"] or r["errors"]:
        _log.info("copie automatique vers le stockage objet : %s copiés, %s en échec, %s restants", r["copied"], r["errors"], r["remaining"])
    return r


async def auto_migrate_loop(interval: float = 600.0) -> None:
    """Copie en continu, en tâche de fond, les photos du disque vers le stockage objet : plus aucune action manuelle après l'activation.
    Passage immédiat à l'activation (request_migration), puis toutes les `interval` secondes ; enchaîne les lots tant qu'il en reste."""
    await asyncio.sleep(30)
    while True:
        try:
            while (r := await auto_migrate_once()) and r["remaining"] > 0 and r["copied"] > 0:
                pass
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 — réseau ou R2 indisponible : on réessaie au prochain passage
            _log.exception("copie automatique vers le stockage objet interrompue")
        try:
            await asyncio.wait_for(_wake.wait(), interval)
        except asyncio.TimeoutError:
            pass
        _wake.clear()


@dataclass
class ProcessedImage:
    full: bytes
    thumb: bytes
    width: int
    height: int


def _process(data: bytes, thumb_size: tuple[int, int] = (480, 600)) -> ProcessedImage:
    try:
        img = Image.open(io.BytesIO(data))
        fmt = img.format
        img.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise bad_request("INVALID_IMAGE", "Fichier image illisible") from None
    if fmt not in ALLOWED_FORMATS:
        raise bad_request("UNSUPPORTED_IMAGE_FORMAT", "Formats acceptés : JPEG, PNG, WebP")
    base = ImageOps.exif_transpose(img).convert("RGB")  # l'ré-encodage supprime toutes les métadonnées (GPS inclus)
    full = base.copy()
    full.thumbnail((1600, 1600))
    buf = io.BytesIO()
    full.save(buf, "WEBP", quality=82)
    thumb = ImageOps.fit(base, thumb_size)
    tbuf = io.BytesIO()
    thumb.save(tbuf, "WEBP", quality=75)
    return ProcessedImage(buf.getvalue(), tbuf.getvalue(), full.width, full.height)


async def process_image(data: bytes, thumb_size: tuple[int, int] = (480, 600)) -> ProcessedImage:
    return await asyncio.to_thread(_process, data, thumb_size)
