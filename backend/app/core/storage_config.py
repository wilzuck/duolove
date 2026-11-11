"""Configuration du stockage des fichiers pilotée par l'administration (ligne `storage.config` de SystemSetting).

Priorité : la ligne en base (si elle existe) l'emporte ; sinon les variables d'environnement (STORAGE_DRIVER, S3_*).
La clé secrète saisie dans la console est chiffrée (Fernet) avec SETTINGS_ENCRYPTION_KEY, n'est jamais renvoyée au navigateur
(on n'expose que « présente ou non ») et n'est jamais écrite dans le journal d'audit."""
import base64
import hashlib
import ipaddress
import re
import time
from dataclasses import dataclass
from urllib.parse import urlsplit

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import bad_request, conflict
from app.models.models import SystemSetting

KEY = "storage.config"
TTL = 30.0
BUCKET_RE = re.compile(r"^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$")
PREFIX_RE = re.compile(r"^[A-Za-z0-9/_-]{0,64}$")
ACCESS_RE = re.compile(r"^[A-Za-z0-9]{8,128}$")
REGION_RE = re.compile(r"^[a-z0-9-]{1,32}$")


@dataclass(frozen=True)
class Effective:
    driver: str = "local"
    endpoint: str | None = None
    bucket: str | None = None
    region: str = "auto"
    prefix: str = ""
    access_key_id: str | None = None
    secret: str | None = None
    source: str = "env"  # « env » ou « db »
    backup_bucket: str | None = None  # bucket dédié aux sauvegardes de la base ; vide : le bucket des photos

    @property
    def backups_bucket(self) -> str | None:
        return self.backup_bucket or self.bucket


_cache: dict = {"at": 0.0, "cfg": None}


def invalidate() -> None:
    _cache["cfg"] = None


def _fernet() -> Fernet:
    k = get_settings().settings_encryption_key
    if not k:
        raise conflict("ENCRYPTION_KEY_MISSING", "SETTINGS_ENCRYPTION_KEY n'est pas défini sur le serveur : impossible d'enregistrer un secret.")
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(k.encode()).digest()))


def encrypt(secret: str) -> str:
    return _fernet().encrypt(secret.encode()).decode()


def decrypt(token: str) -> str | None:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except (InvalidToken, Exception):  # clé de chiffrement changée ou absente : le secret est inutilisable, pas d'exception vers l'utilisateur
        return None


def from_env() -> Effective:
    s = get_settings()
    return Effective(driver=s.storage_driver.lower(), endpoint=s.s3_endpoint, bucket=s.s3_bucket, region=s.s3_region, prefix=s.s3_prefix,
                     access_key_id=s.s3_access_key_id, secret=s.s3_secret_access_key, source="env", backup_bucket=s.s3_backup_bucket)


def _from_row(v: dict) -> Effective:
    sec = decrypt(v["secretEnc"]) if v.get("secretEnc") else None
    return Effective(driver=v.get("driver", "local"), endpoint=v.get("endpoint"), bucket=v.get("bucket"), region=v.get("region") or "auto",
                     prefix=v.get("prefix") or "", access_key_id=v.get("accessKeyId"), secret=sec, source="db", backup_bucket=v.get("backupBucket") or get_settings().s3_backup_bucket or None)


async def load_row(db: AsyncSession) -> dict | None:
    r = (await db.execute(select(SystemSetting.value).where(SystemSetting.key == KEY))).scalar_one_or_none()
    return r if isinstance(r, dict) else None


async def effective() -> Effective:
    """Configuration active, relue en base au plus toutes les 30 s (et immédiatement après un enregistrement)."""
    if _cache["cfg"] is not None and time.monotonic() - _cache["at"] < TTL:
        return _cache["cfg"]
    from app.db.session import session_maker

    try:
        async with session_maker()() as db:
            row = await load_row(db)
    except Exception:  # base momentanément indisponible : on garde la dernière configuration connue, sinon l'environnement
        return _cache["cfg"] or from_env()
    cfg = _from_row(row) if row else from_env()
    _cache["cfg"], _cache["at"] = cfg, time.monotonic()
    return cfg


def mask(access_key_id: str | None) -> str | None:
    return None if not access_key_id else ("•" * 8 + access_key_id[-4:])


def public_view(cfg: Effective) -> dict:
    return {"source": cfg.source, "driver": cfg.driver, "endpoint": cfg.endpoint, "bucket": cfg.bucket, "region": cfg.region, "prefix": cfg.prefix, "backupBucket": cfg.backup_bucket,
            "accessKeyIdMasked": mask(cfg.access_key_id), "hasSecret": bool(cfg.secret)}


def check_endpoint(endpoint: str) -> str:
    """HTTPS obligatoire ; refuse localhost et les adresses privées (le serveur ne doit pas pouvoir être orienté vers le réseau interne)."""
    u = urlsplit(endpoint.strip())
    host = (u.hostname or "").lower()
    if u.scheme != "https" or not host or u.username or u.password or u.path not in ("", "/") or u.query or u.fragment:
        raise bad_request("INVALID_ENDPOINT", "L'adresse doit être de la forme https://identifiant.r2.cloudflarestorage.com")
    if host == "localhost" or host.endswith((".local", ".internal", ".localhost")):
        raise bad_request("INVALID_ENDPOINT", "Adresse interne refusée")
    try:
        ip = ipaddress.ip_address(host)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            raise bad_request("INVALID_ENDPOINT", "Adresse interne refusée")
    except ValueError:
        pass
    return f"https://{host}" + (f":{u.port}" if u.port else "")


def validate(body: dict, existing: Effective | None) -> dict:
    """Valeurs normalisées (sans secret) ; 400 si une valeur est incorrecte. Le secret est traité à part."""
    driver = str(body.get("driver", "")).lower()
    if driver not in ("local", "s3"):
        raise bad_request("INVALID_DRIVER", "Pilote : local ou s3")
    if driver == "local":
        return {"driver": "local"}
    endpoint = check_endpoint(str(body.get("endpoint") or ""))
    bucket = str(body.get("bucket") or "").strip()
    region = str(body.get("region") or "auto").strip().lower()
    prefix = str(body.get("prefix") or "").strip().strip("/")
    backup_bucket = str(body.get("backupBucket") or "").strip()
    access = str(body.get("accessKeyId") or "").strip() or (existing.access_key_id if existing else None) or ""
    if not BUCKET_RE.match(bucket):
        raise bad_request("INVALID_BUCKET", "Nom de bucket invalide (minuscules, chiffres, points et tirets)")
    if backup_bucket and not BUCKET_RE.match(backup_bucket):
        raise bad_request("INVALID_BUCKET", "Nom du bucket de sauvegarde invalide (minuscules, chiffres, points et tirets)")
    if not REGION_RE.match(region):
        raise bad_request("INVALID_REGION", "Région invalide (« auto » pour Cloudflare R2)")
    if not PREFIX_RE.match(prefix):
        raise bad_request("INVALID_PREFIX", "Préfixe invalide")
    if not ACCESS_RE.match(access):
        raise bad_request("INVALID_ACCESS_KEY", "Identifiant de clé d'accès invalide")
    return {"driver": "s3", "endpoint": endpoint, "bucket": bucket, "region": region, "prefix": prefix, "accessKeyId": access, "backupBucket": backup_bucket or None}


def check_secret(secret: str) -> str:
    s = secret.strip()
    if not 16 <= len(s) <= 256 or re.search(r"\s", s):
        raise bad_request("INVALID_SECRET", "Clé secrète invalide")
    return s
